import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Attaches req.id for log correlation. Reuses X-Request-Id if the caller
// (e.g. a load balancer or test harness) already supplied one.
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers['x-request-id'] as string | undefined) || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

export default requestId;
