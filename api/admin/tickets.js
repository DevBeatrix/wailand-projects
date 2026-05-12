/**
 * API endpoint: GET /api/admin/tickets
 * List tickets for admin
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, requireAdmin, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const db = await ensureDb();
    const filter = req.query.filter || 'all';
    if (filter === 'all') return res.json(db.listAllTickets());

    const map = {
      order: 'order',
      support: 'support',
      claimed: 'claimed',
      closed: 'closed',
    };
    const f = map[filter] || 'order';
    res.json(db.listTicketsAdmin(f));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withMiddleware(handler, sessionMiddleware, requireAdmin);
