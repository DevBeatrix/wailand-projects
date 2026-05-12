/**
 * API endpoint: GET /api/client/tickets
 * Get tickets for authenticated client
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const email = req.session.clientEmail;
    if (!email) return res.status(401).json({ error: 'No session' });
    
    const db = await ensureDb();
    res.json(db.listTicketsForClient(email));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = withMiddleware(handler, sessionMiddleware);
