const { randomUUID } = require('crypto');

// Attaches req.id for log correlation. Reuses X-Request-Id if the caller
// (e.g. a load balancer or test harness) already supplied one.
function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

module.exports = requestId;
