/**
 * Wailand Team — JSON file-based data layer.
 * Each entity type gets its own JSON file in the data/ directory.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');

/* ── JSON file paths ── */
const FILES = {
  settings: path.join(DATA_DIR, 'settings.json'),
  users: path.join(DATA_DIR, 'users.json'),
  admins: path.join(DATA_DIR, 'admins.json'),
  tickets: path.join(DATA_DIR, 'tickets.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  payments: path.join(DATA_DIR, 'payments.json'),
  notifications: path.join(DATA_DIR, 'notifications.json'),
  logs: path.join(DATA_DIR, 'logs.json'),
};

/* ── In-memory store ── */
let store = {
  settings: {},
  users: [],
  admins: [],
  tickets: [],
  messages: [],
  payments: [],
  notifications: [],
  logs: [],
};

/* ── File helpers ── */
function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function readJson(filepath, fallback) {
  try {
    if (fs.existsSync(filepath)) {
      const raw = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (_e) {
    /* corrupted file — use fallback */
  }
  return fallback;
}

function writeJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function persistCollection(name) {
  writeJson(FILES[name], store[name]);
}

function persistSettings() {
  writeJson(FILES.settings, store.settings);
}

/* ── Init ── */
async function initDb() {
  ensureDir(DATA_DIR);

  store.settings = readJson(FILES.settings, {});
  store.users = readJson(FILES.users, []);
  store.admins = readJson(FILES.admins, []);
  store.tickets = readJson(FILES.tickets, []);
  store.messages = readJson(FILES.messages, []);
  store.payments = readJson(FILES.payments, []);
  store.notifications = readJson(FILES.notifications, []);
  store.logs = readJson(FILES.logs, []);
}

/* ── Settings ── */
function getSetting(key, fallback = null) {
  const val = store.settings[key];
  return val !== undefined ? val : fallback;
}

function setSetting(key, value) {
  store.settings[key] = String(value);
  persistSettings();
}

/* ── Logging ── */
function logLine(level, message, meta = null) {
  const entry = {
    id: randomUUID(),
    level,
    message,
    meta_json: meta ? JSON.stringify(meta) : null,
    created_at: new Date().toISOString(),
  };
  store.logs.push(entry);
  persistCollection('logs');
}

/* ── Seed ── */
function seedIfNeeded(config) {
  const seeded = getSetting('seeded');
  if (seeded === '1') return;

  const now = new Date().toISOString();
  const ownerHash = bcrypt.hashSync(config.ownerPassword, 10);
  const adminHash = bcrypt.hashSync(config.adminPassword, 10);

  setSetting('owner_email', config.ownerEmail);
  setSetting('owner_password_hash', ownerHash);
  setSetting('website_name', config.websiteName);
  setSetting('logo_text', config.logoText);
  setSetting('currency_code', config.currencyCode);
  setSetting('currency_symbol', config.currencySymbol);
  setSetting('payment_methods', JSON.stringify(config.paymentMethods));
  setSetting('upload_limit_mb', String(config.uploadLimitMb));
  setSetting('domain_name', config.domainName);
  setSetting('sounds_default', config.soundsDefault ? '1' : '0');
  setSetting('main_color', config.mainColor);
  setSetting('secondary_color', config.secondaryColor);

  const adminId = randomUUID();
  store.admins.push({
    id: adminId,
    email: config.adminEmail,
    password_hash: adminHash,
    name: 'Lead Admin',
    points: 0,
    created_at: now,
  });
  persistCollection('admins');

  setSetting('seeded', '1');
  logLine('info', 'Database seeded with owner settings and default admin');
}

/* ── Tickets ── */
function nextTicketNumber() {
  let maxN = 10000;
  store.tickets.forEach((t) => {
    const match = t.number && t.number.match(/^TICK-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return `TICK-${maxN + 1}`;
}

function findOrCreateUser(email, phone) {
  let u = store.users.find((x) => x.email === email);
  if (u) return u;
  const newUser = {
    id: randomUUID(),
    email,
    phone: phone || null,
    banned: 0,
    created_at: new Date().toISOString(),
  };
  store.users.push(newUser);
  persistCollection('users');
  return newUser;
}

function createTicket(data) {
  const id = randomUUID();
  const token = randomUUID() + randomUUID();
  const now = new Date().toISOString();
  const number = nextTicketNumber();
  const user = findOrCreateUser(data.email, data.phone);
  if (Number(user.banned) !== 0) throw new Error('Account restricted');

  const ticket = {
    id,
    number,
    type: data.type,
    title: data.title,
    email: data.email,
    phone: data.phone || null,
    description: data.description || '',
    priority: data.priority,
    status: 'open',
    access_token: token,
    assigned_admin_id: null,
    client_muted_until: null,
    close_requested_by: null,
    created_at: now,
    updated_at: now,
  };
  store.tickets.push(ticket);
  persistCollection('tickets');

  logLine('info', 'Ticket created', { ticketId: id, number });
  return { id, number, access_token: token };
}

function getTicketById(id) {
  return store.tickets.find((t) => t.id === id) || null;
}

function verifyTicketAccess(ticketId, token) {
  const t = getTicketById(ticketId);
  if (!t || t.access_token !== token) return null;
  return t;
}

function listTicketsForClient(email) {
  return store.tickets
    .filter((t) => t.email === email)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function listTicketsAdmin(filter) {
  let list = store.tickets.slice();

  if (filter === 'order') {
    list = list.filter((t) => t.type === 'order');
  } else if (filter === 'support') {
    list = list.filter((t) => t.type === 'support');
  } else if (filter === 'claimed') {
    list = list.filter((t) => ['claimed', 'paused'].includes(t.status) && t.assigned_admin_id);
  } else if (filter === 'closed') {
    list = list.filter((t) => t.status === 'closed');
  }

  return list
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .map((t) => {
      const admin = t.assigned_admin_id ? store.admins.find((a) => a.id === t.assigned_admin_id) : null;
      return { ...t, admin_name: admin ? admin.name : null };
    });
}

function listAllTickets() {
  return store.tickets
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .map((t) => {
      const admin = t.assigned_admin_id ? store.admins.find((a) => a.id === t.assigned_admin_id) : null;
      return { ...t, admin_name: admin ? admin.name : null };
    });
}

function updateTicket(ticketId, patch) {
  const idx = store.tickets.findIndex((t) => t.id === ticketId);
  if (idx === -1) return null;
  Object.assign(store.tickets[idx], patch, { updated_at: new Date().toISOString() });
  persistCollection('tickets');
  return store.tickets[idx];
}

/* ── Messages ── */
function addMessage(row) {
  store.messages.push({
    id: row.id,
    ticket_id: row.ticket_id,
    sender_type: row.sender_type,
    sender_admin_id: row.sender_admin_id || null,
    body: row.body || null,
    msg_type: row.msg_type,
    attachment_path: row.attachment_path || null,
    attachment_mime: row.attachment_mime || null,
    attachment_name: row.attachment_name || null,
    meta_json: row.meta_json || null,
    created_at: row.created_at,
  });
  persistCollection('messages');
}

function listMessages(ticketId) {
  return store.messages
    .filter((m) => m.ticket_id === ticketId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((m) => {
      const admin = m.sender_admin_id ? store.admins.find((a) => a.id === m.sender_admin_id) : null;
      return { ...m, admin_name: admin ? admin.name : null };
    });
}

/* ── Payments ── */
function addPayment(p) {
  store.payments.push({
    id: p.id,
    ticket_id: p.ticket_id,
    method: p.method,
    amount: p.amount,
    coupon: p.coupon || null,
    status: p.status,
    created_at: p.created_at,
  });
  persistCollection('payments');
}

/* ── Admins ── */
function getAdminByEmail(email) {
  return store.admins.find((a) => a.email === email) || null;
}

function getAdminById(id) {
  return store.admins.find((a) => a.id === id) || null;
}

function listAdmins() {
  return store.admins
    .map(({ id, email, name, points, created_at }) => ({ id, email, name, points, created_at }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function addAdmin(email, password, name) {
  if (store.admins.some((a) => a.email === email)) {
    throw new Error('Admin with this email already exists');
  }
  const id = randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  store.admins.push({ id, email, password_hash: hash, name, points: 0, created_at: now });
  persistCollection('admins');
  logLine('info', 'Admin added', { email });
  return id;
}

function removeAdmin(id) {
  store.admins = store.admins.filter((a) => a.id !== id);
  persistCollection('admins');
  logLine('warn', 'Admin removed', { id });
}

function addAdminPoints(adminId, delta) {
  const admin = store.admins.find((a) => a.id === adminId);
  if (admin) {
    admin.points = (admin.points || 0) + delta;
    persistCollection('admins');
  }
}

/* ── Owner ── */
function verifyOwner(email, password) {
  const oEmail = getSetting('owner_email');
  const hash = getSetting('owner_password_hash');
  if (!oEmail || !hash) return false;
  return email === oEmail && bcrypt.compareSync(password, hash);
}

/* ── Users / Bans ── */
function banUserByEmail(email, banned) {
  const user = store.users.find((u) => u.email === email);
  if (user) {
    user.banned = banned ? 1 : 0;
    persistCollection('users');
  }
}

/* ── Public Config ── */
function getPublicConfig() {
  return {
    websiteName: getSetting('website_name', 'Wailand Team'),
    logoText: getSetting('logo_text', 'W'),
    currencyCode: getSetting('currency_code', 'USD'),
    currencySymbol: getSetting('currency_symbol', '$'),
    paymentMethods: JSON.parse(getSetting('payment_methods', '["Card","PayPal","Bank transfer"]')),
    uploadLimitMb: Number(getSetting('upload_limit_mb', '25')),
    domainName: getSetting('domain_name', 'localhost'),
    soundsDefault: getSetting('sounds_default', '1') === '1',
    mainColor: getSetting('main_color', '#6366f1'),
    secondaryColor: getSetting('secondary_color', '#22d3ee'),
  };
}

/* ── Stats ── */
function statsOverview() {
  const ticketsTotal = store.tickets.length;
  const openCount = store.tickets.filter((t) => t.status !== 'closed').length;
  const closedCount = store.tickets.filter((t) => t.status === 'closed').length;
  const msgs = store.messages.length;
  const admins = store.admins.length;
  return { ticketsTotal, openCount, closedCount, messagesTotal: msgs, adminsCount: admins };
}

function adminPointsBoard() {
  return store.admins
    .map(({ name, email, points }) => ({ name, email, points }))
    .sort((a, b) => b.points - a.points);
}

/* ── Logs ── */
function recentLogs(limit = 100) {
  return store.logs
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

/* ── Notifications ── */
function addNotification(row) {
  store.notifications.push({
    id: row.id,
    user_scope: row.user_scope,
    admin_id: row.admin_id || null,
    ticket_id: row.ticket_id || null,
    kind: row.kind,
    title: row.title,
    body: row.body || null,
    read_at: null,
    created_at: row.created_at,
  });
  persistCollection('notifications');
}

module.exports = {
  initDb,
  seedIfNeeded,
  getSetting,
  setSetting,
  logLine,
  createTicket,
  getTicketById,
  verifyTicketAccess,
  listTicketsForClient,
  listTicketsAdmin,
  listAllTickets,
  updateTicket,
  addMessage,
  listMessages,
  addPayment,
  getAdminByEmail,
  getAdminById,
  listAdmins,
  addAdmin,
  removeAdmin,
  addAdminPoints,
  verifyOwner,
  banUserByEmail,
  getPublicConfig,
  statsOverview,
  adminPointsBoard,
  recentLogs,
  addNotification,
};
