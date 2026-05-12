/**
 * API endpoint: GET /api/config
 */
const { ensureDb } = require('./_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await ensureDb();
    res.json(db.getPublicConfig());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
