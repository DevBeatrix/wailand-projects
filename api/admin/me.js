/**
 * API endpoint: GET /api/admin/me
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, requireAdmin, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const db = await ensureDb();
    const a = db.getAdminById(req.session.adminId);
    if (!a) return res.status(404).json({ error: 'Admin not found' });
    res.json({ id: a.id, name: a.name, email: a.email, points: a.points });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = withMiddleware(handler, sessionMiddleware, requireAdmin);
