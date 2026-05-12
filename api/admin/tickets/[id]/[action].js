/**
 * API endpoints for admin ticket actions
 * POST /api/admin/tickets/[id]/claim - Claim ticket
 * POST /api/admin/tickets/[id]/recall - Recall support
 * POST /api/admin/tickets/[id]/pause - Pause ticket
 * POST /api/admin/tickets/[id]/unpause - Unpause ticket
 * POST /api/admin/tickets/[id]/close - Close ticket
 * POST /api/admin/tickets/[id]/mute - Mute client
 */
const { ensureDb } = require('../../../_lib/db');
const { sessionMiddleware, requireAdmin, withMiddleware } = require('../../../_lib/middleware');
const { randomUUID } = require('crypto');

async function claimTicket(req, res) {
  try {
    const db = await ensureDb();
    const t = db.getTicketById(req.query.id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    const admin = db.getAdminById(req.session.adminId);
    db.updateTicket(req.query.id, { assigned_admin_id: req.session.adminId, status: 'claimed' });
    db.addAdminPoints(req.session.adminId, 10);
    db.logLine('info', 'Ticket claimed', { ticketId: req.query.id, admin: admin.email });
    
    // Note: Socket.io events would be handled separately
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function recallTicket(req, res) {
  try {
    const db = await ensureDb();
    const ticket = db.getTicketById(req.query.id);
    const admin = db.getAdminById(req.session.adminId);
    
    // Note: Socket.io events would be handled separately
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function pauseTicket(req, res) {
  try {
    const db = await ensureDb();
    db.updateTicket(req.query.id, { status: 'paused' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function unpauseTicket(req, res) {
  try {
    const db = await ensureDb();
    db.updateTicket(req.query.id, { status: 'claimed' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function closeTicket(req, res) {
  try {
    const db = await ensureDb();
    db.updateTicket(req.query.id, { status: 'closed' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function muteTicket(req, res) {
  try {
    const db = await ensureDb();
    const minutes = Math.min(24 * 60, Math.max(1, Number(req.body.minutes) || 15));
    const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    db.updateTicket(req.query.id, { client_muted_until: until });
    res.json({ ok: true, until });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

const actions = {
  claim: claimTicket,
  recall: recallTicket,
  pause: pauseTicket,
  unpause: unpauseTicket,
  close: closeTicket,
  mute: muteTicket,
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = req.query.action;
  if (!actions[action]) {
    return res.status(404).json({ error: 'Action not found' });
  }

  return withMiddleware(actions[action], sessionMiddleware, requireAdmin)(req, res);
}
