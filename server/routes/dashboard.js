// ============================================================
// VIGÍA BSA DECISION ENGINE — BUILD HEADER
// ============================================================
// Tool Name:        Compliance Dashboard API Route
// Build Date:       2026-05-19
// Authorized by:    Zaid Khan (U087TL6CGNM)
// POLICY COMPLIANCE: POL-BSA-001-v4.2
// EWRA RISK MITIGATION: Risk ID(s): EWRA-01, EWRA-20 | Residual: LOW
// HISTORICAL AUDIT GAP: Crowe Finding ##6, ##7 (2025)
// ============================================================

const express = require('express');
const router = express.Router();
const { getCache, updateDashboard } = require('../jobs/updateDashboard');

// GET /api/dashboard
// Returns merged, sorted case queue for Compliance Leadership Dashboard
router.get('/', async (req, res) => {
  try {
    let cache = getCache();

    // If cache is empty or older than 35 min, refresh now
    const stale = !cache.updatedAt ||
      (Date.now() - new Date(cache.updatedAt).getTime()) > 35 * 60 * 1000;

    if (stale && cache.data.length === 0) {
      await updateDashboard();
      cache = getCache();
    }

    // Apply optional filter from query param: ?type=Support|KYC|TM|Fraud|Escalation
    let data = cache.data;
    const { type, urgency } = req.query;
    if (type && type !== 'all') {
      const t = type.toLowerCase();
      if (t === 'escalations') {
        data = data.filter(c => c.urgency === 'red' || c.urgency === 'overdue' || c.type === 'Escalation');
      } else {
        data = data.filter(c => c.type.toLowerCase() === t);
      }
    }
    if (urgency === 'overdue') data = data.filter(c => c.daysLeft < 0);
    if (urgency === 'today') data = data.filter(c => c.daysLeft >= 0 && c.daysLeft < 1);

    // Summary stats
    const stats = {
      total: cache.data.length,
      dueToday: cache.data.filter(c => c.daysLeft >= 0 && c.daysLeft < 1).length,
      overdue: cache.data.filter(c => c.daysLeft < 0).length,
      byType: cache.data.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {}),
      updatedAt: cache.updatedAt
    };

    res.json({ stats, cases: data });
  } catch (err) {
    console.error('[Dashboard route]', err.message);
    res.status(500).json({ error: 'Dashboard unavailable', cases: [], stats: {} });
  }
});

// POST /api/dashboard/refresh (manual refresh, leadership only)
router.post('/refresh', async (req, res) => {
  if (req.user?.role !== 'LEADERSHIP') {
    return res.status(403).json({ error: 'Leadership only' });
  }
  try {
    await updateDashboard();
    const cache = getCache();
    res.json({ success: true, count: cache.data.length, updatedAt: cache.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
