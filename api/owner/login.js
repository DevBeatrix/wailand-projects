/**
 * API endpoint: POST /api/owner/login
 */
const { ensureDb } = require('../_lib/db');
const { loginLimiter, sessionMiddleware, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const { email, password } = req.body || {};
    const db = await ensureDb();
    if (!db.verifyOwner(email || '', password || '')) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.ownerId = 'owner';
    db.logLine('info', 'Owner login', { email });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withMiddleware(handler, sessionMiddleware, loginLimiter);
