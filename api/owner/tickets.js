/**
 * API endpoint: GET /api/owner/tickets
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, requireOwner, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const db = await ensureDb();
    res.json(db.listAllTickets());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withMiddleware(handler, sessionMiddleware, requireOwner);
