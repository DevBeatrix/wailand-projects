/**
 * Wailand Team — Express + Socket.io API & realtime hub.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

const db = require('./db');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

const DEFAULT_CONFIG = {
  adminEmail: process.env.NEXUS_ADMIN_EMAIL || 'admin@wailand.com',
  adminPassword: process.env.NEXUS_ADMIN_PASSWORD || 'wailandadmin',
  ownerEmail: process.env.NEXUS_OWNER_EMAIL || 'owner@wailand.com',
  ownerPassword: process.env.NEXUS_OWNER_PASSWORD || 'wailandowner',
  websiteName: process.env.NEXUS_WEBSITE_NAME || 'Wailand Team',
  logoText: process.env.NEXUS_LOGO_TEXT || 'W',
  currencyCode: process.env.NEXUS_CURRENCY_CODE || 'USD',
  currencySymbol: process.env.NEXUS_CURRENCY_SYMBOL || '$',
  paymentMethods: (process.env.NEXUS_PAYMENT_METHODS || 'Card,PayPal,Bank transfer').split(',').map((s) => s.trim()),
  uploadLimitMb: Number(process.env.NEXUS_UPLOAD_MB || '25'),
  domainName: process.env.NEXUS_DOMAIN || 'localhost',
  soundsDefault: process.env.NEXUS_SOUNDS !== '0',
  mainColor: process.env.NEXUS_COLOR_MAIN || '#6366f1',
  secondaryColor: process.env.NEXUS_COLOR_SECONDARY || '#22d3ee',
};

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

async function promptFirstRunConfig() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) =>
    new Promise((resolve) => {
      rl.question(q, (a) => resolve(a.trim()));
    });

  console.log('\n  First run — set admin & owner credentials (Enter = default)\n');
  const adminEmail = (await ask(`Admin email [${DEFAULT_CONFIG.adminEmail}]: `)) || DEFAULT_CONFIG.adminEmail;
  const adminPassword = (await ask(`Admin password [${DEFAULT_CONFIG.adminPassword}]: `)) || DEFAULT_CONFIG.adminPassword;
  const ownerEmail = (await ask(`Owner email [${DEFAULT_CONFIG.ownerEmail}]: `)) || DEFAULT_CONFIG.ownerEmail;
  const ownerPassword = (await ask(`Owner password [${DEFAULT_CONFIG.ownerPassword}]: `)) || DEFAULT_CONFIG.ownerPassword;
  rl.close();
  return {
    ...DEFAULT_CONFIG,
    adminEmail,
    adminPassword,
    ownerEmail,
    ownerPassword,
  };
}

function allowedMime(m) {
  const ok = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/webm',
    'audio/mpeg',
    'audio/wav',
    'application/pdf',
    'text/plain',
    'application/zip',
  ]);
  return ok.has(m) || m.startsWith('text/');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

const sessionMiddleware = session({
  name: 'wailand.sid',
  secret: process.env.SESSION_SECRET || 'wailand-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const strictLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

app.use('/api/', apiLimiter);

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireOwner(req, res, next) {
  if (!req.session.ownerId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

ensureDir(UPLOAD_DIR);
ensureDir(PUBLIC_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMime(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

/** Pretty routes → static panels */
app.get('/admin', (_req, res) => res.redirect('/admin.html'));
app.get('/owner', (_req, res) => res.redirect('/owner.html'));

app.get('/api/config', (_req, res) => {
  res.json(db.getPublicConfig());
});

