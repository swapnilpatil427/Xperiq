const logger = require('./logger');

/**
 * Send a client-facing 4xx error. Message is shown to the caller.
 */
function clientError(res, status, message) {
  return res.status(status).json({ error: message });
}

/**
 * Log a server error with structured context and send a safe generic message.
 * Never leaks internal error details (stack traces, DB messages) to the caller.
 */
function serverError(res, err, context = {}) {
  logger.error({ ...context, err: err.message, stack: err.stack }, 'request error');
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = { clientError, serverError };
