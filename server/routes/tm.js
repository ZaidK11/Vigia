const express = require('express');
const router = express.Router();
const ch = require('../lib/clickhouse');
const jira = require('../lib/jira');
const { logAction } = require('../lib/audit');

function buildTmCommand(alert, panels) {
  const { txnPattern, customerContext, regulatory } = panels;
  return `Help me write SAR narrative for alert ${alert.id}:

Alert type: ${alert.alert_type || alert.type || 'TM'}
User: ${alert.userId || 'Unknown'}
Status: ${alert.status}
Days open: ${regulatory.daysOpen || 0}
SAR deadline: ${regulatory.sarDeadlineDays} days remaining

Transaction Pattern:
- Total: ${txnPattern.totalVolume || 'N/A'}
- Count: ${txnPattern.count} transactions
- Time span: ${txnPattern.timeSpan || 'N/A'}
- Flags: ${txnPattern.flags?.join(', ') || 'None'}

Customer context: ${customerContext.summary || 'See Jira case'}
Customer claim: ${customerContext.customerClaim || 'Not recorded'}

Provide:
1. Draft SAR summary (2-3 sentences)
2. Key suspicious indicators
3. SAR filing recommendation (YES / NO / MONITOR)
4. Confidence (HIGH / MEDIUM / LOW)
5. Next step`;
}

// GET /api/tm/alerts
router.get('/alerts', async (req, res) => {
  const [chAlerts, jiraAlerts] = await Promise.all([
    ch.query(`
      SELECT key, summary, current_status, alert_type, alert_category, alert_rule_code,
             assignee, created_at, is_account_limited, is_closed
      FROM analytics_compliance.fact_ar_issues
      WHERE current_status IN ('New Investigation', 'New', 'Monitoring', 'Limited', 'Ready to escalate')
        AND is_closed = 0
      ORDER BY created_at ASC
      LIMIT 50
    `),
    jira.searchIssues(
      'project = AR AND status in ("New Investigation","New","Monitoring","Limited") ORDER BY created ASC',
      30
    ).catch(() => [])
  ]);

  const alerts = chAlerts.map(a => ({
    id: a.key,
    summary: a.summary,
    type: a.alert_type || a.alert_rule_code,
    category: a.alert_category,
    status: a.current_status,
    assignedTo: a.assignee || 'Unassigned',
    created: a.created_at,
    isLimited: !!a.is_account_limited,
    source: 'clickhouse'
  }));

  // Add any Jira alerts not already in ClickHouse
  const seen = new Set(alerts.map(a => a.id));
  jiraAlerts.forEach(i => {
    if (!seen.has(i.key)) {
      alerts.push({
        id: i.key,
        summary: i.fields?.summary,
        type: 'TM',
        status: i.fields?.status?.name,
        assignedTo: i.fields?.assignee?.displayName || 'Unassigned',
        created: i.fields?.created,
        source: 'jira'
      });
    }
  });

  res.json({ alerts });
});

