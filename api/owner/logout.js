/**
 * API endpoint: POST /api/owner/logout
 */
const { sessionMiddleware, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  req.session.destroy(() => res.json({ ok: true }));
}

export default withMiddleware(handler, sessionMiddleware);
