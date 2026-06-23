import type { Response } from 'express';
import logger from './logger';

/**
 * Send a client-facing 4xx error. Message is shown to the caller.
 */
function clientError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * Log a server error with structured context and send a safe generic message.
 * Never leaks internal error details (stack traces, DB messages) to the caller.
 */
function serverError(res: Response, err: Error, context: Record<string, unknown> = {}): void {
  logger.error({ ...context, err: err.message, stack: err.stack }, 'request error');
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

export { clientError, serverError };
