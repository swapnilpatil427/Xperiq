// SCIM bearer-token auth — completely separate from Clerk JWT auth.
// SCIM provisioners (Okta/Azure AD) are server processes; they present a bearer
// token issued in the admin console. On success: req.scimOrgId + req.scimTokenId.

import type { Request, Response, NextFunction } from 'express';
import * as db from '../lib/db';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyToken } = require('../lib/scimToken') as { verifyToken: (token: string, hash: string) => boolean };

interface ScimTokenRow {
  id: string;
  org_id: string;
  token_hash: string;
}

export function scimError(res: Response, status: number, detail: string): void {
  res.status(status).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: String(status),
    detail,
  });
}

export async function scimAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    scimError(res, 401, 'Missing or invalid authorization header');
    return;
  }
  const token = authHeader.slice(7);
  if (!token || token.length < 20) {
    scimError(res, 401, 'Invalid token format');
    return;
  }

  const tokenPrefix = token.slice(0, 8);
  try {
    const { rows } = await db.query<ScimTokenRow>(
      `SELECT id, org_id, token_hash FROM scim_tokens
        WHERE token_prefix = $1 AND is_active = TRUE`,
      [tokenPrefix]
    );
    const match = rows.find((r) => verifyToken(token, r.token_hash));
    if (!match) {
      scimError(res, 401, 'Token not found or invalid');
      return;
    }

    req.scimOrgId = match.org_id;
    req.scimTokenId = match.id;
    db.query('UPDATE scim_tokens SET last_used_at = NOW() WHERE id = $1', [match.id]).catch(() => {});
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require('../lib/logger') as { error: (obj: Record<string, unknown>) => void }).error({ event: 'scim_auth_error', err: message });
    } catch { console.error('SCIM auth error:', message); }
    scimError(res, 500, 'Internal server error');
  }
}
