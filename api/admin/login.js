/**
 * API endpoint: POST /api/admin/login
 */
const { ensureDb } = require('../_lib/db');
const { loginLimiter, sessionMiddleware, withMiddleware } = require('../_lib/middleware');
const bcrypt = require('bcryptjs');

async function handler(req, res) {
  try {
    const { email, password } = req.body || {};
    const db = await ensureDb();
    const admin = db.getAdminByEmail(email || '');
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password || '', admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.adminId = admin.id;
    db.logLine('info', 'Admin login', { email });
    res.json({ ok: true, name: admin.name });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = withMiddleware(handler, sessionMiddleware, loginLimiter);
