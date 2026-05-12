/**
 * API endpoint: POST /api/admin/logout
 */
const { sessionMiddleware, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  req.session.destroy(() => res.json({ ok: true }));
}

module.exports = withMiddleware(handler, sessionMiddleware);
