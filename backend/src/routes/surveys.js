const express = require('express');
const crypto  = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../lib/validate');
const { createSurveySchema, updateSurveySchema } = require('../schemas/surveys');
const db = require('../lib/db');
const { surveysCreated } = require('../lib/metrics');
const logger = require('../lib/logger');
const agentsClient = require('../lib/agentsClient');
const { serverError } = require('../lib/httpError');
const { publishResponseEvent } = require('../lib/redisStream');
const { maybeAutoAnalyze }     = require('../triggers/autoAnalyze');
const router = express.Router();

// ── Password helpers (uses Node crypto — no external dep) ─────────────────────
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(plain, stored) {
  const [salt, hash] = stored.split(':');
  try {
    const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

// Migrate: add only what is intrinsic to a survey run.
// Template-derived fields (tags, estimated_minutes, intelligence, metrics) live on the template.
// Audit trail columns cover the full lifecycle of each survey.
async function ensureColumns() {
  const cols = [
    // Run context
    'ADD COLUMN IF NOT EXISTS template_id TEXT',
    'ADD COLUMN IF NOT EXISTS intent TEXT',
    'ADD COLUMN IF NOT EXISTS thank_you_message TEXT',
    // Audit trail
    'ADD COLUMN IF NOT EXISTS updated_by TEXT',
    'ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS insight_schedule_enabled BOOLEAN NOT NULL DEFAULT TRUE',
    // Launch settings
    'ADD COLUMN IF NOT EXISTS max_responses INT',
    'ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS allow_multiple_responses BOOLEAN NOT NULL DEFAULT TRUE',
    // Password protection
    'ADD COLUMN IF NOT EXISTS password_protected BOOLEAN NOT NULL DEFAULT FALSE',
    'ADD COLUMN IF NOT EXISTS password_hash TEXT',
    // Per-survey context for AI specialist routing
    `ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
  ];
  for (const col of cols) {
    await db.query(`ALTER TABLE surveys ${col}`).catch(() => {});
  }

  // Expand status CHECK constraint to include 'closed'.
  // Drop the old constraint (name varies), then add the new one idempotently.
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_status_check;
      ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_status_check1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `).catch(() => {});
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'surveys'::regclass
          AND conname = 'surveys_status_valid'
      ) THEN
        ALTER TABLE surveys
          ADD CONSTRAINT surveys_status_valid
          CHECK (status IN ('draft','active','paused','closed'));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `).catch(() => {});
}
ensureColumns().catch(err => logger.error({ err: err.message }, 'surveys:ensureColumns failed'));

// ── helpers ───────────────────────────────────────────────────────────────────

// Status → lifecycle timestamp mapping
const STATUS_TIMESTAMPS = {
  active: null,        // published_at is set on the /publish route, not here
  paused: 'paused_at',
  closed: 'closed_at',
};

// ── LIST — with server-side search, filter, sort, pagination ─────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      q, status, survey_type_id,
      sort_by = 'updated_at', sort_order = 'desc',
      page = '1', limit = '20',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitNum;

    const where = ['s.org_id = $1', 's.deleted_at IS NULL'];
    const vals  = [req.orgId];
    let i = 2;

    if (q && q.trim().length >= 2) {
      where.push(`(s.title ILIKE $${i} OR s.description ILIKE $${i})`);
      vals.push(`%${q.trim()}%`);
      i++;
    }

    const statusList = status ? status.split(',').filter(Boolean) : [];
    if (statusList.length > 0) {
      where.push(`s.status = ANY($${i}::text[])`);
      vals.push(statusList);
      i++;
    }

    const typeList = survey_type_id ? survey_type_id.split(',').filter(Boolean) : [];
    if (typeList.length > 0) {
      where.push(`s.survey_type_id = ANY($${i}::text[])`);
      vals.push(typeList);
      i++;
    }

    const ALLOWED_SORT = { updated_at: 's.updated_at', created_at: 's.created_at', title: 's.title', response_count: 'response_count' };
    const sortExpr = ALLOWED_SORT[sort_by] || 's.updated_at';
    const sortDir  = sort_order === 'asc' ? 'ASC' : 'DESC';
    const whereSQL = `WHERE ${where.join(' AND ')}`;

    const [statsRes, countRes, rowsRes] = await Promise.all([
      // Org-wide KPI stats (always unfiltered)
      db.query(
        `SELECT
           COUNT(s.id)::int                                          AS total_surveys,
           COUNT(s.id) FILTER (WHERE s.status = 'active')::int      AS active_surveys,
           COALESCE(SUM(rc.cnt), 0)::int                            AS total_responses,
           ROUND(AVG(s.nps_score)::numeric, 1)                      AS avg_nps
         FROM surveys s
         LEFT JOIN (SELECT survey_id, COUNT(*) AS cnt FROM responses GROUP BY survey_id) rc
               ON rc.survey_id = s.id
         WHERE s.org_id = $1 AND s.deleted_at IS NULL`,
        [req.orgId]
      ),
      // Filtered total count for pagination
      db.query(`SELECT COUNT(s.id)::int AS total FROM surveys s ${whereSQL}`, vals),
      // Filtered paginated results — includes 7-day response sparkline
      db.query(
        `SELECT s.*,
                COUNT(r.id)::int                                       AS response_count,
                COALESCE((
                  SELECT json_agg(d.cnt ORDER BY d.day)
                  FROM (
                    SELECT DATE_TRUNC('day', r2.submitted_at)          AS day,
                           COUNT(r2.id)::int                           AS cnt
                    FROM   responses r2
                    WHERE  r2.survey_id = s.id
                      AND  r2.submitted_at >= NOW() - INTERVAL '7 days'
                    GROUP BY day
                  ) d
                ), '[]'::json)                                          AS sparkline
         FROM surveys s
         LEFT JOIN responses r ON r.survey_id = s.id
         ${whereSQL}
         GROUP BY s.id
         ORDER BY ${sortExpr} ${sortDir}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limitNum, offset]
      ),
    ]);

    const total = countRes.rows[0].total;
    res.json({
      surveys:  rowsRes.rows,
      total,
      page:     pageNum,
      limit:    limitNum,
      hasMore:  offset + rowsRes.rows.length < total,
      stats:    statsRes.rows[0],
    });
  } catch (err) {    serverError(res, err);
  }
});

