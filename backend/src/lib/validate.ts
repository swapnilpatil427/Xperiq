import { ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Returns an Express middleware that validates req.body against a Zod schema.
 * On failure: 400 with { error: <first message>, errors: [<all messages>] }
 * On success: replaces req.body with the parsed (coerced/stripped) data.
 */
function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e) => {
        const path = e.path.join('.');
        return path ? `${path}: ${e.message}` : e.message;
      });
      res.status(400).json({ error: errors[0], errors });
      return;
    }
    req.body = result.data;
    next();
  };
}

export { validate };
