/**
 * Support System — public + internal routes.
 *
 *   GET  /api/support/docs              — list live docs (paginated, filterable)
 *   GET  /api/support/docs/:key         — single doc by key slug
 *   GET  /api/support/changelog         — paginated release notes, newest first
 *   GET  /api/support/known-issues      — active platform issues
 *   GET  /api/support/roadmap           — structured product roadmap JSON
 *   GET  /api/support/status            — system health snapshot
 *   GET  /api/support/account           — requireAuth: org tickets + recent activity
 *   POST /api/support/tickets           — requireAuth: create escalation ticket
 *   GET  /api/support/tickets           — requireAuth: list org tickets
 *   POST /api/support/feedback          — requireAuth: submit doc feedback
 *   POST /api/support/contact           — PUBLIC: contact form (no auth)
 *   POST /api/support/public-feedback   — PUBLIC: doc feedback from support site (no auth)
 *   POST /api/support/crystal           — PUBLIC: Crystal AI Q&A for support site (no auth)
 *   POST /api/support/internal/refresh-doc      — requireInternalKey: upsert doc
 *   POST /api/support/internal/ingest-changelog — requireInternalKey: upsert changelog
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireInternalKey } from '../middleware/internalKey';
import { validate } from '../lib/validate';
import { serverError } from '../lib/httpError';
import { query } from '../lib/db';
import { getRedisClient } from '../lib/redis';
import { searchSupportDocs } from '../lib/supportSearch';
import { chat } from '../lib/openrouter';
import {
  PublicContactSchema,
  PublicDocFeedbackSchema,
  CreateTicketSchema,
  DocFeedbackSchema,
  InternalRefreshDocSchema,
  InternalIngestChangelogSchema,
  SearchDocsQuerySchema,
} from '../schemas/support';

const router = express.Router();

// ── GET /docs ─────────────────────────────────────────────────────────────────
router.get('/docs', async (req: Request, res: Response): Promise<void> => {
  try {
    // If a search query is provided, use FTS / vector search
    if (req.query.q) {
      const parsed = SearchDocsQuerySchema.safeParse({
        q:        req.query.q,
        category: req.query.category,
        limit:    req.query.limit,
        page:     req.query.page,
      });
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
        return;
      }
      const { q, category, limit, page } = parsed.data;
      const offset = (page - 1) * limit;
      const results = await searchSupportDocs(q, null, limit, category);

      // Separate count query for pagination total
      const countParams: unknown[] = [q];
      let countSql = `
        SELECT COUNT(*)::text AS total
          FROM support_docs
         WHERE deleted_at IS NULL
           AND pipeline_status = 'live'
           AND to_tsvector('english', title || ' ' || content)
               @@ plainto_tsquery('english', $1)
      `;
      if (category) {
        countParams.push(category);
        countSql += ` AND category = $${countParams.length}`;
      }
      const { rows: countRows } = await query<{ total: string }>(countSql, countParams);
      res.json({ docs: results, total: Number(countRows[0]?.total ?? 0), page, limit, offset });
      return;
    }

    // Browse path (no search query)
    const limit    = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const page     = Math.max(1, Number(req.query.page) || 1);
    const offset   = (page - 1) * limit;
    const category = req.query.category as string | undefined;

    const params: unknown[]      = [limit, offset];
    const countParams: unknown[] = [];
    let sql = `
      SELECT id, key, title, content, content_html, category,
             source_type, quality_score, published_at, created_at, updated_at
        FROM support_docs
       WHERE deleted_at IS NULL
         AND pipeline_status = 'live'
    `;
    let countSql = `
      SELECT COUNT(*)::text AS total
        FROM support_docs
       WHERE deleted_at IS NULL
         AND pipeline_status = 'live'
    `;

    if (category) {
      params.push(category);
      countParams.push(category);
      sql      += ` AND category = $${params.length}`;
      countSql += ` AND category = $${countParams.length}`;
    }
    sql += ` ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT $1 OFFSET $2`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(sql, params),
      query<{ total: string }>(countSql, countParams),
    ]);

    res.json({ docs: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/support/docs' });
  }
});

// ── GET /docs/:key ────────────────────────────────────────────────────────────
// key is a URL-encoded slug like 'getting-started/surveys'
router.get('/docs/:key(*)', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = decodeURIComponent(req.params.key);
    const { rows } = await query(
      `SELECT id, key, title, content, content_html, category,
              source_type, quality_score, published_at, version, created_at, updated_at
         FROM support_docs
        WHERE key = $1
          AND pipeline_status = 'live'
          AND deleted_at IS NULL
        LIMIT 1`,
      [key]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'doc_not_found' });
      return;
    }
    res.json({ doc: rows[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/support/docs/:key' });
  }
});

// ── GET /changelog ────────────────────────────────────────────────────────────
router.get('/changelog', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const page   = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT id, version, released_at, summary, changes, source_sha, created_at
           FROM support_changelog
          ORDER BY released_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM support_changelog`),
    ]);

    res.json({ entries: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/support/changelog' });
  }
});

// ── GET /known-issues ─────────────────────────────────────────────────────────
router.get('/known-issues', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, title, description, severity, status,
              affected_features, workaround, created_at, updated_at
         FROM support_known_issues
        WHERE status != 'resolved'
          AND resolved_at IS NULL
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high'     THEN 2
            WHEN 'medium'   THEN 3
            WHEN 'low'      THEN 4
            ELSE 5
          END,
          created_at DESC`
    );
    res.json({ issues: rows });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/support/known-issues' });
  }
});

// ── GET /roadmap ──────────────────────────────────────────────────────────────
// Returns structured product roadmap JSON. Sections map to swim-lane categories;
// items use done=true → shipped, priority=P0/P1 → in_progress, P2 → planned.
router.get('/roadmap', (_req: Request, res: Response): void => {
  res.json({
    sections: [
      {
        title: 'Crystal Intelligence',
        items: [
          { text: 'Skill runtime & eval framework',                   done: true,  priority: 'P0' },
          { text: 'Action proposal tracking & closed-loop feedback',  done: true,  priority: 'P0' },
          { text: 'Enterprise admin & semantic router',               done: true,  priority: 'P1' },
          { text: 'Multi-turn memory & context window management',    done: false, priority: 'P1' },
          { text: 'Crystal skill marketplace',                        done: false, priority: 'P2' },
        ],
      },
      {
        title: 'Surveys & Data Collection',
        items: [
          { text: 'AI-powered survey design assistant',   done: false, priority: 'P1' },
          { text: 'Advanced branching logic builder',    done: false, priority: 'P1' },
          { text: 'Offline response collection mode',    done: false, priority: 'P2' },
        ],
      },
      {
        title: 'Platform & Infrastructure',
        items: [
          { text: 'Credit metering & billing system',              done: false, priority: 'P0' },
          { text: 'Observability stack (Prometheus + Grafana)',     done: true,  priority: 'P1' },
          { text: 'CX Cases & contacts platform',                  done: true,  priority: 'P1' },
          { text: 'Enterprise outreach & notifications (Novu)',    done: true,  priority: 'P1' },
          { text: 'Multi-region deployment readiness',             done: false, priority: 'P2' },
        ],
      },
      {
        title: 'Insights & Analytics',
        items: [
          { text: 'Predictive churn & sentiment models', done: false, priority: 'P1' },
          { text: 'Custom dashboard builder',            done: false, priority: 'P2' },
          { text: 'Real-time response streaming',        done: false, priority: 'P2' },
        ],
      },
    ],
  });
});

// ── GET /status ───────────────────────────────────────────────────────────────
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  let dbStatus    = 'degraded';
  let redisStatus = 'not_configured';
  let openIssues  = 0;

  try {
    await query('SELECT 1');
    dbStatus = 'operational';
  } catch { /* dbStatus stays 'degraded' */ }

  try {
    const r = getRedisClient();
    if (!r) {
      redisStatus = 'not_configured';
    } else {
      await r.ping();
      redisStatus = 'operational';
    }
  } catch {
    redisStatus = 'degraded';
  }

  try {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM support_known_issues
        WHERE status != 'resolved' AND resolved_at IS NULL`
    );
    openIssues = Number(rows[0]?.count ?? 0);
  } catch { /* openIssues stays 0 */ }

  const overallStatus = dbStatus === 'operational' ? 'operational' : 'degraded';
  res.json({
    status:     overallStatus,
    components: { database: dbStatus, redis: redisStatus },
    openIssues,
    timestamp:  new Date().toISOString(),
  });
});

// ── GET /account — requireAuth ────────────────────────────────────────────────
router.get('/account', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.orgId;

    const [ticketsResult, activityResult] = await Promise.all([
      query(
        `SELECT id, title, severity, status, created_at, updated_at
           FROM support_tickets
          WHERE org_id = $1
          ORDER BY created_at DESC
          LIMIT 10`,
        [orgId]
      ),
      query(
        `SELECT pe.id, pe.event_type, pe.actor_type, pe.created_at,
                sd.title AS doc_title, sd.key AS doc_key
           FROM support_pipeline_events pe
           JOIN support_docs sd ON sd.id = pe.doc_id
          WHERE sd.org_id = $1 OR sd.org_id = '__global__'
          ORDER BY pe.created_at DESC
          LIMIT 20`,
        [orgId]
      ),
    ]);

    res.json({ tickets: ticketsResult.rows, recentActivity: activityResult.rows });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/support/account', orgId: req.orgId });
  }
});

// ── POST /tickets — requireAuth ───────────────────────────────────────────────
router.post('/tickets', requireAuth, validate(CreateTicketSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { subject, body: bodyText, crystalContext, severity } = req.body as {
      subject: string;
      body: string;
      crystalContext?: Record<string, unknown>;
      severity: string;
    };
    const { rows } = await query(
      `INSERT INTO support_tickets
         (org_id, user_id, title, description, crystal_context, severity)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [
        req.orgId,
        req.userId,
        subject,
        bodyText,
        JSON.stringify(crystalContext ?? {}),
        severity,
      ]
    );
    res.status(201).json({ ticket: rows[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/support/tickets', orgId: req.orgId });
  }
});