app.post('/api/tickets', strictLimiter, (req, res) => {
  try {
    const { type, title, email, phone, description, priority } = req.body || {};
    if (!['order', 'support'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!title || !email || !priority) return res.status(400).json({ error: 'Missing fields' });
    const created = db.createTicket({ type, title, email, phone, description, priority });
    req.session.clientEmail = email;
    res.json(created);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed' });
  }
});

app.get('/api/client/tickets', (req, res) => {
  const email = req.session.clientEmail;
  if (!email) return res.status(401).json({ error: 'No session' });
  res.json(db.listTicketsForClient(email));
});

app.get('/api/tickets/:id', (req, res) => {
  const { token } = req.query;
  let t = null;
  if (req.session.adminId || req.session.ownerId) t = db.getTicketById(req.params.id);
  else t = db.verifyTicketAccess(req.params.id, token);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const admin = t.assigned_admin_id ? db.getAdminById(t.assigned_admin_id) : null;
  res.json({
    ...t,
    admin_name: admin ? admin.name : null,
  });
});

app.get('/api/tickets/:id/messages', (req, res) => {
  const { token } = req.query;
  const okClient = db.verifyTicketAccess(req.params.id, token);
  const okStaff = !!(req.session.adminId || req.session.ownerId);
  if (!okClient && !okStaff) return res.status(404).json({ error: 'Not found' });
  res.json(db.listMessages(req.params.id));
});

app.post('/api/tickets/:id/messages', strictLimiter, upload.single('file'), (req, res) => {
  const { token } = req.body || {};
  const ticketId = req.params.id;
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

  io.to(`ticket:${ticketId}`).emit('message', row);
  io.to('admins').emit('ticket:update', { ticketId });
  if (!isAdmin) {
    io.to('admins').emit('notify', {
      kind: 'message',
      title: 'New client message',
      body: ticket.title,
      ticketId,
    });
    db.addNotification({
      id: randomUUID(),
      user_scope: 'admins',
      admin_id: null,
      ticket_id: ticketId,
      kind: 'message',
      title: 'New client message',
      body: ticket.title,
      created_at: new Date().toISOString(),
    });
    playSoundForAdmins('message');
  } else {
    io.to(`ticket:${ticketId}`).emit('notify', {
      kind: 'message',
      title: 'Support replied',
      body: ticket.title,
      ticketId,
    });
    playSoundForRoom(`ticket:${ticketId}`, 'message');
  }

  res.json(row);
});

app.post('/api/tickets/:id/payment', strictLimiter, (req, res) => {
  const { token, method, amount, coupon } = req.body || {};
  if (!db.verifyTicketAccess(req.params.id, token)) return res.status(401).json({ error: 'Unauthorized' });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.addPayment({
    id,
    ticket_id: req.params.id,
    method: method || 'Card',
    amount: Number(amount) || 0,
    coupon: coupon || null,
    status: 'recorded',
    created_at: now,
  });

  const cfg = db.getPublicConfig();
  const payRow = {
    id,
    ticket_id: req.params.id,
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
  const full = db.listMessages(req.params.id).find((m) => m.id === id);
  io.to(`ticket:${req.params.id}`).emit('message', full || payRow);
  res.json({ ok: true, paymentId: id });
});

app.post('/api/tickets/:id/close-request', (req, res) => {
  const { token } = req.body || {};
  if (!db.verifyTicketAccess(req.params.id, token)) return res.status(401).json({ error: 'Unauthorized' });
  db.updateTicket(req.params.id, { close_requested_by: 'client' });
  io.to(`ticket:${req.params.id}`).emit('ticket:refresh');
  io.to('admins').emit('notify', { kind: 'info', title: 'Close requested', ticketId: req.params.id });
  res.json({ ok: true });
});

/* --- Admin API --- */
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const admin = db.getAdminByEmail(email || '');
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.adminId = admin.id;
  db.logLine('info', 'Admin login', { email });
  res.json({ ok: true, name: admin.name });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const a = db.getAdminById(req.session.adminId);
  if (!a) return res.status(404).json({ error: 'Admin not found' });
  res.json({ id: a.id, name: a.name, email: a.email, points: a.points });
});

app.get('/api/admin/tickets', requireAdmin, (req, res) => {
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
});

app.post('/api/admin/tickets/:id/claim', requireAdmin, (req, res) => {
  const t = db.getTicketById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const admin = db.getAdminById(req.session.adminId);
  db.updateTicket(req.params.id, { assigned_admin_id: req.session.adminId, status: 'claimed' });
  db.addAdminPoints(req.session.adminId, 10);
  db.logLine('info', 'Ticket claimed', { ticketId: req.params.id, admin: admin.email });
  io.to(`ticket:${req.params.id}`).emit('ticket:refresh');
  io.to(`ticket:${req.params.id}`).emit('notify', {
    kind: 'claimed',
    title: 'Ticket claimed',
    body: `${admin.name} is now handling this ticket`,
    ticketId: req.params.id,
  });
  db.addNotification({
    id: randomUUID(),
    user_scope: 'client',
    admin_id: req.session.adminId,
    ticket_id: req.params.id,
    kind: 'claimed',
    title: 'Ticket claimed',
    body: admin.name,
    created_at: new Date().toISOString(),
  });
  io.to('admins').emit('ticket:update', { ticketId: req.params.id });
  playSoundForRoom(`ticket:${req.params.id}`, 'claim');
  res.json({ ok: true });
});

app.post('/api/admin/tickets/:id/recall', requireAdmin, (req, res) => {
  const ticket = db.getTicketById(req.params.id);
  const admin = db.getAdminById(req.session.adminId);
  io.to('admins').emit('recall', {
    ticketId: req.params.id,
    title: ticket ? ticket.title : req.params.id,
    from: admin ? admin.name : 'Admin',
  });
  io.to('admins').emit('notify', {
    kind: 'recall',
    title: 'Recall support',
    body: 'A teammate needs help on a ticket',
    ticketId: req.params.id,
  });
  playSoundForAdmins('alert');
  res.json({ ok: true });
});

