// SCIM bearer-token auth — completely separate from Clerk JWT auth.
// SCIM provisioners (Okta/Azure AD) are server processes; they present a bearer
// token issued in the admin console. On success: req.scimOrgId + req.scimTokenId.
const db = require('../lib/db');
const { verifyToken } = require('../lib/scimToken');

function scimError(res, status, detail) {
  return res.status(status).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: String(status),
    detail,
  });
}

async function scimAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return scimError(res, 401, 'Missing or invalid authorization header');
  }
  const token = authHeader.slice(7);
  if (!token || token.length < 20) return scimError(res, 401, 'Invalid token format');

  const tokenPrefix = token.slice(0, 8);
  try {
    const { rows } = await db.query(
      `SELECT id, org_id, token_hash FROM scim_tokens
        WHERE token_prefix = $1 AND is_active = TRUE`,
      [tokenPrefix]
    );
    const match = rows.find((r) => verifyToken(token, r.token_hash));
    if (!match) return scimError(res, 401, 'Token not found or invalid');

    req.scimOrgId = match.org_id;
    req.scimTokenId = match.id;
    db.query('UPDATE scim_tokens SET last_used_at = NOW() WHERE id = $1', [match.id]).catch(() => {});
    next();
  } catch (err) {
    try { require('../lib/logger').error({ event: 'scim_auth_error', err: err.message }); }
    catch { console.error('SCIM auth error:', err.message); }
    return scimError(res, 500, 'Internal server error');
  }
}

module.exports = { scimAuth, scimError };
