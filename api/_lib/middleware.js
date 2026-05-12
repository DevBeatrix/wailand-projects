/**
 * Shared middleware for Vercel API functions
 */
const rateLimit = require('express-rate-limit');
const session = require('express-session');

// Rate limiters
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const strictLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

// Session configuration
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

// Auth middleware
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireOwner(req, res, next) {
  if (!req.session.ownerId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Helper to wrap middleware for Vercel
function withMiddleware(handler, ...middlewares) {
  return async (req, res) => {
    // Apply session middleware first if needed
    if (middlewares.includes(sessionMiddleware)) {
      await new Promise((resolve, reject) => {
        sessionMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Apply other middlewares
    for (const middleware of middlewares) {
      if (middleware !== sessionMiddleware) {
        await new Promise((resolve, reject) => {
          middleware(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }

    return handler(req, res);
  };
}

module.exports = {
  apiLimiter,
  strictLimiter,
  loginLimiter,
  sessionMiddleware,
  requireAdmin,
  requireOwner,
  withMiddleware,
};
