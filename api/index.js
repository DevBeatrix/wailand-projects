/**
 * Single Vercel Serverless Function for Wailand Team
 * Handles all API routes to comply with Hobby plan limits
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

const db = require('../db');

// Configuration
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
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

// Ensure directories exist
function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
ensureDir(UPLOAD_DIR);

// File upload configuration
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

// Rate limiting (simplified)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 120; // requests per minute

function checkRateLimit(req, max = RATE_LIMIT_MAX) {
  const key = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }
  
  const requests = rateLimitMap.get(key).filter(timestamp => timestamp > windowStart);
  
  if (requests.length >= max) {
    return false;
  }
  
  requests.push(now);
  rateLimitMap.set(key, requests);
  return true;
}

// Session middleware (simplified for serverless)
function sessionMiddleware(req, res, next) {
  // For Vercel, we'll use a simple session simulation
  // In production, consider using Vercel KV or external session store
  req.session = req.session || {};
  next();
}

// Auth middleware
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireOwner(req, res, next) {
  if (!req.session.ownerId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Database initialization
let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await db.initDb();
    dbInitialized = true;
  }
  return db;
}

// API Route Handlers
async function handleConfig(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    res.json(database.getPublicConfig());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleTickets(req, res) {
  try {
    const database = await ensureDb();
    
    if (req.method === 'POST') {
      if (!checkRateLimit(req, 30)) return res.status(429).json({ error: 'Too many requests' });
      
      const { type, title, email, phone, description, priority } = req.body || {};
      if (!['order', 'support'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!title || !email || !priority) return res.status(400).json({ error: 'Missing fields' });
      
      const created = database.createTicket({ type, title, email, phone, description, priority });
      req.session.clientEmail = email;
      res.json(created);
    } else if (req.method === 'GET') {
      const filter = req.query.filter || 'all';
      if (filter === 'all') return res.json(database.listAllTickets());

      const map = {
        order: 'order',
        support: 'support',
        claimed: 'claimed',
        closed: 'closed',
      };
      const f = map[filter] || 'order';
      res.json(database.listTicketsAdmin(f));
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleTicketById(req, res) {
  try {
    const database = await ensureDb();
    const ticketId = req.query.id;
    
    if (req.method === 'GET') {
      if (req.query.messages) {
        const { token } = req.query;
        const okClient = database.verifyTicketAccess(ticketId, token);
        const okStaff = !!(req.session.adminId || req.session.ownerId);
        if (!okClient && !okStaff) return res.status(404).json({ error: 'Not found' });
        res.json(database.listMessages(ticketId));
      } else {
        const { token } = req.query;
        let t = null;
        if (req.session.adminId || req.session.ownerId) t = database.getTicketById(ticketId);
        else t = database.verifyTicketAccess(ticketId, token);
        if (!t) return res.status(404).json({ error: 'Not found' });
        const admin = t.assigned_admin_id ? database.getAdminById(t.assigned_admin_id) : null;
        res.json({
          ...t,
          admin_name: admin ? admin.name : null,
        });
      }
    } else if (req.method === 'POST') {
      if (req.query.messages) {
        if (!checkRateLimit(req, 30)) return res.status(429).json({ error: 'Too many requests' });
        
        const { token } = req.body || {};
        const ticket = database.getTicketById(ticketId);
        if (!ticket) return res.status(404).json({ error: 'Not found' });

        const maxBytes = Number(database.getSetting('upload_limit_mb', '25')) * 1024 * 1024;
        if (req.file && req.file.size > maxBytes) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (_e) {}
          return res.status(400).json({ error: 'File too large' });
        }

        const isAdmin = !!req.session.adminId;
        const isOwner = !!req.session.ownerId;
        const clientOk = token && database.verifyTicketAccess(ticketId, token);

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

        database.addMessage({
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

        database.updateTicket(ticketId, {});
        const row = database.listMessages(ticketId).find((m) => m.id === id);
        res.json(row);
      } else if (req.query.payment) {
        if (!checkRateLimit(req, 30)) return res.status(429).json({ error: 'Too many requests' });
        
        const { token, method, amount, coupon } = req.body || {};
        if (!database.verifyTicketAccess(ticketId, token)) return res.status(401).json({ error: 'Unauthorized' });
        const id = randomUUID();
        const now = new Date().toISOString();
        database.addPayment({
          id,
          ticket_id: ticketId,
          method: method || 'Card',
          amount: Number(amount) || 0,
          coupon: coupon || null,
          status: 'recorded',
          created_at: now,
        });

        const cfg = database.getPublicConfig();
        const payRow = {
          id,
          ticket_id: ticketId,
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
        database.addMessage(payRow);
        res.json({ ok: true, paymentId: id });
      } else if (req.query['close-request']) {
        const { token } = req.body || {};
        if (!database.verifyTicketAccess(ticketId, token)) return res.status(401).json({ error: 'Unauthorized' });
        database.updateTicket(ticketId, { close_requested_by: 'client' });
        res.json({ ok: true });
      } else {
        res.status(404).json({ error: 'Action not found' });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleClientTickets(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const email = req.session.clientEmail;
    if (!email) return res.status(401).json({ error: 'No session' });
    
    const database = await ensureDb();
    res.json(database.listTicketsForClient(email));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleAdminLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkRateLimit(req, 40)) return res.status(429).json({ error: 'Too many requests' });
  
  try {
    const { email, password } = req.body || {};
    const database = await ensureDb();
    const admin = database.getAdminByEmail(email || '');
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password || '', admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.adminId = admin.id;
    database.logLine('info', 'Admin login', { email });
    res.json({ ok: true, name: admin.name });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleAdminLogout(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  req.session.destroy(() => res.json({ ok: true }));
}

async function handleAdminMe(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    const a = database.getAdminById(req.session.adminId);
    if (!a) return res.status(404).json({ error: 'Admin not found' });
    res.json({ id: a.id, name: a.name, email: a.email, points: a.points });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleAdminTickets(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    const filter = req.query.filter || 'all';
    if (filter === 'all') return res.json(database.listAllTickets());

    const map = {
      order: 'order',
      support: 'support',
      claimed: 'claimed',
      closed: 'closed',
    };
    const f = map[filter] || 'order';
    res.json(database.listTicketsAdmin(f));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleAdminTicketAction(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    const ticketId = req.query.id;
    const action = req.query.action;
    
    if (action === 'claim') {
      const t = database.getTicketById(ticketId);
      if (!t) return res.status(404).json({ error: 'Not found' });
      const admin = database.getAdminById(req.session.adminId);
      database.updateTicket(ticketId, { assigned_admin_id: req.session.adminId, status: 'claimed' });
      database.addAdminPoints(req.session.adminId, 10);
      database.logLine('info', 'Ticket claimed', { ticketId, admin: admin.email });
      res.json({ ok: true });
    } else if (action === 'recall') {
      const ticket = database.getTicketById(ticketId);
      const admin = database.getAdminById(req.session.adminId);
      res.json({ ok: true });
    } else if (action === 'pause') {
      database.updateTicket(ticketId, { status: 'paused' });
      res.json({ ok: true });
    } else if (action === 'unpause') {
      database.updateTicket(ticketId, { status: 'claimed' });
      res.json({ ok: true });
    } else if (action === 'close') {
      database.updateTicket(ticketId, { status: 'closed' });
      res.json({ ok: true });
    } else if (action === 'mute') {
      const minutes = Math.min(24 * 60, Math.max(1, Number(req.body.minutes) || 15));
      const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      database.updateTicket(ticketId, { client_muted_until: until });
      res.json({ ok: true, until });
    } else {
      res.status(404).json({ error: 'Action not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkRateLimit(req, 40)) return res.status(429).json({ error: 'Too many requests' });
  
  try {
    const { email, password } = req.body || {};
    const database = await ensureDb();
    if (!database.verifyOwner(email || '', password || '')) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.ownerId = 'owner';
    database.logLine('info', 'Owner login', { email });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerLogout(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  req.session.destroy(() => res.json({ ok: true }));
}

async function handleOwnerStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    res.json(database.statsOverview());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerAdmins(req, res) {
  try {
    const database = await ensureDb();
    
    if (req.method === 'GET') {
      res.json(database.listAdmins());
    } else if (req.method === 'POST') {
      const { email, password, name } = req.body || {};
      if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
      try {
        database.addAdmin(email, password, name);
        res.json({ ok: true });
      } catch (e) {
        res.status(400).json({ error: e.message || 'Could not add admin' });
      }
    } else if (req.method === 'DELETE') {
      const { id } = req.query;
      database.removeAdmin(id);
      res.json({ ok: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerPoints(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    res.json(database.adminPointsBoard());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerTickets(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    res.json(database.listAllTickets());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerLogs(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    res.json(database.recentLogs(200));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerBan(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    const { email, banned } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    database.banUserByEmail(email, !!banned);
    database.logLine('warn', 'User ban toggled', { email, banned });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleOwnerSettings(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const database = await ensureDb();
    const b = req.body || {};
    if (b.websiteName) database.setSetting('website_name', b.websiteName);
    if (b.logoText) database.setSetting('logo_text', b.logoText);
    if (b.mainColor) database.setSetting('main_color', b.mainColor);
    if (b.secondaryColor) database.setSetting('secondary_color', b.secondaryColor);
    if (b.currencyCode) database.setSetting('currency_code', b.currencyCode);
    if (b.currencySymbol) database.setSetting('currency_symbol', b.currencySymbol);
    if (Array.isArray(b.paymentMethods)) database.setSetting('payment_methods', JSON.stringify(b.paymentMethods));
    if (b.uploadLimitMb) database.setSetting('upload_limit_mb', String(b.uploadLimitMb));
    res.json(database.getPublicConfig());
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Main handler function
async function handler(req, res) {
  // Apply session middleware
  sessionMiddleware(req, res, () => {});

  // Parse URL to determine route
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  try {
    // Route based on pathname and query parameters
    if (pathname === '/api/config') {
      return handleConfig(req, res);
    } else if (pathname === '/api/tickets') {
      if (searchParams.get('id')) {
        return handleTicketById(req, res);
      } else {
        return handleTickets(req, res);
      }
    } else if (pathname === '/api/client/tickets') {
      return handleClientTickets(req, res);
    } else if (pathname === '/api/admin/login') {
      return handleAdminLogin(req, res);
    } else if (pathname === '/api/admin/logout') {
      return handleAdminLogout(req, res);
    } else if (pathname === '/api/admin/me') {
      return handleAdminMe(req, res);
    } else if (pathname === '/api/admin/tickets') {
      return handleAdminTickets(req, res);
    } else if (pathname === '/api/admin/tickets/action' && searchParams.get('id')) {
      return handleAdminTicketAction(req, res);
    } else if (pathname === '/api/owner/login') {
      return handleOwnerLogin(req, res);
    } else if (pathname === '/api/owner/logout') {
      return handleOwnerLogout(req, res);
    } else if (pathname === '/api/owner/stats') {
      return handleOwnerStats(req, res);
    } else if (pathname === '/api/owner/admins') {
      return handleOwnerAdmins(req, res);
    } else if (pathname === '/api/owner/points') {
      return handleOwnerPoints(req, res);
    } else if (pathname === '/api/owner/tickets') {
      return handleOwnerTickets(req, res);
    } else if (pathname === '/api/owner/logs') {
      return handleOwnerLogs(req, res);
    } else if (pathname === '/api/owner/ban') {
      return handleOwnerBan(req, res);
    } else if (pathname === '/api/owner/settings') {
      return handleOwnerSettings(req, res);
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Export for Vercel
module.exports = handler;