// ── GET /tickets — requireAuth ────────────────────────────────────────────────
router.get('/tickets', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const page   = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT id, title, description, severity, status, resolution,
                assigned_to, resolved_at, created_at, updated_at
           FROM support_tickets
          WHERE org_id = $1
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [req.orgId, limit, offset]
      ),
      query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM support_tickets WHERE org_id = $1`,
        [req.orgId]
      ),
    ]);

    res.json({ tickets: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/support/tickets', orgId: req.orgId });
  }
});

// ── POST /feedback — requireAuth ──────────────────────────────────────────────
router.post('/feedback', requireAuth, validate(DocFeedbackSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { doc_key, type, comment } = req.body as {
      doc_key: string;
      type: string;
      comment?: string;
    };
    const { rows } = await query(
      `INSERT INTO support_doc_feedback
         (org_id, user_id, doc_key, type, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.orgId, req.userId, doc_key, type, comment ?? null]
    );
    res.status(201).json({ feedback: rows[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/support/feedback', orgId: req.orgId });
  }
});

// ── POST /contact — PUBLIC (no auth) ─────────────────────────────────────────
router.post('/contact', validate(PublicContactSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, subject, body, severity } = req.body as {
      name: string;
      email: string;
      subject: string;
      body: string;
      severity: string;
    };
    const { rows } = await query(
      `INSERT INTO support_tickets
         (org_id, user_id, title, description, crystal_context, severity)
       VALUES ('__public__', $1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [
        email,
        subject,
        body,
        JSON.stringify({ source: 'public_contact', name, email }),
        severity,
      ]
    );
    res.status(201).json({ ticket: rows[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/support/contact' });
  }
});

// ── POST /public-feedback — PUBLIC (no auth) ──────────────────────────────────
router.post('/public-feedback', validate(PublicDocFeedbackSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { doc_key, type, comment } = req.body as {
      doc_key: string;
      type: string;
      comment?: string;
    };
    const { rows } = await query(
      `INSERT INTO support_doc_feedback
         (org_id, user_id, doc_key, type, comment)
       VALUES ('__public__', 'anonymous', $1, $2, $3)
       RETURNING *`,
      [doc_key, type, comment ?? null]
    );
    res.status(201).json({ feedback: rows[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/support/public-feedback' });
  }
});

// ── POST /crystal — PUBLIC (no auth) ─────────────────────────────────────────
// Called by the support site's Crystal AI panel. Accepts a user question plus
// optional doc keys already found by client-side search, fetches doc content for
// context, then calls OpenRouter to produce a concise answer.
router.post('/crystal', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query: userQuery, context_docs } = req.body as {
      query?: string;
      context_docs?: string[];
    };

    if (!userQuery || typeof userQuery !== 'string' || userQuery.length > 1000) {
      res.status(400).json({ error: 'Invalid query' });
      return;
    }

    // Fetch doc content for context (up to 3 docs)
    let contextText = '';
    if (context_docs && context_docs.length > 0) {
      const keys = context_docs.slice(0, 3);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await query(
        `SELECT key, title, content
           FROM support_docs
          WHERE key IN (${placeholders})
            AND pipeline_status = 'live'
            AND deleted_at IS NULL`,
        keys
      );
      contextText = (rows as Array<{ key: string; title: string; content: string }>)
        .map(r => `## ${r.title}\n${r.content?.slice(0, 2000) || ''}`)
        .join('\n\n---\n\n');
    }

    const systemPrompt = `You are Crystal, an intelligent support assistant for Experient — an AI-powered experience intelligence platform. Answer user questions about the product concisely and helpfully. Use the provided documentation context when available. If you don't know the answer, suggest the user contact support at support@experient.ai.`;

    const userMessage = contextText
      ? `Documentation context:\n\n${contextText}\n\n---\n\nUser question: ${userQuery}`
      : `User question: ${userQuery}`;

    let answer = '';
    try {
      answer = await chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        undefined,
        'support-crystal',
        600,
      );
    } catch {
      // AI unavailable — fall through to doc-context fallback below
    }

    if (!answer && contextText) {
      answer = `Based on our documentation:\n\n${contextText.slice(0, 1500)}`;
    }

    if (!answer) {
      res.status(503).json({ error: 'AI unavailable' });
      return;
    }

    res.json({ answer });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/support/crystal' });
  }
});