// GET /api/tm/alert/:id
router.get('/alert/:id', async (req, res) => {
  const { id } = req.params;

  const [chRows, jiraIssue] = await Promise.all([
    ch.query(`
      SELECT key, summary, current_status, alert_type, alert_category,
             assignee, created_at, is_account_limited, screening_flags, risk_flags, all_labels
      FROM analytics_compliance.fact_ar_issues
      WHERE key = '${id}'
      LIMIT 1
    `),
    jira.getIssue(id).catch(() => null)
  ]);

  const alert = chRows[0] || {};

  // Extract UUID from summary (format: "Full Name, UUID")
  const summary = alert.summary || jiraIssue?.fields?.summary || '';
  const uuidMatch = summary.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const userId = uuidMatch?.[1] || null;

  const [txns, riskRow, userRow] = userId ? await Promise.all([
    ch.query(`
      SELECT id, airtm_user_id, status, amount, operation_type, created_at
      FROM data_lake.payments_kecleon_operations
      WHERE airtm_user_id = '${userId}'
        AND _peerdb_is_deleted = 0
        AND created_at >= now() - INTERVAL 90 DAY
      ORDER BY created_at DESC
      LIMIT 50
    `),
    ch.query(`
      SELECT risk_level, score FROM data_lake.security_hub_dodrio_risk_level
      WHERE user_id = '${userId}' AND _peerdb_is_deleted = 0
      ORDER BY created_at DESC LIMIT 1
    `),
    ch.query(`
      SELECT id, email, first_name, last_name, country, registered_at
      FROM data_lake.oauth2_onix_users
      WHERE id = '${userId}' AND _peerdb_is_deleted = 0 LIMIT 1
    `)
  ]) : [[], [], []];

  const total = txns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const allUnder5k = txns.length > 0 && txns.every(t => parseFloat(t.amount || 0) < 5000);
  const timeSpanMs = txns.length > 1
    ? Math.abs(new Date(txns[0].created_at).getTime() - new Date(txns[txns.length - 1].created_at).getTime())
    : 0;

  const createdAt = alert.created_at || jiraIssue?.fields?.created;
  const daysOpen = createdAt
    ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
    : 0;

  const panels = {
    txnPattern: {
      count: txns.length,
      totalVolume: `$${total.toFixed(2)}`,
      avgAmount: txns.length ? `$${(total / txns.length).toFixed(2)}` : 'N/A',
      timeSpan: timeSpanMs > 0 ? `${Math.round(timeSpanMs / 3600000)} hours` : 'N/A',
      flags: [
        allUnder5k && txns.length > 5 ? '⚠️ Possible structuring (all <$5,000)' : null,
        txns.length > 10 ? `⚠️ High velocity: ${txns.length} txns in 90d` : null,
        riskRow[0]?.risk_level === 'high' ? '⚠️ High risk score in security hub' : null
      ].filter(Boolean)
    },
    networkAnalysis: {
      riskLevel: riskRow[0]?.risk_level || 'Unknown',
      riskScore: riskRow[0]?.score || null,
      screeningFlags: alert.screening_flags || [],
      riskFlags: alert.risk_flags || []
    },
    customerContext: {
      summary,
      customerClaim: jiraIssue?.fields?.description?.content?.[0]?.content?.[0]?.text?.slice(0, 300) || 'See Jira case',
      user: userRow[0] || null
    },
    regulatory: {
      daysOpen,
      sarDeadlineDays: Math.max(0, 90 - daysOpen),
      clockAlert: daysOpen > 3 ? `⚠️ ${daysOpen} days open — 3hr SLA check required` : '✅ Within SLA',
      sarThreshold: total >= 5000 ? `⚠️ $${total.toFixed(2)} — above $5,000 SAR threshold` : `Below $5,000 threshold`
    }
  };

  const sarTemplate = {
    patternDescription: `User ${userId || 'Unknown'} conducted ${txns.length} transactions totaling $${total.toFixed(2)} over ${panels.txnPattern.timeSpan}. ${panels.txnPattern.flags.join(' ')}`,
    customerNarrative: panels.customerContext.customerClaim,
    investigatorAssessment: '',
    conclusion: ''
  };

  const alertObj = {
    id,
    userId,
    type: alert.alert_type || 'TM',
    category: alert.alert_category,
    status: alert.current_status || jiraIssue?.fields?.status?.name,
    summary,
    created: createdAt,
    daysOpen,
    isLimited: !!alert.is_account_limited
  };

  const command = buildTmCommand(alertObj, panels);

  if (req.user) {
    logAction({
      userEmail: req.user.email,
      action: 'TM_ALERT_VIEW',
      resourceId: id,
      details: { userId, txnCount: txns.length, daysOpen }
    });
  }

  res.json({ alert: alertObj, panels, sarTemplate, command });
});

// POST /api/tm/decision
router.post('/decision', (req, res) => {
  const { alertId, decision, sarNarrative, notes } = req.body;
  if (!alertId || !decision) return res.status(400).json({ error: 'alertId and decision required' });
  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'TM_DECISION',
    resourceId: alertId,
    decision,
    details: { sarNarrative, notes }
  });
  res.json({ success: true, logged: true });
});

module.exports = router;
