/**
 * Shared utilities for Vercel API functions
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
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

// Multer configuration for file uploads
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

// Helper for handling file uploads in Vercel
function withUpload(handler, singleFile = false) {
  return async (req, res) => {
    if (singleFile) {
      return new Promise((resolve, reject) => {
        upload.single('file')(req, res, (err) => {
          if (err) {
            if (err.message === 'File type not allowed' || err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ error: err.message || 'Upload rejected' });
            }
            return reject(err);
          }
          try {
            const result = handler(req, res);
            if (result instanceof Promise) {
              result.then(resolve).catch(reject);
            } else {
              resolve(result);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    return handler(req, res);
  };
}

// Default configuration
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

module.exports = {
  ensureDir,
  allowedMime,
  upload,
  withUpload,
  DEFAULT_CONFIG,
  UPLOAD_DIR,
};
