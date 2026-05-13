const { createClerkClient } = require('@clerk/backend');

// Dev bypass: set SKIP_AUTH=true in .env to skip token verification.
// req.userId = 'dev-user', req.orgId = 'dev-org'
async function requireAuth(req, res, next) {
  if (process.env.SKIP_AUTH === 'true') {
    req.userId = 'dev-user';
    req.orgId  = 'dev-org';
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }
    const token = authHeader.slice(7);
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const payload = await clerk.verifyToken(token);
    req.userId = payload.sub;
    req.orgId  = payload.org_id || payload.sub;
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
