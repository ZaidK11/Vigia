const express = require('express');
const router = express.Router();
const ch = require('../lib/clickhouse');
const { logAction, getTriagedUserIds } = require('../lib/audit');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

function buildKycCommand(app) {
  const docs = app.documents || {};
  return `Review KYC application ${app.id}:

Applicant: ${app.name || 'Unknown'}
Country: ${app.country || 'Unknown'}
Inquiry status: ${app.inquiryStatus || 'Unknown'}

Documents:
├─ National ID: ${docs.idStatus || 'Unknown'}
├─ Selfie / Liveness: ${docs.selfieStatus || 'Unknown'}
└─ Proof of address: ${docs.addressStatus || 'Unknown'}

Document verified: ${app.documentVerified ? '✅' : '❌'}
Facial verified: ${app.facialVerified ? '✅' : '❌'}
Watchlist verified: ${app.watchlistVerified ? '✅' : '❌'}

Persona case status: ${app.personaStatus || 'Unknown'}

Provide:
1. Recommendation (APPROVE / REJECT / REQUEST_DOCS / EDD_REQUIRED)
2. Any EDD flags or concerns
3. If rejecting, reason code
4. Confidence (HIGH / MEDIUM / LOW)`;
}

// GET /api/kyc/applications
router.get('/applications', async (req, res) => {
  const rows = await ch.query(`
    SELECT inquiry_id, user_id, inquiry_status, country_code, document_type, created_at
    FROM analytics_compliance.stg_dodrio_persona_inquiries
    WHERE inquiry_status IN ('pending', 'needs_review', 'created', 'failed', 'waiting')
    ORDER BY created_at ASC
    LIMIT 15
  `);

  const applications = rows.map(r => ({
    id: r.inquiry_id,
    userId: r.user_id,
    status: r.inquiry_status,
    country: r.country_code,
    docType: r.document_type,
    created: r.created_at
  }));

  res.json({ applications });
});

