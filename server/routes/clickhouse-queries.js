// ============================================================
// VIGÍA CLICKHOUSE INTELLIGENCE QUERIES
// ============================================================
// Tool Name:        VIGÍA Portal — ClickHouse Quick Intelligence API
// Build Date:       2026-06-02
// Authorized by:    Zaid Khan (U087TL6CGNM)
// POLICY COMPLIANCE: POL-BSA-001-v4.2
// Source skills:    adal-bi, sherlock-query-library
// ============================================================

const express = require('express');
const router = express.Router();
const ch = require('../lib/clickhouse');
const { logAction } = require('../lib/audit');

// ── Helper: safe CH query with fallback ──────────────────────────
async function safeQuery(sql, params = {}) {
  try {
    return { ok: true, data: await ch.query(sql, params) };
  } catch (err) {
    console.error('[CH Quick Query]', err.message);
    return { ok: false, error: 'Data unavailable', details: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// POST /api/ch/user-transactions
// body: { userId }
// Returns transaction pattern for a user over last 30 days
// Source: analytics_finance.fact_trx (adal-bi canonical table)
// ─────────────────────────────────────────────────────────────────
router.post('/user-transactions', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const result = await safeQuery(`
    SELECT
      COUNT(*) AS txn_count,
      ROUND(SUM(usd_amount), 2) AS total_volume_usd,
      ROUND(AVG(usd_amount), 2) AS avg_amount_usd,
      topK(5)(transaction_type) AS top_types
    FROM analytics_finance.fact_trx
    WHERE (user_id = {userId: String} OR second_party_id = {userId: String})
      AND is_internal_trx = 0
      AND status = 'completed'
      AND created_at >= now() - INTERVAL 30 DAY
    FORMAT JSONEachRow
  `, { userId });

  if (!result.ok) return res.json({ error: result.error });

  const row = result.data?.[0] || {};

  // Also get per-type breakdown
  const typesResult = await safeQuery(`
    SELECT
      transaction_type,
      COUNT(*) AS cnt
    FROM analytics_finance.fact_trx
    WHERE (user_id = {userId: String} OR second_party_id = {userId: String})
      AND is_internal_trx = 0
      AND status = 'completed'
      AND created_at >= now() - INTERVAL 30 DAY
    GROUP BY transaction_type
    ORDER BY cnt DESC
    LIMIT 5
    FORMAT JSONEachRow
  `, { userId });

  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'CH_USER_TRANSACTIONS',
    resourceId: userId,
    details: { txnCount: row.txn_count || 0 }
  });

  res.json({
    count: parseInt(row.txn_count || 0),
    totalVolumeUsd: parseFloat(row.total_volume_usd || 0),
    avgAmountUsd: parseFloat(row.avg_amount_usd || 0),
    topTypes: typesResult.ok ? typesResult.data.map(r => ({ type: r.transaction_type, count: parseInt(r.cnt) })) : []
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/ch/dodrio-pep-check
// body: { userId }
// Returns PEP flags from Dodrio automated screening
// Source: data_lake.security_hub_dodrio_reports
// Key finding: 380K checks, 0.4% hit rate (1,340 users)
// ─────────────────────────────────────────────────────────────────
router.post('/dodrio-pep-check', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const result = await safeQuery(`
    SELECT
      name,
      result,
      has_match,
      status,
      created_at
    FROM data_lake.security_hub_dodrio_reports
    WHERE user_id = {userId: String}
      AND name = 'politically_exposed_person'
    ORDER BY created_at DESC
    LIMIT 10
    FORMAT JSONEachRow
  `, { userId });

  if (!result.ok) return res.json({ error: result.error });

  const matches = result.data || [];
  const hasPepFlag = matches.some(m => m.has_match === 1 || m.has_match === true || m.has_match === '1');

  // Also check backoffice tags
  const tagResult = await safeQuery(`
    SELECT tag_name, created_at
    FROM analytics_product.dim_client_tag
    WHERE user_id = {userId: String}
      AND lower(tag_name) LIKE '%pep%'
    ORDER BY created_at DESC
    LIMIT 5
    FORMAT JSONEachRow
  `, { userId });

  const backofficeFlags = tagResult.ok ? tagResult.data || [] : [];

  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'CH_DODRIO_PEP_CHECK',
    resourceId: userId,
    details: { hasPepFlag, matchCount: matches.length }
  });

  res.json({
    hasPepFlag: hasPepFlag || backofficeFlags.length > 0,
    dodrioMatches: matches.map(m => ({
      type: m.name,
      result: m.result,
      hasMatch: !!(m.has_match === 1 || m.has_match === true || m.has_match === '1'),
      status: m.status,
      createdAt: m.created_at
    })),
    backofficeFlags: backofficeFlags.map(t => ({ tag: t.tag_name, createdAt: t.created_at })),
    identificationPath: hasPepFlag ? 'Dodrio automated' : backofficeFlags.length > 0 ? 'Manual Backoffice' : 'None'
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/ch/kyc-funnel-status
// body: { userId }
// Returns current KYC status from user status history
// Source: data_lake.security_hub_dodrio_user_status_history
// ─────────────────────────────────────────────────────────────────
router.post('/kyc-funnel-status', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const result = await safeQuery(`
    SELECT
      status,
      created_at
    FROM data_lake.security_hub_dodrio_user_status_history
    WHERE user_id = {userId: String}
    ORDER BY created_at DESC
    LIMIT 10
    FORMAT JSONEachRow
  `, { userId });

  if (!result.ok) return res.json({ error: result.error });

  const history = result.data || [];
  const currentStatus = history[0]?.status || 'Unknown';

  res.json({
    currentStatus,
    statusHistory: history.map(h => ({
      status: h.status,
      createdAt: h.created_at
    }))
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/ch/commops-complaint-reasons
// No body needed — aggregate query, last 30 days
// Source: analytics_commops.fact_ticket
// ─────────────────────────────────────────────────────────────────
router.post('/commops-complaint-reasons', async (req, res) => {
  const result = await safeQuery(`
    SELECT
      COALESCE(category, type, subject, 'Uncategorized') AS reason,
      COUNT(*) AS cnt,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) AS pct
    FROM analytics_commops.fact_ticket
    WHERE created_at >= now() - INTERVAL 30 DAY
    GROUP BY reason
    ORDER BY cnt DESC
    LIMIT 10
    FORMAT JSONEachRow
  `);

  if (!result.ok) {
    // Try alternate column names
    const alt = await safeQuery(`
      SELECT
        type AS reason,
        COUNT(*) AS cnt,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) AS pct
      FROM analytics_commops.fact_ticket
      WHERE created_at >= now() - INTERVAL 30 DAY
      GROUP BY type
      ORDER BY cnt DESC
      LIMIT 10
      FORMAT JSONEachRow
    `);
    if (!alt.ok) return res.json({ error: 'Data unavailable — commops table schema may have changed' });
    return res.json({ reasons: (alt.data || []).map(r => ({ reason: r.reason, count: parseInt(r.cnt), pct: parseFloat(r.pct) })) });
  }

  res.json({
    reasons: (result.data || []).map(r => ({
      reason: r.reason,
      count: parseInt(r.cnt),
      pct: parseFloat(r.pct)
    }))
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/ch/dodrio-clear-rate
// No body — aggregate
// Source: data_lake.security_hub_dodrio_reports
// Context: portal-wide facial/document check pass rates
// ─────────────────────────────────────────────────────────────────
router.post('/dodrio-clear-rate', async (req, res) => {
  const result = await safeQuery(`
    SELECT
      name,
      COUNT(*) AS total,
      COUNTIf(result = 'clear') AS clear_count,
      ROUND(100.0 * COUNTIf(result = 'clear') / COUNT(*), 1) AS clear_rate
    FROM data_lake.security_hub_dodrio_reports
    WHERE name IN ('facial_similarity', 'document')
      AND status = 'completed'
      AND created_at >= now() - INTERVAL 30 DAY
    GROUP BY name
    FORMAT JSONEachRow
  `);

  if (!result.ok) return res.json({ error: result.error });

  const data = result.data || [];
  const facial = data.find(r => r.name === 'facial_similarity') || {};
  const doc = data.find(r => r.name === 'document') || {};

  res.json({
    facialClearRate: parseFloat(facial.clear_rate || 0),
    facialTotal: parseInt(facial.total || 0),
    docClearRate: parseFloat(doc.clear_rate || 0),
    docTotal: parseInt(doc.total || 0),
    totalChecks: parseInt(facial.total || 0) + parseInt(doc.total || 0),
    periodDays: 30
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/ch/usva-inflows-today
// No body — today vs yesterday
// Source: data_lake.operations_silvally_virtual_account_adds
// USVA = non-SEPA; EURVA = SEPA; filter _peerdb_is_deleted = 0
// ─────────────────────────────────────────────────────────────────
router.post('/usva-inflows-today', async (req, res) => {
  const result = await safeQuery(`
    SELECT
      sumIf(amount, toDate(created_at) = today()
        AND (payment_rail IS NULL OR payment_rail != 'sepa')) AS usva_today,
      sumIf(amount, toDate(created_at) = yesterday()
        AND (payment_rail IS NULL OR payment_rail != 'sepa')) AS usva_yest,
      countIf(toDate(created_at) = today()
        AND (payment_rail IS NULL OR payment_rail != 'sepa')) AS usva_cnt_today,
      sumIf(amount, toDate(created_at) = today()
        AND payment_rail = 'sepa') AS eurva_today,
      sumIf(amount, toDate(created_at) = yesterday()
        AND payment_rail = 'sepa') AS eurva_yest
    FROM data_lake.operations_silvally_virtual_account_adds
    WHERE _peerdb_is_deleted = 0
      AND created_at >= today() - 2
    FORMAT JSONEachRow
  `);

  if (!result.ok) return res.json({ error: result.error });

  const row = result.data?.[0] || {};
  const todayVol = parseFloat(row.usva_today || 0);
  const yesterdayVol = parseFloat(row.usva_yest || 0);
  const change = yesterdayVol > 0 ? ((todayVol - yesterdayVol) / yesterdayVol) * 100 : 0;

  res.json({
    todayVol: Math.round(todayVol),
    yesterdayVol: Math.round(yesterdayVol),
    todayCount: parseInt(row.usva_cnt_today || 0),
    change: Math.round(change),
    eurva: {
      todayVol: Math.round(parseFloat(row.eurva_today || 0)),
      yesterdayVol: Math.round(parseFloat(row.eurva_yest || 0))
    }
  });
});

module.exports = router;
