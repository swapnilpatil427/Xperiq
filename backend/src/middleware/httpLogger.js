const logger = require('../lib/logger');
const { httpDuration, httpTotal } = require('../lib/metrics');

// Collapse UUIDs and numeric IDs so Prometheus cardinality stays low.
// Use req.originalUrl (always the full path) rather than req.path which Express
// temporarily mutates to the prefix-stripped path when middleware fires under
// app.use('/mount', middleware). If the middleware returns 429 without calling
// next(), req.url is never restored, so req.path would read as "/" for any
// request whose path exactly equals the mount point (e.g. GET /api/surveys).
function normalizeRoute(req) {
  const raw = req.route
    ? req.baseUrl + req.route.path
    : (req.originalUrl || req.path).split('?')[0]; // strip query string
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id')
    || 'unknown';
}

function httpLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationS = Number(process.hrtime.bigint() - start) / 1e9;
    const route     = normalizeRoute(req);
    const status    = String(res.statusCode);
    const labels    = { method: req.method, route, status };

    const logData = {
      requestId: req.id,
      method:    req.method,
      route,
      status:    res.statusCode,
      ms:        Math.round(durationS * 1000),
      userId:    req.userId,
      orgId:     req.orgId,
    };

    if (res.statusCode >= 500)      logger.error(logData, 'request error');
    else if (res.statusCode >= 400) logger.warn(logData, 'request warning');
    else                            logger.info(logData, 'request');

    httpDuration.observe(labels, durationS);
    httpTotal.inc(labels);
  });

  next();
}

module.exports = httpLogger;