// GET /api/kyc/application/:id
router.get('/application/:id', async (req, res) => {
  const { id } = req.params;

  const [inquiryRows, personaCaseRows] = await Promise.all([
    ch.query(`
      SELECT inquiry_id, user_id, inquiry_status, country_code, document_type,
             first_name, last_name, birthdate, created_at, updated_at
      FROM analytics_compliance.stg_dodrio_persona_inquiries
      WHERE inquiry_id = '${id}'
      LIMIT 1
    `),
    ch.query(`
      SELECT inquiry_id, status, decision, created_at
      FROM data_lake.persona_cases
      WHERE inquiry_id = '${id}'
      LIMIT 1
    `).catch(() => [])
  ]);

  const inquiry = inquiryRows[0] || null;
  const personaCase = personaCaseRows[0] || null;

  let dodrioUser = null;
  if (inquiry?.user_id) {
    const uRows = await ch.query(`
      SELECT id, tier_level, status, document_verified, facial_verified, watchlist_verified,
             email, first_name, last_name
      FROM data_lake.security_hub_dodrio_users
      WHERE id = '${inquiry.user_id}' AND _peerdb_is_deleted = 0
      LIMIT 1
    `);
    dodrioUser = uRows[0] || null;
  }

  const name = inquiry
    ? `${inquiry.first_name || ''} ${inquiry.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';

  const app = {
    id,
    name,
    userId: inquiry?.user_id,
    email: dodrioUser?.email,
    country: inquiry?.country_code,
    inquiryStatus: inquiry?.inquiry_status,
    personaStatus: personaCase?.status,
    documentVerified: !!dodrioUser?.document_verified,
    facialVerified: !!dodrioUser?.facial_verified,
    watchlistVerified: !!dodrioUser?.watchlist_verified,
    kycTier: dodrioUser?.tier_level,
    documents: {
      idStatus: dodrioUser?.document_verified ? '✅ Verified' : '❓ Pending',
      selfieStatus: dodrioUser?.facial_verified ? '✅ Verified' : '❓ Pending',
      addressStatus: 'Not tracked separately'
    }
  };

  const command = buildKycCommand(app);

  if (req.user) {
    logAction({
      userEmail: req.user.email,
      action: 'KYC_APPLICATION_VIEW',
      resourceId: id,
      details: { userId: inquiry?.user_id }
    });
  }

  res.json({ application: app, command });
});

// ============================================================
// ALERT TRIAGE QUEUE — PEP / Watchlist / Adverse Media
// ============================================================

// GET /api/kyc/alert-queue
// Returns paginated list of ACTIVE users with unresolved PEP/WL/AM alerts
// sorted by risk score: check_type weight × 12-month volume
router.get('/alert-queue', async (req, res) => {
  const page    = parseInt(req.query.page  || '1');
  const limit   = parseInt(req.query.limit || '20');
  const filter  = req.query.filter  || 'all';   // all | pep | watchlist | adverse_media
  const sort    = req.query.sort    || 'risk';  // risk | volume | country
  const offset  = (page - 1) * limit;

  // Already-triaged user IDs from local audit log
  const triaged = new Set(getTriagedUserIds());

  // Check-type priority weights
  const TYPE_WEIGHT = { politically_exposed_person: 100, watchlist: 60, adverse_media: 30 };

  const typeFilter = filter !== 'all'
    ? `AND r.name = '${filter}'`
    : `AND r.name IN ('politically_exposed_person', 'watchlist', 'adverse_media')`;

  const rows = await ch.query(`
    SELECT
      r.user_id,
      groupArray(DISTINCT r.name)   AS alert_types,
      groupArray(DISTINCT r.result) AS results,
      any(u.email)                  AS email,
      any(u.country)                AS country,
      any(u.status)                 AS account_status,
      any(u.last_login_at)          AS last_login,
      COALESCE(SUM(t.trx_airtm_amount_usd), 0) AS vol_12m_usd,
      COUNT(DISTINCT t.trx_id)      AS trx_count_12m
    FROM (
      SELECT DISTINCT user_id, name, result
      FROM data_lake.security_hub_dodrio_reports
      WHERE name IN ('politically_exposed_person', 'watchlist', 'adverse_media')
        AND result IN ('consider', 'rejected', 'caution')
        ${typeFilter.replace('AND r.name', 'AND name').replace('AND r.name', 'AND name')}
    ) r
    JOIN data_lake.oauth2_onix_users u ON r.user_id = u.id AND u.status = 'ACTIVE'
    LEFT JOIN analytics_finance.fact_trx t
      ON t.client_id = r.user_id
      AND t.request_timestamp >= now() - INTERVAL 365 DAY
    GROUP BY r.user_id
    ORDER BY vol_12m_usd DESC
    LIMIT ${limit + offset}
  `).catch(() => []);

  // Filter out already-triaged, apply offset/limit, compute risk score
  const untriaged = rows.filter(r => !triaged.has(r.user_id));

  // Risk score = max alert type weight × log(vol+1)
  const scored = untriaged.map(r => {
    const types = Array.isArray(r.alert_types) ? r.alert_types : [];
    const maxWeight = Math.max(...types.map(t => TYPE_WEIGHT[t] || 0), 0);
    const vol = parseFloat(r.vol_12m_usd || 0);
    const riskScore = maxWeight * Math.log10(vol + 10);
    return { ...r, riskScore: Math.round(riskScore) };
  });

  // Final sort
  if (sort === 'risk')   scored.sort((a, b) => b.riskScore - a.riskScore);
  if (sort === 'volume') scored.sort((a, b) => parseFloat(b.vol_12m_usd) - parseFloat(a.vol_12m_usd));
  if (sort === 'country') scored.sort((a, b) => (a.country||'').localeCompare(b.country||''));

  const page_items = scored.slice(0, limit);

  res.json({
    total: untriaged.length,
    triaged: triaged.size,
    page,
    limit,
    items: page_items
  });
});

// GET /api/kyc/alert-detail/:userId
// Returns full alert context for a single user — used by the pre-enrichment panel
router.get('/alert-detail/:userId', async (req, res) => {
  const { userId } = req.params;

  const [alertRows, userRow, txRows] = await Promise.all([
    ch.query(`
      SELECT name, result, created_at
      FROM data_lake.security_hub_dodrio_reports
      WHERE user_id = '${userId}'
        AND name IN ('politically_exposed_person', 'watchlist', 'adverse_media')
        AND result IN ('consider', 'rejected', 'caution')
      ORDER BY created_at DESC
      LIMIT 20
    `).catch(() => []),
    ch.query(`
      SELECT id, email, country, status, first_name, last_name, created_at, last_login_at
      FROM data_lake.oauth2_onix_users
      WHERE id = '${userId}'
      LIMIT 1
    `).catch(() => []),
    ch.query(`
      SELECT
        COUNT(DISTINCT trx_id)            AS trx_total,
        ROUND(SUM(trx_airtm_amount_usd), 2) AS vol_total_usd,
        ROUND(MAX(trx_airtm_amount_usd), 2) AS max_single_txn,
        MIN(request_timestamp)            AS first_txn,
        MAX(request_timestamp)            AS last_txn
      FROM analytics_finance.fact_trx
      WHERE client_id = '${userId}'
        AND request_timestamp >= now() - INTERVAL 365 DAY
    `).catch(() => [])
  ]);

  const user = userRow[0] || {};
  const txStats = txRows[0] || {};
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';

  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'ALERT_TRIAGE_VIEW',
    resourceId: userId,
    details: { alertCount: alertRows.length }
  });

  res.json({
    userId,
    name,
    email:      user.email,
    country:    user.country,
    status:     user.status,
    registered: user.created_at,
    lastLogin:  user.last_login_at,
    alerts:     alertRows,
    txStats: {
      trxTotal:    parseInt(txStats.trx_total   || 0),
      volTotalUsd: parseFloat(txStats.vol_total_usd || 0),
      maxSingleTxn: parseFloat(txStats.max_single_txn || 0),
      firstTxn:    txStats.first_txn,
      lastTxn:     txStats.last_txn
    }
  });
});

// POST /api/kyc/alert-triage
// SSE stream: Claude pre-enrichment — returns structured risk brief + RECOMMENDATION
// Body: { userId, name, email, country, alerts[], txStats{} }
router.post('/alert-triage', async (req, res) => {
  const { userId, name, email, country, alerts, txStats } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const alertSummary = (alerts || []).map(a =>
    `  - ${a.name}: result=${a.result} (${a.created_at ? a.created_at.slice(0,10) : 'unknown date'})`
  ).join('\n');

  const prompt = `You are VIGÍA — a senior AML compliance analyst at Airtm (US MSB / FinCEN).
You are conducting a PEP / Watchlist / Adverse Media alert triage.

USER DATA
---------
User ID : ${userId}
Name    : ${name || 'Unknown'}
Email   : ${email || 'Unknown'}
Country : ${country || 'Unknown'}

DODRIO ALERT FLAGS (unresolved)
-------------------------------
${alertSummary || '  (none provided)'}

12-MONTH TRANSACTION PROFILE
-----------------------------
Total transactions : ${txStats?.trxTotal ?? 'N/A'}
Total volume (USD) : $${txStats?.volTotalUsd?.toLocaleString?.() ?? 'N/A'}
Largest single txn : $${txStats?.maxSingleTxn?.toLocaleString?.() ?? 'N/A'}
First txn          : ${txStats?.firstTxn?.slice(0,10) ?? 'N/A'}
Last txn           : ${txStats?.lastTxn?.slice(0,10) ?? 'N/A'}

INSTRUCTIONS
------------
Analyze this alert profile and provide a structured triage brief. Use this EXACT format:

RISK LEVEL: [HIGH / MEDIUM / LOW]

ALERT SUMMARY:
- [Bullet: what type of alert, result, and when it was flagged]
- [Bullet for each distinct alert type]

TRANSACTION RISK FACTORS:
- [Bullet: any notable volume/pattern concerns]
- [Bullet: frequency, max txn, etc — or note if low activity]

COUNTRY RISK: [Brief note on ${country || 'the user\'s country'} AML risk — FATF list? OFAC concerns? High-risk corridor?]

RECOMMENDATION: [CLEAR / EDD_REQUIRED / ESCALATE_TO_BSA_OFFICER]

REASONING: [2-3 sentences explaining the recommendation — tie to specific data above]

NEXT STEP FOR ANALYST: [One concrete action Estefanía should take right now — specific and brief]`;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');

  try {
    const stream = await anthropic.messages.stream({
      model:      MODEL,
      max_tokens: 800,
      messages:   [{ role: 'user', content: prompt }]
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }

    logAction({
      userEmail: req.user?.email || 'unknown',
      action:    'ALERT_TRIAGE_AI',
      resourceId: userId,
      details:   { alertCount: alerts?.length || 0, country }
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /api/kyc/alert-decision
// Log analyst decision on an alert
// Body: { userId, decision, notes }
router.post('/alert-decision', (req, res) => {
  const { userId, decision, notes } = req.body;
  if (!userId || !decision) return res.status(400).json({ error: 'userId and decision required' });

  logAction({
    userEmail:  req.user?.email || 'unknown',
    action:     'ALERT_TRIAGE_DECISION',
    resourceId: userId,
    decision,
    details:    { notes }
  });

  res.json({ success: true });
});

// POST /api/kyc/decision
router.post('/decision', (req, res) => {
  const { applicationId, decision, notes } = req.body;
  if (!applicationId || !decision) return res.status(400).json({ error: 'applicationId and decision required' });
  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'KYC_DECISION',
    resourceId: applicationId,
    decision,
    details: { notes }
  });
  res.json({ success: true, logged: true });
});

module.exports = router;
