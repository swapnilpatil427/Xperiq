// Visual AI API. Mounted at /api/visual.
// POST /chart-spec — natural language → chart spec (Crystal chart generation).
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { serverError, clientError } = require('../lib/httpError');
const { generateChartSpec } = require('../lib/chartSpec');
const { buildReportHtml } = require('../lib/visualReport');
const { z } = require('zod');

const router = express.Router();

const chartSpecSchema = z.object({
  request: z.string().min(1).max(500),
  fields: z.array(z.object({
    key: z.string(), label: z.string().optional(), kind: z.enum(['metric', 'dimension']),
  })).optional(),
});

// The metric/dimension fields available org-wide (drives field resolution + UI hints).
const DEFAULT_FIELDS = [
  { key: 'nps', label: 'NPS', kind: 'metric' },
  { key: 'csat', label: 'CSAT', kind: 'metric' },
  { key: 'responses', label: 'Responses', kind: 'metric' },
  { key: 'sentiment', label: 'Sentiment', kind: 'metric' },
  { key: 'day', label: 'Day', kind: 'dimension' },
  { key: 'survey', label: 'Survey', kind: 'dimension' },
  { key: 'topic', label: 'Topic', kind: 'dimension' },
];

router.get('/fields', requireAuth, (req, res) => {
  res.json({ fields: DEFAULT_FIELDS });
});

router.post('/chart-spec', requireAuth, validate(chartSpecSchema), async (req, res) => {
  try {
    const fields = req.body.fields || DEFAULT_FIELDS;
    const spec = generateChartSpec(req.body.request, fields);
    res.json({ spec });
  } catch (err) {
    serverError(res, err, { endpoint: 'visual_chart_spec' });
  }
});

// GET /api/visual/report/:surveyId — self-contained HTML insight report (printable to PDF).
router.get('/report/:surveyId', requireAuth, async (req, res) => {
  try {
    const { rows: [survey] } = await db.query(
      `SELECT id, title FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [req.params.surveyId, req.orgId]
    );
    if (!survey) return clientError(res, 404, 'Survey not found');

    const { rows: [m] } = await db.query(
      `SELECT nps, csat, response_count FROM survey_metric_snapshots
        WHERE survey_id = $1 AND org_id = $2 ORDER BY captured_at DESC LIMIT 1`,
      [req.params.surveyId, req.orgId]
    );
    const { rows: topics } = await db.query(
      `SELECT name, dominant_emotion AS sentiment, volume FROM survey_topics
        WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
        ORDER BY volume DESC LIMIT 8`,
      [req.params.surveyId, req.orgId]
    ).catch(() => ({ rows: [] }));

    const num = (v) => (v == null ? null : Number(v));
    const metrics = m
      ? { nps: num(m.nps), csat: num(m.csat), responseCount: m.response_count }
      : {};
    const summary = m && m.nps != null
      ? `This survey is at NPS ${num(m.nps)} across ${m.response_count ?? 0} responses.`
      : '';

    const html = buildReportHtml({ survey, metrics, topics, summary });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    serverError(res, err, { endpoint: 'visual_report' });
  }
});

module.exports = router;
