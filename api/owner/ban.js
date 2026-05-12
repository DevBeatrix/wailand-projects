/**
 * API endpoint: POST /api/owner/ban
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, requireOwner, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const db = await ensureDb();
    const { email, banned } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    db.banUserByEmail(email, !!banned);
    db.logLine('warn', 'User ban toggled', { email, banned });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = withMiddleware(handler, sessionMiddleware, requireOwner);