app.post('/api/admin/tickets/:id/pause', requireAdmin, (req, res) => {
  db.updateTicket(req.params.id, { status: 'paused' });
  broadcastTicket(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/tickets/:id/unpause', requireAdmin, (req, res) => {
  db.updateTicket(req.params.id, { status: 'claimed' });
  broadcastTicket(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/tickets/:id/close', requireAdmin, (req, res) => {
  db.updateTicket(req.params.id, { status: 'closed' });
  broadcastTicket(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/tickets/:id/mute', requireAdmin, (req, res) => {
  const minutes = Math.min(24 * 60, Math.max(1, Number(req.body.minutes) || 15));
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  db.updateTicket(req.params.id, { client_muted_until: until });
  broadcastTicket(req.params.id);
  res.json({ ok: true, until });
});

function broadcastTicket(ticketId) {
  io.to(`ticket:${ticketId}`).emit('ticket:refresh');
  io.to('admins').emit('ticket:update', { ticketId });
}

function playSoundForAdmins(kind) {
  io.to('admins').emit('sound', { kind });
}

function playSoundForRoom(room, kind) {
  io.to(room).emit('sound', { kind });
}

/* --- Owner API --- */
app.post('/api/owner/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!db.verifyOwner(email || '', password || '')) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.ownerId = 'owner';
  db.logLine('info', 'Owner login', { email });
  res.json({ ok: true });
});

app.post('/api/owner/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/owner/stats', requireOwner, (_req, res) => {
  res.json(db.statsOverview());
});

app.get('/api/owner/admins', requireOwner, (_req, res) => {
  res.json(db.listAdmins());
});

app.get('/api/owner/points', requireOwner, (_req, res) => {
  res.json(db.adminPointsBoard());
});

app.get('/api/owner/tickets', requireOwner, (_req, res) => {
  res.json(db.listAllTickets());
});

app.get('/api/owner/logs', requireOwner, (_req, res) => {
  res.json(db.recentLogs(200));
});

app.post('/api/owner/admins', requireOwner, (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
  try {
    db.addAdmin(email, password, name);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not add admin' });
  }
});

app.delete('/api/owner/admins/:id', requireOwner, (req, res) => {
  db.removeAdmin(req.params.id);
  res.json({ ok: true });
});

app.post('/api/owner/ban', requireOwner, (req, res) => {
  const { email, banned } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  db.banUserByEmail(email, !!banned);
  db.logLine('warn', 'User ban toggled', { email, banned });
  res.json({ ok: true });
});

app.post('/api/owner/settings', requireOwner, (req, res) => {
  const b = req.body || {};
  if (b.websiteName) db.setSetting('website_name', b.websiteName);
  if (b.logoText) db.setSetting('logo_text', b.logoText);
  if (b.mainColor) db.setSetting('main_color', b.mainColor);
  if (b.secondaryColor) db.setSetting('secondary_color', b.secondaryColor);
  if (b.currencyCode) db.setSetting('currency_code', b.currencyCode);
  if (b.currencySymbol) db.setSetting('currency_symbol', b.currencySymbol);
  if (Array.isArray(b.paymentMethods)) db.setSetting('payment_methods', JSON.stringify(b.paymentMethods));
  if (b.uploadLimitMb) db.setSetting('upload_limit_mb', String(b.uploadLimitMb));
  res.json(db.getPublicConfig());
});

app.use(express.static(PUBLIC_DIR));

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.message === 'File type not allowed' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: err.message || 'Upload rejected' });
  }
  next(err);
});

io.on('connection', (socket) => {
  const sess = socket.request.session;

  socket.on('join:ticket', (payload, cb) => {
    const { ticketId, token } = payload || {};
    const ticket = db.getTicketById(ticketId);
    if (!ticket) {
      if (cb) cb({ error: 'denied' });
      return;
    }
    const clientOk = db.verifyTicketAccess(ticketId, token);
    const adminOk = sess && sess.adminId;
    const ownerOk = sess && sess.ownerId;
    if (!clientOk && !adminOk && !ownerOk) {
      if (cb) cb({ error: 'denied' });
      return;
    }
    socket.join(`ticket:${ticketId}`);
    if (cb) cb({ ok: true });
  });

  socket.on('join:admins', (_p, cb) => {
    if (!sess || !sess.adminId) {
      if (cb) cb({ error: 'denied' });
      return;
    }
    socket.join('admins');
    if (cb) cb({ ok: true });
  });

  socket.on('join:owner', (_p, cb) => {
    if (!sess || !sess.ownerId) {
      if (cb) cb({ error: 'denied' });
      return;
    }
    socket.join('owner');
    if (cb) cb({ ok: true });
  });

  socket.on('typing', (payload) => {
    const { ticketId, token, typing } = payload || {};
    if (!ticketId) return;
    const ok =
      db.verifyTicketAccess(ticketId, token) || !!(sess && (sess.adminId || sess.ownerId));
    if (!ok) return;
    socket.to(`ticket:${ticketId}`).emit('typing', { typing: !!typing, ticketId });
  });
});

async function main() {
  ensureDir(path.join(__dirname, 'data'));
  await db.initDb();

  let cfg = DEFAULT_CONFIG;
  if (db.getSetting('seeded') !== '1') {
    if (process.stdin.isTTY) {
      cfg = await promptFirstRunConfig();
    }
    db.seedIfNeeded(cfg);
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, () => {
    console.log(`\n  Wailand Team running at http://localhost:${PORT}`);
    console.log(`  Admin:  http://localhost:${PORT}/admin`);
    console.log(`  Owner:  http://localhost:${PORT}/owner\n`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
