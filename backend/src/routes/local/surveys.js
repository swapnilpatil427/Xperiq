const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validate } = require('../../lib/validate');
const { createSurveySchema, updateSurveySchema } = require('../../schemas/surveys');
const db = require('../../lib/db');
const { surveysCreated } = require('../../lib/metrics');
const router = express.Router();

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
ensureColumns().catch(console.error);

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
      // Filtered paginated results
      db.query(
        `SELECT s.*, COUNT(r.id)::int AS response_count
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO surveys
         (org_id, title, description, status, questions, created_by,
          survey_type_id, template_id, intent, thank_you_message)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9)
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
      ]
    );
    surveysCreated.inc({ type: survey_type_id || 'untyped' });
    res.status(201).json({ survey: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ── PUBLISH ───────────────────────────────────────────────────────────────────
// Sets published_at only on first publish (COALESCE preserves original timestamp on re-publish).
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

    const { rows } = await db.query(
      `UPDATE surveys
       SET status = 'active',
           updated_at = NOW(),
           updated_by = $3,
           published_at = COALESCE(published_at, NOW())
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
       RETURNING publish_token, published_at`,
      [req.params.id, req.orgId, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Survey not found' });
    res.json({ publishToken: rows[0].publish_token, publishedAt: rows[0].published_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
