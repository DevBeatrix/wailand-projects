/**
 * API endpoints for specific ticket operations
 * GET /api/tickets/[id] - Get ticket details
 * GET /api/tickets/[id]/messages - Get ticket messages
 * POST /api/tickets/[id]/messages - Send message
 * POST /api/tickets/[id]/payment - Record payment
 * POST /api/tickets/[id]/close-request - Request close
 */
const { ensureDb } = require('./_lib/db');
const { strictLimiter, sessionMiddleware, withMiddleware, requireAdmin } = require('./_lib/middleware');
const { withUpload, ensureDir, UPLOAD_DIR } = require('./_lib/utils');
const { randomUUID } = require('crypto');
const fs = require('fs');

ensureDir(UPLOAD_DIR);

// GET /api/tickets/[id] - Get ticket details
async function getTicket(req, res) {
  try {
    const db = await ensureDb();
    const { token } = req.query;
    let t = null;
    if (req.session.adminId || req.session.ownerId) t = db.getTicketById(req.query.id);
    else t = db.verifyTicketAccess(req.query.id, token);
    if (!t) return res.status(404).json({ error: 'Not found' });
    const admin = t.assigned_admin_id ? db.getAdminById(t.assigned_admin_id) : null;
    res.json({
      ...t,
      admin_name: admin ? admin.name : null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/tickets/[id]/messages - Get ticket messages
async function getMessages(req, res) {
  try {
    const db = await ensureDb();
    const { token } = req.query;
    const okClient = db.verifyTicketAccess(req.query.id, token);
    const okStaff = !!(req.session.adminId || req.session.ownerId);
    if (!okClient && !okStaff) return res.status(404).json({ error: 'Not found' });
    res.json(db.listMessages(req.query.id));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/tickets/[id]/messages - Send message
async function sendMessage(req, res) {
  try {
    const db = await ensureDb();
    const { token } = req.body || {};
    const ticketId = req.query.id;
    const ticket = db.getTicketById(ticketId);
    if (!ticket) return res.status(404).json({ error: 'Not found' });

    const maxBytes = Number(db.getSetting('upload_limit_mb', '25')) * 1024 * 1024;
    if (req.file && req.file.size > maxBytes) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_e) {}
      return res.status(400).json({ error: 'File too large' });
    }

    const isAdmin = !!req.session.adminId;
    const isOwner = !!req.session.ownerId;
    const clientOk = token && db.verifyTicketAccess(ticketId, token);

    if (!isAdmin && !isOwner && !clientOk) return res.status(401).json({ error: 'Unauthorized' });

    if (!isAdmin && !isOwner && ticket.client_muted_until) {
      const until = new Date(ticket.client_muted_until).getTime();
      if (Date.now() < until) return res.status(403).json({ error: 'You are temporarily muted' });
    }

    const now = new Date().toISOString();
    const msgType = req.body.msg_type || 'text';
    let body = req.body.body || '';
    let meta = null;

    if (msgType === 'code') {
      meta = JSON.stringify({ lang: req.body.lang || 'plaintext' });
    }

    const id = randomUUID();
    let attachment_path = null;
    let attachment_mime = null;
    let attachment_name = null;

    if (req.file) {
      attachment_path = `/uploads/${req.file.filename}`;
      attachment_mime = req.file.mimetype;
      attachment_name = req.file.originalname;
    }

    db.addMessage({
      id,
      ticket_id: ticketId,
      sender_type: isAdmin ? 'admin' : 'client',
      sender_admin_id: isAdmin ? req.session.adminId : null,
      body,
      msg_type: req.file ? (attachment_mime.startsWith('audio') ? 'audio' : 'file') : msgType,
      attachment_path,
      attachment_mime,
      attachment_name,
      meta_json: meta,
      created_at: now,
    });

    db.updateTicket(ticketId, {});
    const row = db.listMessages(ticketId).find((m) => m.id === id);

    // Note: Socket.io events would be handled separately in Vercel
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/tickets/[id]/payment - Record payment
async function recordPayment(req, res) {
  try {
    const db = await ensureDb();
    const { token, method, amount, coupon } = req.body || {};
    if (!db.verifyTicketAccess(req.query.id, token)) return res.status(401).json({ error: 'Unauthorized' });
    const id = randomUUID();
    const now = new Date().toISOString();
    db.addPayment({
      id,
      ticket_id: req.query.id,
      method: method || 'Card',
      amount: Number(amount) || 0,
      coupon: coupon || null,
      status: 'recorded',
      created_at: now,
    });

    const cfg = db.getPublicConfig();
    const payRow = {
      id,
      ticket_id: req.query.id,
      sender_type: 'client',
      sender_admin_id: null,
      body: `Payment request: ${method} — ${cfg.currencySymbol}${amount}`,
      msg_type: 'payment',
      attachment_path: null,
      attachment_mime: null,
      attachment_name: null,
      meta_json: JSON.stringify({ paymentId: id, coupon }),
      created_at: now,
    };
    db.addMessage(payRow);
    const full = db.listMessages(req.query.id).find((m) => m.id === id);
    res.json({ ok: true, paymentId: id });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/tickets/[id]/close-request - Request close
async function requestClose(req, res) {
  try {
    const db = await ensureDb();
    const { token } = req.body || {};
    if (!db.verifyTicketAccess(req.query.id, token)) return res.status(401).json({ error: 'Unauthorized' });
    db.updateTicket(req.query.id, { close_requested_by: 'client' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = async function handler(req, res) {
  const { id, ...rest } = req.query;
  req.query.id = id;

  if (req.method === 'GET' && !req.query.messages) {
    return withMiddleware(getTicket, sessionMiddleware)(req, res);
  } else if (req.method === 'GET' && req.query.messages) {
    return withMiddleware(getMessages, sessionMiddleware)(req, res);
  } else if (req.method === 'POST' && req.query.messages) {
    return withMiddleware(withUpload(sendMessage, true), sessionMiddleware, strictLimiter)(req, res);
  } else if (req.method === 'POST' && req.query.payment) {
    return withMiddleware(recordPayment, sessionMiddleware, strictLimiter)(req, res);
  } else if (req.method === 'POST' && req.query['close-request']) {
    return withMiddleware(requestClose, sessionMiddleware)(req, res);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
