const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'audit.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS regulatory_feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_date TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        posted_by TEXT DEFAULT 'sophia',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return db;
}

// POST /api/regulatory-feed — called by Sophia after generating each brief
// Auth: Authorization: Bearer <REGULATORY_FEED_SECRET>
router.post('/regulatory-feed', (req, res) => {
  const secret = process.env.REGULATORY_FEED_SECRET || 'vigia-reg-feed-secret-2026';
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  // Constant-time compare to prevent timing attacks
  const expectedBuf = Buffer.from(secret);
  const providedBuf = Buffer.alloc(expectedBuf.length);
  Buffer.from(token).copy(providedBuf);
  const match = crypto.timingSafeEqual(expectedBuf, providedBuf) && token === secret;

  if (!match) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { date, title, content, summary } = req.body;
  if (!date || !title || !content) {
    return res.status(400).json({ error: 'date, title, and content are required' });
  }

  const stmt = getDb().prepare(
    `INSERT INTO regulatory_feed (feed_date, title, content, summary)
     VALUES (?, ?, ?, ?)`
  );
  const result = stmt.run(date, title, content, summary || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

// GET /api/regulatory-feed — requires user to be authenticated (any role)
router.get('/regulatory-feed', (req, res) => {
  if (!req.user && !req.isAuthenticated?.()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const entries = getDb().prepare(
    `SELECT id, feed_date, title, content, summary, posted_by, created_at
     FROM regulatory_feed
     ORDER BY feed_date DESC, id DESC
     LIMIT 60`
  ).all();
  res.json({ entries });
});

module.exports = router;
