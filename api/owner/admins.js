/**
 * API endpoints for owner admin management
 * GET /api/owner/admins - List admins
 * POST /api/owner/admins - Create admin
 * DELETE /api/owner/admins/[id] - Delete admin
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, requireOwner, withMiddleware } = require('../_lib/middleware');

// GET /api/owner/admins - List admins
async function listAdmins(req, res) {
  try {
    const db = await ensureDb();
    res.json(db.listAdmins());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/owner/admins - Create admin
async function createAdmin(req, res) {
  try {
    const db = await ensureDb();
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    try {
      db.addAdmin(email, password, name);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Could not add admin' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/owner/admins/[id] - Delete admin
async function deleteAdmin(req, res) {
  try {
    const db = await ensureDb();
    const { id } = req.query;
    db.removeAdmin(id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return withMiddleware(listAdmins, sessionMiddleware, requireOwner)(req, res);
  } else if (req.method === 'POST') {
    return withMiddleware(createAdmin, sessionMiddleware, requireOwner)(req, res);
  } else if (req.method === 'DELETE') {
    return withMiddleware(deleteAdmin, sessionMiddleware, requireOwner)(req, res);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
