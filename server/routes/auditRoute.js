const express = require('express');
const router = express.Router();
const { logAction, getRecentLogs } = require('../lib/audit');

// GET /api/audit/log
router.get('/log', (req, res) => {
  const { limit = 50, me } = req.query;
  const userEmail = me === 'true' ? req.user?.email : null;
  const logs = getRecentLogs(parseInt(limit), userEmail);
  res.json({ logs });
});

// POST /api/audit/log
router.post('/log', (req, res) => {
  const { action, resourceId, decision, details } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });

  const id = logAction({
    userEmail: req.user?.email || 'unknown',
    action,
    resourceId,
    decision,
    details
  });

  res.json({ success: true, id });
});

module.exports = router;
