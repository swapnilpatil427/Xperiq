const { createClerkClient } = require('@clerk/backend');

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }
    const token = authHeader.slice(7);
    const payload = await clerk.verifyToken(token);
    req.userId = payload.sub;
    req.orgId = payload.org_id || payload.sub; // fall back to userId as orgId for personal workspaces
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
