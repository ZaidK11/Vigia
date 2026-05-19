// ============================================================
// VIGÍA BSA DECISION ENGINE — BUILD HEADER
// ============================================================
// Tool Name:        Feedback Endpoint — /api/feedback
// Build Date:       2026-05-16
// Authorized by:    Zaid Khan (U087TL6CGNM)
// POLICY COMPLIANCE: POL-BSA-001-v4.2 | POL-AI-001 v1.0
// EWRA RISK MITIGATION: EWRA-01 (audit trail) | Residual: Low
// NOTE: Wired to vigia-portal production libs (audit.logAction)
// ============================================================

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { logAction } = require('../lib/audit');

// Append-only feedback log (JSONL — never deleted, never modified)
const feedbackLogPath = path.join(__dirname, '../logs/verdict_feedback.jsonl');
const logsDir = path.dirname(feedbackLogPath);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
if (!fs.existsSync(feedbackLogPath)) fs.writeFileSync(feedbackLogPath, '');

// POST /api/feedback/log-verdict
router.post('/log-verdict', async (req, res) => {
  try {
    const { search_type, user_id, verdict_given, verdict_chosen, agreement, agent_note, outcome } = req.body;

    if (!search_type || !user_id || !agreement) {
      return res.status(400).json({ error: 'search_type, user_id, and agreement required' });
    }
    if (!['thumbs_up', 'thumbs_down'].includes(agreement)) {
      return res.status(400).json({ error: 'agreement must be thumbs_up or thumbs_down' });
    }

    const feedbackEntry = {
      timestamp: new Date().toISOString(),
      agent_email: req.user?.email || 'unknown',
      agent_role: req.user?.role || 'unknown',
      search_type,
      user_id,
      verdict_given,
      verdict_chosen: verdict_chosen || null,
      agreement,
      agent_note: agent_note || null,
      outcome: outcome || null,
    };

    fs.appendFileSync(feedbackLogPath, JSON.stringify(feedbackEntry) + '\n');

    await logAction(
      req.user?.email || 'unknown',
      'FEEDBACK_LOGGED',
      user_id,
      agreement,
      JSON.stringify({ search_type, verdict_given })
    );

    return res.json({
      success: true,
      feedbackId: `FB-${Date.now()}`,
      message: agreement === 'thumbs_up' ? "Thanks! We'll learn from this." : "Feedback noted. We'll improve.",
    });
  } catch (err) {
    console.error('[feedback] log error:', err.message);
    return res.status(503).json({ error: 'Feedback service unavailable' });
  }
});

// GET /api/feedback/stats — aggregated agreement rates (Tier 2+)
router.get('/stats', (req, res) => {
  try {
    const { search_type } = req.query;
    const lines = fs.readFileSync(feedbackLogPath, 'utf-8').trim().split('\n').filter(Boolean);
    const entries = lines.map(l => JSON.parse(l));
    const filtered = search_type ? entries.filter(e => e.search_type === search_type) : entries;

    const thumbsUp = filtered.filter(e => e.agreement === 'thumbs_up').length;
    const thumbsDown = filtered.filter(e => e.agreement === 'thumbs_down').length;
    const total = filtered.length;
    const agreementRate = total > 0 ? ((thumbsUp / total) * 100).toFixed(1) : '0.0';

    const verdictStats = {};
    filtered.forEach(e => {
      const v = e.verdict_given;
      if (!v) return;
      if (!verdictStats[v]) verdictStats[v] = { count: 0, thumbs_up: 0, thumbs_down: 0, agreement_rate: '0.0' };
      verdictStats[v].count++;
      if (e.agreement === 'thumbs_up') verdictStats[v].thumbs_up++;
      else verdictStats[v].thumbs_down++;
      verdictStats[v].agreement_rate = ((verdictStats[v].thumbs_up / verdictStats[v].count) * 100).toFixed(1);
    });

    const overrides = filtered.filter(e => e.verdict_chosen && e.verdict_chosen !== e.verdict_given).slice(-10);

    return res.json({
      period: 'all_time',
      total_feedback: total,
      thumbs_up: thumbsUp,
      thumbs_down: thumbsDown,
      overall_agreement_rate: agreementRate + '%',
      by_verdict: verdictStats,
      recent_overrides: overrides,
      note: 'Use to tune search_protocols.json verdict conditions',
    });
  } catch (err) {
    return res.status(503).json({ error: 'Stats unavailable' });
  }
});

// GET /api/feedback/export?format=csv|json
router.get('/export', (req, res) => {
  try {
    const { format } = req.query;
    const lines = fs.readFileSync(feedbackLogPath, 'utf-8').trim().split('\n').filter(Boolean);
    const entries = lines.map(l => JSON.parse(l));

    if (format === 'csv') {
      const csv = [
        'Timestamp,Agent,Role,SearchType,Agreement,VerdictGiven,VerdictChosen,Note',
        ...entries.map(e => [
          e.timestamp, e.agent_email, e.agent_role, e.search_type,
          e.agreement, e.verdict_given || '', e.verdict_chosen || '',
          `"${(e.agent_note || '').replace(/"/g, '""')}"`,
        ].join(',')),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=verdict_feedback.csv');
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=verdict_feedback.json');
    return res.json(entries);
  } catch (err) {
    return res.status(503).json({ error: 'Export unavailable' });
  }
});

module.exports = router;
