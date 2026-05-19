const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'audit.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        user_email TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_id TEXT,
        decision TEXT,
        details TEXT
      );
    `);
  }
  return db;
}

function logAction({ userEmail, action, resourceId, decision, details }) {
  const stmt = getDb().prepare(
    `INSERT INTO audit_log (user_email, action, resource_id, decision, details)
     VALUES (?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    userEmail,
    action,
    resourceId || null,
    decision || null,
    typeof details === 'object' ? JSON.stringify(details) : (details || null)
  );
  return result.lastInsertRowid;
}

function getRecentLogs(limit = 50, userEmail = null) {
  const db = getDb();
  if (userEmail) {
    return db.prepare(
      `SELECT * FROM audit_log WHERE user_email = ? ORDER BY id DESC LIMIT ?`
    ).all(userEmail, limit);
  }
  return db.prepare(
    `SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`
  ).all(limit);
}

module.exports = { logAction, getRecentLogs };
