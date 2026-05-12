/**
 * API endpoint: GET /api/owner/stats
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, requireOwner, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const db = await ensureDb();
    res.json(db.statsOverview());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = withMiddleware(handler, sessionMiddleware, requireOwner);
