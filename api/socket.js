/**
 * WebSocket endpoint for Socket.io functionality on Vercel
 * Note: This is a simplified implementation for Vercel compatibility
 * Full Socket.io functionality would require additional setup
 */
const { ensureDb } = require('./_lib/db');
const { sessionMiddleware } = require('./_lib/middleware');

// Socket.io room management (simplified for serverless)
const activeConnections = new Map();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, payload } = req.body;
    
    // Apply session middleware
    await new Promise((resolve, reject) => {
      sessionMiddleware(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const db = await ensureDb();
    const connectionId = req.headers['x-connection-id'] || 'anonymous';

    switch (action) {
      case 'join:ticket':
        return handleJoinTicket(req, res, db, payload, connectionId);
      case 'join:admins':
        return handleJoinAdmins(req, res, payload, connectionId);
      case 'join:owner':
        return handleJoinOwner(req, res, payload, connectionId);
      case 'typing':
        return handleTyping(req, res, db, payload, connectionId);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

function handleJoinTicket(req, res, db, payload, connectionId) {
  const { ticketId, token } = payload || {};
  const ticket = db.getTicketById(ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'denied' });
  }
  const clientOk = db.verifyTicketAccess(ticketId, token);
  const adminOk = req.session && req.session.adminId;
  const ownerOk = req.session && req.session.ownerId;
  if (!clientOk && !adminOk && !ownerOk) {
    return res.status(401).json({ error: 'denied' });
  }

  // Store connection info (in production, use Redis or similar)
  if (!activeConnections.has(connectionId)) {
    activeConnections.set(connectionId, new Set());
  }
  activeConnections.get(connectionId).add(`ticket:${ticketId}`);

  res.json({ ok: true });
}

function handleJoinAdmins(req, res, payload, connectionId) {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ error: 'denied' });
  }

  if (!activeConnections.has(connectionId)) {
    activeConnections.set(connectionId, new Set());
  }
  activeConnections.get(connectionId).add('admins');

  res.json({ ok: true });
}

function handleJoinOwner(req, res, payload, connectionId) {
  if (!req.session || !req.session.ownerId) {
    return res.status(401).json({ error: 'denied' });
  }

  if (!activeConnections.has(connectionId)) {
    activeConnections.set(connectionId, new Set());
  }
  activeConnections.get(connectionId).add('owner');

  res.json({ ok: true });
}

function handleTyping(req, res, db, payload, connectionId) {
  const { ticketId, token, typing } = payload || {};
  if (!ticketId) {
    return res.status(400).json({ error: 'Missing ticketId' });
  }

  const ok = db.verifyTicketAccess(ticketId, token) || !!(req.session && (req.session.adminId || req.session.ownerId));
  if (!ok) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // In a real implementation, this would broadcast to other clients
  // For Vercel, you'd need to use a different approach (Server-Sent Events, WebSockets via Edge, etc.)
  res.json({ ok: true });
}