// ── POST /internal/refresh-doc — requireInternalKey ──────────────────────────
router.post('/internal/refresh-doc', requireInternalKey, validate(InternalRefreshDocSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, title, content, contentHtml, category, sourceType, sourceRef, qualityScore, pipeline_status } = req.body as {
      key: string;
      title: string;
      content?: string;
      contentHtml?: string;
      category: string;
      sourceType?: string;
      sourceRef?: string;
      qualityScore?: number;
      pipeline_status?: string;
    };

    const resolvedStatus = pipeline_status ?? 'queued';

    const { rows } = await query<{ id: string; key: string; title: string; pipeline_status: string; updated_at: string }>(
      `INSERT INTO support_docs
         (org_id, key, title, content, content_html, category, source_type,
          source_ref, quality_score, pipeline_status)
       VALUES ('__global__', $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (key) DO UPDATE
         SET title           = EXCLUDED.title,
             content         = COALESCE(EXCLUDED.content, support_docs.content),
             content_html    = COALESCE(EXCLUDED.content_html, support_docs.content_html),
             category        = EXCLUDED.category,
             source_type     = COALESCE(EXCLUDED.source_type, support_docs.source_type),
             source_ref      = EXCLUDED.source_ref,
             quality_score   = EXCLUDED.quality_score,
             pipeline_status = EXCLUDED.pipeline_status,
             version         = support_docs.version + 1,
             updated_at      = NOW()
       RETURNING *`,
      [
        key,
        title,
        content ?? null,
        contentHtml ?? null,
        category,
        sourceType ?? null,
        sourceRef ?? null,
        qualityScore ?? null,
        resolvedStatus,
      ]
    );

    res.json({ doc: rows[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/support/internal/refresh-doc' });
  }
});

// ── POST /internal/ingest-changelog — requireInternalKey ─────────────────────
router.post('/internal/ingest-changelog', requireInternalKey, validate(InternalIngestChangelogSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { version, title, body: bodyText, releasedAt, summary, changes, sourceSha } = req.body as {
      version: string;
      title: string;
      body?: string;
      releasedAt?: string;
      summary?: string;
      changes: Array<{ type: string; title: string; description?: string }>;
      sourceSha?: string;
    };

    const resolvedSummary = summary ?? bodyText ?? '';

    const { rows } = await query<{ id: string; version: string; released_at: string }>(
      `INSERT INTO support_changelog
         (version, title, released_at, summary, changes, source_sha)
       VALUES ($1, $2, $3::timestamptz, $4, $5::jsonb, $6)
       ON CONFLICT (version) DO UPDATE
         SET title       = EXCLUDED.title,
             released_at = COALESCE(EXCLUDED.released_at, support_changelog.released_at),
             summary     = EXCLUDED.summary,
             changes     = EXCLUDED.changes,
             source_sha  = EXCLUDED.source_sha
       RETURNING *`,
      [version, title, releasedAt ?? null, resolvedSummary, JSON.stringify(changes), sourceSha ?? null]
    );

    res.json({ entry: rows[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/support/internal/ingest-changelog' });
  }
});

export default router;