// ── GET ONE ───────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, COUNT(r.id)::int AS response_count
       FROM surveys s
       LEFT JOIN responses r ON r.survey_id = s.id
       WHERE s.id = $1 AND s.org_id = $2 AND s.deleted_at IS NULL
       GROUP BY s.id`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Survey not found' });
    res.json({ survey: rows[0] });
  } catch (err) {
    serverError(res, err);
  }
});

// ── CREATE ────────────────────────────────────────────────────────────────────
// Only survey-run fields are accepted; template-level data stays on the template.
router.post('/', requireAuth, requireRole('analyst'), validate(createSurveySchema), async (req, res) => {
  try {
    const {
      title,
      description,
      questions = [],
      survey_type_id,
      template_id,
      intent,
      thank_you_message,
      metadata,
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO surveys
         (org_id, title, description, status, questions, created_by,
          survey_type_id, template_id, intent, thank_you_message, metadata)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.orgId,
        title,
        description || null,
        JSON.stringify(questions),
        req.userId,
        survey_type_id || null,
        template_id || null,
        intent || null,
        thank_you_message || null,
        JSON.stringify(metadata || {}),
      ]
    );
    surveysCreated.inc({ type: survey_type_id || 'untyped' });
    res.status(201).json({ survey: rows[0] });
  } catch (err) {
    serverError(res, err);
  }
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
// Handles field updates and lifecycle status transitions.
router.put('/:id', requireAuth, requireRole('analyst'), validate(updateSurveySchema), async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      questions,
      survey_type_id,
      template_id,
      intent,
      thank_you_message,
      metadata,
    } = req.body;

    const sets = ['updated_at = NOW()', `updated_by = $${1}`];
    const vals = [req.userId];
    let i = 2;

    if (title             !== undefined) { sets.push(`title = $${i++}`);             vals.push(title); }
    if (description       !== undefined) { sets.push(`description = $${i++}`);       vals.push(description); }
    if (questions         !== undefined) { sets.push(`questions = $${i++}`);         vals.push(JSON.stringify(questions)); }
    if (survey_type_id    !== undefined) { sets.push(`survey_type_id = $${i++}`);    vals.push(survey_type_id); }
    if (template_id       !== undefined) { sets.push(`template_id = $${i++}`);       vals.push(template_id); }
    if (intent            !== undefined) { sets.push(`intent = $${i++}`);            vals.push(intent); }
    if (thank_you_message !== undefined) { sets.push(`thank_you_message = $${i++}`); vals.push(thank_you_message); }
    if (metadata          !== undefined) { sets.push(`metadata = $${i++}`);          vals.push(JSON.stringify(metadata)); }

    // Status transition — track lifecycle timestamps
    if (status !== undefined) {
      sets.push(`status = $${i++}`);
      vals.push(status);
      const tsCol = STATUS_TIMESTAMPS[status];
      if (tsCol) sets.push(`${tsCol} = NOW()`);
    }

    vals.push(req.params.id, req.orgId);
    const { rowCount } = await db.query(
      `UPDATE surveys SET ${sets.join(', ')}
       WHERE id = $${i++} AND org_id = $${i} AND deleted_at IS NULL`,
      vals
    );
    if (!rowCount) return res.status(404).json({ error: 'Survey not found' });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

// ── SOFT DELETE ───────────────────────────────────────────────────────────────
// Marks as deleted; data is retained for audit / accidental-delete recovery.
router.delete('/:id', requireAuth, requireRole('analyst'), async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE surveys SET deleted_at = NOW(), updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.orgId, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Survey not found' });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

// ── PUBLISH ───────────────────────────────────────────────────────────────────
// Sets published_at only on first publish (COALESCE preserves original timestamp on re-publish).
// Accepts optional launch settings: maxResponses, autoCloseAt, allowMultipleResponses.
router.post('/:id/publish', requireAuth, requireRole('analyst'), async (req, res) => {
  try {
    // Guard: must have at least one question before going live.
    const { rows: [check] } = await db.query(
      `SELECT jsonb_array_length(questions) AS qcount
       FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.orgId]
    );
    if (!check) return res.status(404).json({ error: 'Survey not found' });
    if (check.qcount === 0) {
      return res.status(400).json({ error: 'Cannot publish a survey with no questions. Add at least one question first.' });
    }

    const { maxResponses, autoCloseAt, allowMultipleResponses, passwordProtected, password } = req.body;

    // Validate maxResponses: must be a positive integer or null/undefined
    if (maxResponses !== undefined && maxResponses !== null) {
      const parsed = parseInt(maxResponses, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'maxResponses must be a positive integer.' });
      }
    }

    // Validate autoCloseAt: must be a future ISO date string or null/undefined
    if (autoCloseAt !== undefined && autoCloseAt !== null) {
      const closeDate = new Date(autoCloseAt);
      if (isNaN(closeDate.getTime())) {
        return res.status(400).json({ error: 'autoCloseAt must be a valid ISO date string.' });
      }
      if (closeDate <= new Date()) {
        return res.status(400).json({ error: 'autoCloseAt must be a future date.' });
      }
    }

    // Validate password protection
    if (passwordProtected && (!password || password.length < 4)) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const newPasswordHash = passwordProtected && password ? hashPassword(password) : null;

    const { rows } = await db.query(
      `UPDATE surveys
       SET status = 'active',
           updated_at = NOW(),
           updated_by = $3,
           published_at = COALESCE(published_at, NOW()),
           max_responses = COALESCE($4, max_responses),
           auto_close_at = COALESCE($5, auto_close_at),
           allow_multiple_responses = COALESCE($6, allow_multiple_responses),
           password_protected = COALESCE($7, password_protected),
           password_hash = CASE WHEN $7 = TRUE THEN COALESCE($8, password_hash)
                                WHEN $7 = FALSE THEN NULL
                                ELSE password_hash END
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
       RETURNING publish_token, published_at, max_responses, auto_close_at, allow_multiple_responses, password_protected`,
      [
        req.params.id,
        req.orgId,
        req.userId,
        maxResponses != null ? parseInt(maxResponses, 10) : null,
        autoCloseAt != null ? autoCloseAt : null,
        allowMultipleResponses != null ? allowMultipleResponses : null,
        passwordProtected != null ? Boolean(passwordProtected) : null,
        newPasswordHash,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Survey not found' });
    res.json({
      publishToken:           rows[0].publish_token,
      publishedAt:            rows[0].published_at,
      maxResponses:           rows[0].max_responses,
      autoCloseAt:            rows[0].auto_close_at,
      allowMultipleResponses: rows[0].allow_multiple_responses,
      passwordProtected:      rows[0].password_protected,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ── LAUNCH SETTINGS ───────────────────────────────────────────────────────────
// Updates launch settings on an existing survey (any status).
router.patch('/:id/launch-settings', requireAuth, requireRole('analyst'), async (req, res) => {
  try {
    const { maxResponses, autoCloseAt, allowMultipleResponses, passwordProtected, password } = req.body;

    // Validate maxResponses: must be a positive integer or null/undefined
    if (maxResponses !== undefined && maxResponses !== null) {
      const parsed = parseInt(maxResponses, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'maxResponses must be a positive integer.' });
      }
    }

    // Validate autoCloseAt: must be a valid ISO date string or null/undefined
    if (autoCloseAt !== undefined && autoCloseAt !== null) {
      const closeDate = new Date(autoCloseAt);
      if (isNaN(closeDate.getTime())) {
        return res.status(400).json({ error: 'autoCloseAt must be a valid ISO date string.' });
      }
    }

    if (passwordProtected && (!password || password.length < 4)) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const newPasswordHash2 = passwordProtected && password ? hashPassword(password) : null;

    const { rows } = await db.query(
      `UPDATE surveys
       SET updated_at = NOW(),
           updated_by = $3,
           max_responses = $4,
           auto_close_at = $5,
           allow_multiple_responses = COALESCE($6, allow_multiple_responses),
           password_protected = COALESCE($7, password_protected),
           password_hash = CASE WHEN $7 = TRUE THEN COALESCE($8, password_hash)
                                WHEN $7 = FALSE THEN NULL
                                ELSE password_hash END
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
       RETURNING id, max_responses, auto_close_at, allow_multiple_responses, password_protected`,
      [
        req.params.id,
        req.orgId,
        req.userId,
        maxResponses != null ? parseInt(maxResponses, 10) : null,
        autoCloseAt != null ? autoCloseAt : null,
        allowMultipleResponses != null ? allowMultipleResponses : null,
        passwordProtected != null ? Boolean(passwordProtected) : null,
        newPasswordHash2,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Survey not found' });
    res.json({
      maxResponses:           rows[0].max_responses,
      autoCloseAt:            rows[0].auto_close_at,
      allowMultipleResponses: rows[0].allow_multiple_responses,
      passwordProtected:      rows[0].password_protected,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ── Generate sample responses via AI agent ────────────────────────────────────
// POST /api/surveys/:id/generate-sample-responses
// Generates synthetic survey responses, stores them in the DB, and optionally
// triggers insight generation. The generated responses are indistinguishable
// from real ones in the DB — useful for demos, testing, and pre-launch seeding.
router.post('/:id/generate-sample-responses', requireAuth, async (req, res) => {
  try {
    const { id: surveyId } = req.params;
    const { count = 20, personaMix = 'realistic' } = req.body;

    // Validate inputs
    const parsedCount = Math.min(100, Math.max(1, parseInt(count, 10) || 20));
    const validMixes  = ['realistic', 'critical', 'positive', 'mixed'];
    const mix         = validMixes.includes(personaMix) ? personaMix : 'realistic';

    // Verify survey belongs to this org
    const { rows: [survey] } = await db.query(
      `SELECT id, title, intent, questions FROM surveys
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [surveyId, req.orgId]
    );
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const questions = Array.isArray(survey.questions) ? survey.questions : [];
    if (questions.length === 0) {
      return res.status(400).json({ error: 'Survey has no questions to generate responses for' });
    }

    // Call agents service — synchronous; may take 10-60s for large counts
    let generated;
    try {
      generated = await agentsClient.generateSampleResponses({
        surveyId,
        orgId:        req.orgId,
        surveyTitle:  survey.title,
        surveyIntent: survey.intent || null,
        questions,
        count:        parsedCount,
        personaMix:   mix,
      });
    } catch (agentErr) {
      logger.error({ err: agentErr.message, surveyId }, 'generate_sample_responses:agents_error');
      return res.status(502).json({ error: 'AI service failed to generate responses. Please try again.' });
    }

    const responseRows = generated.responses || [];
    if (responseRows.length === 0) {
      return res.status(502).json({ error: 'AI service returned no responses. Please try again.' });
    }

    // Bulk-insert generated responses
    let inserted = 0;
    const insertedIds = [];
    for (const resp of responseRows) {
      const answers  = Array.isArray(resp.answers) ? resp.answers : [];
      const npsScore = resp.nps_score != null ? parseInt(resp.nps_score, 10) : null;
      try {
        const { rows: [row] } = await db.query(
          `INSERT INTO responses (survey_id, org_id, answers, nps_score)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [surveyId, req.orgId, JSON.stringify(answers), Number.isFinite(npsScore) ? npsScore : null]
        );
        insertedIds.push(row.id);
        inserted++;
      } catch (insertErr) {
        logger.warn({ err: insertErr.message, surveyId }, 'generate_sample_responses:insert_warn');
      }
    }

    // Diagnostic: count answer types across all generated responses
    const answerTypeCounts = {};
    const openTextCount = { total: 0, nonEmpty: 0 };
    for (const resp of responseRows) {
      for (const ans of (resp.answers || [])) {
        answerTypeCounts[ans.type] = (answerTypeCounts[ans.type] || 0) + 1;
        if (ans.type === 'open_text' || ans.type === 'short_text') {
          openTextCount.total++;
          if (ans.value && typeof ans.value === 'string' && ans.value.trim().length > 5) {
            openTextCount.nonEmpty++;
          }
        }
      }
    }
    logger.info(
      { surveyId, orgId: req.orgId, requested: parsedCount, inserted,
        answerTypeCounts, openTextCount },
      'sample_responses_generated',
    );

    if (openTextCount.total > 0 && openTextCount.nonEmpty < openTextCount.total) {
      logger.warn(
        { surveyId, emptyOpenText: openTextCount.total - openTextCount.nonEmpty },
        'sample_responses:open_text_answers_empty_or_null — topics/sentiment may be skipped',
      );
    }

    // Publish to stream so the consumer triggers insight generation automatically
    if (inserted > 0) {
      if (process.env.REDIS_URL) {
        for (const responseId of insertedIds) {
          publishResponseEvent({ surveyId, orgId: req.orgId, responseId }).catch(() => {});
        }
      } else {
        maybeAutoAnalyze(surveyId, req.orgId).catch(() => {});
      }
    }
    res.json({ count: inserted, message: `Generated ${inserted} sample responses for "${survey.title}".` });
  } catch (err) {
    logger.error({ err: err.message }, 'generate_sample_responses:error');
    serverError(res, err);
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/:id/analytics', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    // Verify survey ownership
    const { rows: [survey] } = await db.query(
      'SELECT id, title FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [id, req.orgId],
    );
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Aggregate stats + NPS distribution + real completion rate
    const { rows: [agg] } = await db.query(
      `SELECT
         COUNT(*)::int                                          AS total_responses,
         ROUND(AVG(nps_score)::numeric, 1)                     AS avg_nps,
         COUNT(CASE WHEN nps_score >= 9 THEN 1 END)::int       AS promoters,
         COUNT(CASE WHEN nps_score BETWEEN 7 AND 8 THEN 1 END)::int AS passives,
         COUNT(CASE WHEN nps_score <= 6 AND nps_score IS NOT NULL THEN 1 END)::int AS detractors,
         COUNT(CASE WHEN EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(answers, '[]'::jsonb)) AS a
           WHERE a->>'value' IS NOT NULL
             AND a->>'value' NOT IN ('', 'null', '[]')
         ) THEN 1 END)::int AS completed_responses
       FROM responses
       WHERE survey_id = $1 AND org_id = $2`,
      [id, req.orgId],
    );

    // Responses per day — last 30 days
    const { rows: dailySeries } = await db.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('day', submitted_at), 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS count
       FROM responses
       WHERE survey_id = $1 AND org_id = $2
         AND submitted_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE_TRUNC('day', submitted_at)
       ORDER BY DATE_TRUNC('day', submitted_at)`,
      [id, req.orgId],
    );

    const total = agg.total_responses || 0;
    const nps   = agg.avg_nps != null ? parseFloat(agg.avg_nps) : null;

    const completionRate = total > 0
      ? Math.round((agg.completed_responses || 0) / total * 100)
      : 0;

    res.json({
      total_responses:  total,
      avg_nps:          nps,
      completion_rate:  completionRate,
      nps_distribution: {
        promoters:  agg.promoters  || 0,
        passives:   agg.passives   || 0,
        detractors: agg.detractors || 0,
      },
      responses_by_day: dailySeries,
    });
  } catch (err) {
    logger.error({ err: err.message, surveyId: id }, 'analytics:survey:error');
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
