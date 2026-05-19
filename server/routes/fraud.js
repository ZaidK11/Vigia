const express = require('express');
const router = express.Router();
const jira = require('../lib/jira');
const ch = require('../lib/clickhouse');
const { logAction } = require('../lib/audit');

function buildFraudCommand(caseData, panels) {
  const { txnPattern, networkAnalysis, customerContext, regulatory } = panels;
  return `Analyze this fraud case for SAR filing:

Case: ${caseData.id}
User: ${caseData.userId || 'Unknown'}
Summary: ${caseData.summary || 'N/A'}

Transaction Pattern:
- Total volume: ${txnPattern.totalVolume || 'N/A'}
- Transaction count: ${txnPattern.count || 0}
- Avg amount: ${txnPattern.avgAmount || 'N/A'}
- Time span: ${txnPattern.timeSpan || 'N/A'}
- Pattern flags: ${txnPattern.flags?.join(', ') || 'None identified'}

Network Analysis:
- Risk level: ${networkAnalysis.riskLevel || 'Unknown'}
- Risk score: ${networkAnalysis.riskScore || 'N/A'}
- Screening flags: ${networkAnalysis.screeningFlags?.join(', ') || 'None'}

Customer Context:
- Account age: ${customerContext.accountAge || 'Unknown'}
- Customer claim: ${customerContext.customerClaim || 'Not recorded'}

Regulatory:
- Days open: ${regulatory.daysOpen}
- SAR deadline: ${regulatory.sarDeadlineDays} days remaining
- ${regulatory.sarThreshold}

Provide:
1. Risk level (LOW / MEDIUM / HIGH / CRITICAL)
2. Pattern type (structuring / layering / circular / mule / none)
3. SAR recommendation (YES / NO / PENDING_MORE_INFO)
4. Confidence (HIGH / MEDIUM / LOW)
5. Reasoning (2-3 sentences)`;
}

// GET /api/fraud/cases
router.get('/cases', async (req, res) => {
  const [chCases, jiraCases] = await Promise.all([
    ch.query(`
      SELECT key, summary, current_status, alert_type, alert_category,
             assignee, created_at, is_account_limited, screening_flags, risk_flags
      FROM analytics_compliance.fact_ar_issues
      WHERE current_status IN ('New Investigation', 'New', 'Monitoring', 'Limited', 'Ready to escalate')
        AND is_closed = 0
        AND (alert_category IN ('manual_screening', 'active_tm_rule') OR arrayExists(x -> x IN ('Fraud','Banned'), risk_flags))
      ORDER BY created_at ASC
      LIMIT 50
    `).catch(() => []),
    jira.searchIssues(
      'project = AR AND status in ("New Investigation","New","Monitoring","Limited") ORDER BY created ASC',
      30
    ).catch(() => [])
  ]);

  const cases = chCases.map(c => ({
    id: c.key,
    summary: c.summary,
    status: c.current_status,
    type: c.alert_type,
    assignee: c.assignee || 'Unassigned',
    created: c.created_at,
    riskFlags: c.risk_flags || [],
    screeningFlags: c.screening_flags || []
  }));

  // Merge Jira cases not already in CH
  const seen = new Set(cases.map(c => c.id));
  jiraCases.forEach(i => {
    if (!seen.has(i.key)) {
      cases.push({
        id: i.key,
        summary: i.fields?.summary,
        status: i.fields?.status?.name,
        assignee: i.fields?.assignee?.displayName || 'Unassigned',
        created: i.fields?.created
      });
    }
  });

  res.json({ cases });
});

// GET /api/fraud/case/:id
router.get('/case/:id', async (req, res) => {
  const { id } = req.params;

  const [chRows, jiraIssue] = await Promise.all([
    ch.query(`
      SELECT key, summary, current_status, alert_type, alert_category,
             assignee, created_at, screening_flags, risk_flags, all_labels
      FROM analytics_compliance.fact_ar_issues
      WHERE key = '${id}'
      LIMIT 1
    `),
    jira.getIssue(id).catch(() => null)
  ]);

  const alert = chRows[0] || {};
  const summary = alert.summary || jiraIssue?.fields?.summary || '';

  // Extract UUID from Jira summary: "Full Name, UUID"
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

  const user = userRow[0] || null;
  const accountAge = user?.registered_at
    ? `${Math.floor((Date.now() - new Date(user.registered_at).getTime()) / 86400000)} days`
    : 'Unknown';

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
        riskRow[0]?.risk_level === 'high' ? '⚠️ High risk level' : null
      ].filter(Boolean)
    },
    networkAnalysis: {
      riskLevel: riskRow[0]?.risk_level || 'Unknown',
      riskScore: riskRow[0]?.score || null,
      screeningFlags: alert.screening_flags || [],
      riskFlags: alert.risk_flags || []
    },
    customerContext: {
      accountAge,
      customerClaim: jiraIssue?.fields?.description?.content?.[0]?.content?.[0]?.text?.slice(0, 300) || 'See Jira case',
      user
    },
    regulatory: {
      daysOpen,
      sarDeadlineDays: Math.max(0, 90 - daysOpen),
      clockAlert: daysOpen > 3 ? `⚠️ ${daysOpen} days open` : '✅ Within SLA',
      sarThreshold: total >= 5000 ? `⚠️ $${total.toFixed(2)} — above $5,000 SAR threshold` : 'Below threshold'
    }
  };

  const caseObj = {
    id,
    userId,
    summary,
    status: alert.current_status || jiraIssue?.fields?.status?.name,
    assignee: alert.assignee || jiraIssue?.fields?.assignee?.displayName,
    created: createdAt
  };

  const command = buildFraudCommand(caseObj, panels);

  if (req.user) {
    logAction({
      userEmail: req.user.email,
      action: 'FRAUD_CASE_VIEW',
      resourceId: id,
      details: { userId, txnCount: txns.length }
    });
  }

  res.json({ case: caseObj, panels, command });
});

// POST /api/fraud/decision
router.post('/decision', (req, res) => {
  const { caseId, decision, notes } = req.body;
  if (!caseId || !decision) return res.status(400).json({ error: 'caseId and decision required' });
  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'FRAUD_DECISION',
    resourceId: caseId,
    decision,
    details: { notes }
  });
  res.json({ success: true, logged: true });
});

module.exports = router;
