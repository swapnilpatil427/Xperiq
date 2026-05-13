const logger = require('../lib/logger');
const { httpDuration, httpTotal } = require('../lib/metrics');

// Collapse UUIDs and numeric IDs so Prometheus cardinality stays low
function normalizeRoute(req) {
  const base = (req.route ? req.baseUrl + req.route.path : req.path)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id');
  return base || 'unknown';
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
