/**
 * API endpoints for tickets
 * POST /api/tickets - Create new ticket
 * GET /api/tickets - List tickets (admin only)
 */
const { ensureDb } = require('./_lib/db');
const { strictLimiter, sessionMiddleware, withMiddleware } = require('./_lib/middleware');

// POST /api/tickets - Create new ticket
async function createTicket(req, res) {
  try {
    const { type, title, email, phone, description, priority } = req.body || {};
    if (!['order', 'support'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!title || !email || !priority) return res.status(400).json({ error: 'Missing fields' });
    
    const db = await ensureDb();
    const created = db.createTicket({ type, title, email, phone, description, priority });
    req.session.clientEmail = email;
    res.json(created);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed' });
  }
}

// GET /api/tickets - List tickets (admin only)
async function listTickets(req, res) {
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

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return withMiddleware(createTicket, sessionMiddleware, strictLimiter)(req, res);
  } else if (req.method === 'GET') {
    return withMiddleware(listTickets, sessionMiddleware)(req, res);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
