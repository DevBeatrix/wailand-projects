/**
 * API endpoint: POST /api/owner/settings
 */
const { ensureDb } = require('../_lib/db');
const { sessionMiddleware, requireOwner, withMiddleware } = require('../_lib/middleware');

async function handler(req, res) {
  try {
    const db = await ensureDb();
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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = withMiddleware(handler, sessionMiddleware, requireOwner);
