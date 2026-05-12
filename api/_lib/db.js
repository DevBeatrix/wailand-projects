/**
 * Database wrapper for Vercel API functions
 * Re-exports the main db module with initialization
 */
const db = require('../../db');

// Initialize database on first import
let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await db.initDb();
    dbInitialized = true;
  }
  return db;
}

module.exports = {
  ...db,
  ensureDb,
};
