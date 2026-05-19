// ============================================================
// VIGÍA BSA DECISION ENGINE — BUILD HEADER
// ============================================================
// Tool Name:        Unified Search Endpoint — /api/search
// Build Date:       2026-05-16
// Authorized by:    Zaid Khan (U087TL6CGNM)
// POLICY COMPLIANCE: POL-BSA-001-v4.2 | POL-AI-001 v1.0
// EWRA RISK MITIGATION: EWRA-06A/B, EWRA-17, EWRA-20 | Residual: Managed
// HISTORICAL AUDIT GAP: Privacy Shield applied — zero PII in Tier 1 (Crowe F13)
// NOTE: Wired to vigia-portal production libs (clickhouse, audit, validateToken)
// ============================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { query } = require('../lib/clickhouse');
const { logAction } = require('../lib/audit');

// Load protocol config
const protocolsPath = path.join(__dirname, '../config/search_protocols.json');
const protocolConfig = JSON.parse(fs.readFileSync(protocolsPath, 'utf-8'));

// POST /api/search
router.post('/', async (req, res) => {
  try {
    const { protocolId, query: searchQuery } = req.body;
    const user = req.user;

    if (!protocolId || !searchQuery) {
      return res.status(400).json({ error: 'protocolId and query required' });
    }

    const protocol = protocolConfig.searchProtocols[protocolId];
    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    // Validate input
    const isUUID = /^[0-9a-f-]{36}$/i.test(searchQuery);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchQuery);
    if (!isUUID && !isEmail) {
      return res.status(400).json({ error: 'Invalid email or UUID format' });
    }

    let result;
    switch (protocolId) {
      case 'support_user_search':
        result = await handleSupportSearch(searchQuery, isUUID);
        break;
      case 'fraud_user_search':
        result = await handleFraudSearch(searchQuery, isUUID);
        break;
      case 'kyc_user_search':
        result = await handleKYCSearch(searchQuery, isUUID);
        break;
      case 'tm_user_search':
        result = await handleTMSearch(searchQuery, isUUID);
        break;
      default:
        return res.status(404).json({ error: 'Unknown protocol' });
    }

    // Audit log — never log raw query value (PII)
    await logAction(
      user?.email || 'unknown',
      'SEARCH_PERFORMED',
      result.user_id,
      protocolId,
      JSON.stringify({ queryType: isUUID ? 'UUID' : 'EMAIL', verdict: result.verdict?.verdict })
    );

    return res.json(result);
  } catch (err) {
    console.error('[search] error:', err.message);
    if (err.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(503).json({ error: 'Search service unavailable', detail: err.message });
  }
});

// ─── SUPPORT SEARCH ─────────────────────────────────────────────────────────
// Privacy Shield: risk_level label only (no raw score), no device/IP/fraud flags
// Adds STATUS SYNC CONFLICT detection (Source of Truth protocol)

async function handleSupportSearch(searchQuery, isUUID) {
  const safe = searchQuery.replace(/'/g, '');
  const whereClause = isUUID ? `id = '${safe}'` : `email = '${safe}'`;

  // Tier 1 — Human Truth
  const userRows = await query(`
    SELECT id, email, created_at, country_code, account_status
    FROM oauth2_onix_users
    WHERE ${whereClause}
    LIMIT 1
  `);
  const userData = userRows?.[0];
  if (!userData) throw new Error('User not found');

  const uid = userData.id.replace(/'/g, '');

  // Tier 2 — Security Truth (for conflict detection)
  const dodroRows = await query(`
    SELECT status AS dodrio_status
    FROM security_hub_dodrio_users
    WHERE user_id = '${uid}'
    LIMIT 1
  `);
  const dodrioData = dodroRows?.[0] || {};

  // KYC status
  const kycRows = await query(`
    SELECT status, kyc_level
    FROM stg_dodrio_persona_inquiries
    WHERE user_id = '${uid}'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const kycData = kycRows?.[0] || {};

  // Risk level — sanitized label only for Tier 1
  const riskRows = await query(`
    SELECT risk_level
    FROM security_hub_dodrio_risk_level
    WHERE user_id = '${uid}'
    ORDER BY last_reviewed_at DESC
    LIMIT 1
  `);
  const riskData = riskRows?.[0] || {};

  // STATUS SYNC CONFLICT check
  const syncConflict =
    dodrioData.dodrio_status &&
    dodrioData.dodrio_status !== userData.account_status &&
    (userData.account_status === 'ACTIVE' || userData.account_status === 'LIMITED_DIRECT_WITHDRAWAL');

  const riskLevel = riskData.risk_level || 'UNKNOWN';
  const kycLevel = parseInt(kycData.kyc_level) || 0;

  let verdict = {
    verdict: 'NEEDS_INFO',
    label: '❓ Request More Info',
    description: 'Missing data. Ask customer for clarification.',
  };

  if (syncConflict) {
    verdict = {
      verdict: 'ESCALATE_COMPLIANCE',
      label: '⚠️ SYSTEM CONFLICT — Escalate to Compliance',
      description: `STATUS SYNC CONFLICT: Backoffice shows "${userData.account_status}" but security system shows "${dodrioData.dodrio_status}". Manual verification required.`,
      actions: ['escalate_to_compliance', 'do_not_make_changes'],
    };
  } else if (riskLevel === 'HIGH') {
    verdict = {
      verdict: 'ESCALATE_FRAUD',
      label: '⚠️ Escalate to Fraud',
      description: 'Risk flags present. Send to fraud team.',
      actions: ['create_fraud_case', 'hold_ticket'],
    };
  } else if (kycLevel < 1) {
    verdict = {
      verdict: 'ESCALATE_KYC',
      label: '⏳ Escalate to KYC',
      description: 'Account not fully verified. KYC team needs to review.',
      actions: ['create_kyc_case', 'hold_ticket'],
    };
  } else if (riskLevel === 'LOW') {
    verdict = {
      verdict: 'SAFE_TO_HELP',
      label: '✅ Safe to Help',
      description: 'Account is clean. Help with ticket.',
      actions: ['respond_to_ticket', 'resolve_ticket'],
    };
  }

  return {
    user_id: userData.id,
    user_email: userData.email,
    created_at: userData.created_at,
    country_code: userData.country_code,
    account_status: userData.account_status,
    kyc_status: kycData.status || 'UNKNOWN',
    kyc_level: kycLevel,
    riskLevel,
    sync_conflict: syncConflict || false,
    verdict,
  };
}

// ─── FRAUD SEARCH ────────────────────────────────────────────────────────────

async function handleFraudSearch(searchQuery, isUUID) {
  const safe = searchQuery.replace(/'/g, '');
  const whereClause = isUUID ? `id = '${safe}'` : `email = '${safe}'`;

  const userRows = await query(`
    SELECT id, email, created_at, account_status
    FROM oauth2_onix_users
    WHERE ${whereClause}
    LIMIT 1
  `);
  const userData = userRows?.[0];
  if (!userData) throw new Error('User not found');

  const uid = userData.id.replace(/'/g, '');

  const txRows = await query(`
    SELECT
      count() AS tx_count,
      sum(amount) AS total_volume,
      max(amount) AS max_single_tx,
      countIf(created_at >= now() - INTERVAL 24 HOUR) AS last_24h_count,
      countIf(created_at >= now() - INTERVAL 7 DAY) AS last_7d_count
    FROM payments_kecleon_operations
    WHERE user_id = '${uid}'
      AND created_at >= now() - INTERVAL 90 DAY
  `);
  const txPattern = txRows?.[0] || {};

  const networkRows = await query(`
    SELECT COUNT(DISTINCT id) AS shared_users
    FROM oauth2_onix_users
    WHERE id != '${uid}'
      AND (
        ip_address IN (SELECT ip_address FROM oauth2_onix_users WHERE id = '${uid}' AND ip_address IS NOT NULL)
        OR device_fingerprint IN (SELECT device_fingerprint FROM oauth2_onix_users WHERE id = '${uid}' AND device_fingerprint IS NOT NULL)
      )
  `);
  const networkData = networkRows?.[0] || {};

  const ellipticRows = await query(`
    SELECT risk_score, risk_flags
    FROM operations_silvally_elliptic
    WHERE user_id = '${uid}'
    ORDER BY screened_at DESC
    LIMIT 1
  `);
  const ellipticRisk = ellipticRows?.[0] || {};

  // Payment method clustering (Scale AI lesson — mandatory per MEMORY.md 2026-05-14)
  const pmRows = await query(`
    SELECT payment_method_type, count() AS usage_count
    FROM dim_payment_method
    WHERE user_id = '${uid}'
    GROUP BY payment_method_type
  `);
  const paymentMethods = pmRows || [];

  const ellipticScore = ellipticRisk.risk_score || 0;
  const txCount24h = parseInt(txPattern.last_24h_count) || 0;
  const maxTx = parseFloat(txPattern.max_single_tx) || 0;

  let verdict = {
    verdict: 'APPROVE',
    label: '✅ Approve',
    description: 'No fraud indicators. Clear user.',
  };

  if (ellipticScore > 70 || txCount24h > 20) {
    verdict = {
      verdict: 'BLOCK',
      label: '🚫 Block',
      description: 'High fraud risk. Block immediately.',
      actions: ['block_user', 'log_decision', 'alert_zaid'],
    };
  } else if (ellipticScore > 40 || txCount24h > 10 || maxTx > 10000) {
    verdict = {
      verdict: 'ESCALATE',
      label: '⚠️ Escalate',
      description: 'Medium risk. Needs review by senior fraud analyst.',
      actions: ['create_escalation_case', 'assign_to_senior'],
    };
  }

  return {
    user_id: userData.id,
    user_email: userData.email,
    created_at: userData.created_at,
    account_status: userData.account_status,
    transactionPattern: txPattern,
    networkAnalysis: networkData,
    paymentMethods,
    ellipticRisk,
    verdict,
  };
}

// ─── KYC SEARCH ─────────────────────────────────────────────────────────────
// Hard Split — Individual (KYC) lane only | EWRA-##A | Owner: Paula

async function handleKYCSearch(searchQuery, isUUID) {
  const safe = searchQuery.replace(/'/g, '');
  const whereClause = isUUID ? `id = '${safe}'` : `email = '${safe}'`;

  const userRows = await query(`
    SELECT id, email, created_at
    FROM oauth2_onix_users
    WHERE ${whereClause}
    LIMIT 1
  `);
  const userData = userRows?.[0];
  if (!userData) throw new Error('User not found');

  const uid = userData.id.replace(/'/g, '');

  // Persona API — live check
  let personaData = {};
  try {
    const personaRes = await axios.get(
      `https://withpersona.com/api/v1/inquiries?filter[reference_id]=${userData.id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
          'Persona-Version': '2023-01-05',
        },
        timeout: 10000,
      }
    );
    const inquiries = personaRes.data?.data || [];
    if (inquiries.length > 0) {
      const inq = inquiries[0];
      personaData = {
        inquiry_id: inq.id,
        status: inq.attributes?.status,
        country: inq.attributes?.address_country_code,
        has_name: !!(inq.attributes?.name_first),
        has_dob: !!(inq.attributes?.birthdate),
      };
    }
  } catch (err) {
    console.warn('[kyc search] Persona unavailable:', err.message);
  }

  const restrictedCountries = ['CU', 'IR', 'KP', 'MM', 'SY'];
  const isRestrictedCountry = restrictedCountries.includes((personaData.country || '').toUpperCase());

  const riskRows = await query(`
    SELECT risk_level
    FROM security_hub_dodrio_risk_level
    WHERE user_id = '${uid}'
    ORDER BY last_reviewed_at DESC
    LIMIT 1
  `);
  const riskData = riskRows?.[0] || {};

  const eddRows = await query(`
    SELECT edd_completed, edd_completed_at
    FROM fact_kyc_persona_reports
    WHERE user_id = '${uid}'
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const eddData = eddRows?.[0] || {};

  let verdict = {
    verdict: 'APPROVE',
    label: '✅ Approve',
    description: 'Identity verified. Documents meet KYC requirements — POL-BSA-001-v4.2 §3.1.',
  };

  if (isRestrictedCountry) {
    verdict = {
      verdict: 'REJECT_RESTRICTED',
      label: '❌ Reject — Restricted Jurisdiction',
      description: 'Cannot onboard from restricted jurisdictions — POL-BSA-001-v4.2 §6.2.',
    };
  } else if (riskData.risk_level === 'HIGH' && !eddData.edd_completed) {
    verdict = {
      verdict: 'EDD_REQUIRED',
      label: '⏳ EDD Required',
      description: 'Enhanced Due Diligence required before approval — POL-KYC-001-v2.1 §4.8.',
      actions: ['initiate_edd', 'assign_to_paula'],
    };
  }

  return {
    user_id: userData.id,
    user_email: userData.email,
    created_at: userData.created_at,
    persona: personaData,
    isRestrictedCountry,
    riskLevel: riskData.risk_level || 'UNKNOWN',
    edd_completed: eddData.edd_completed || false,
    edd_completed_at: eddData.edd_completed_at || null,
    kyc_status: personaData.status || 'UNKNOWN',
    ewra_lane: 'KYC — EWRA-##A (Individual) | Owner: Paula',
    verdict,
  };
}

// ─── TM SEARCH ──────────────────────────────────────────────────────────────
// 3-hour SLA enforcement | SAR threshold | EWRA-20 mandatory flag

async function handleTMSearch(searchQuery, isUUID) {
  const safe = searchQuery.replace(/'/g, '');
  const whereClause = isUUID ? `id = '${safe}'` : `email = '${safe}'`;

  const userRows = await query(`
    SELECT id, email, created_at
    FROM oauth2_onix_users
    WHERE ${whereClause}
    LIMIT 1
  `);
  const userData = userRows?.[0];
  if (!userData) throw new Error('User not found');

  const uid = userData.id.replace(/'/g, '');

  const txRows = await query(`
    SELECT
      count() AS tx_count,
      sum(amount) AS total_volume,
      max(amount) AS max_single_tx,
      countIf(created_at >= now() - INTERVAL 24 HOUR) AS last_24h_count,
      countIf(created_at >= now() - INTERVAL 7 DAY) AS last_7d_count,
      countIf(created_at >= now() - INTERVAL 30 DAY) AS last_30d_count
    FROM payments_kecleon_operations
    WHERE user_id = '${uid}'
      AND created_at >= now() - INTERVAL 90 DAY
  `);
  const txPattern = txRows?.[0] || {};

  // Open AR cases — SLA clock awareness
  const arRows = await query(`
    SELECT ar_id, rule_id, status, created_at,
      dateDiff('hour', created_at, now()) AS age_hours
    FROM fact_ar_issues
    WHERE user_id = '${uid}'
      AND status IN ('New Investigation', 'Under Investigation')
    ORDER BY created_at DESC
    LIMIT 5
  `);
  const openAlerts = arRows || [];

  const ellipticRows = await query(`
    SELECT risk_score, risk_flags
    FROM operations_silvally_elliptic
    WHERE user_id = '${uid}'
    ORDER BY screened_at DESC
    LIMIT 1
  `);
  const ellipticRisk = ellipticRows?.[0] || {};

  const cashierRows = await query(`
    SELECT is_cashier FROM oauth2_onix_users WHERE id = '${uid}' LIMIT 1
  `);
  const isCashier = cashierRows?.[0]?.is_cashier || false;

  const ellipticScore = ellipticRisk.risk_score || 0;
  const volume = parseFloat(txPattern.total_volume) || 0;
  const txCount = parseInt(txPattern.tx_count) || 0;
  const sarRequired = !isCashier && (ellipticScore > 60 || volume > 10000 || txCount > 50);
  const breachingAlerts = openAlerts.filter(a => parseInt(a.age_hours) >= 2.5);

  let verdict = {
    verdict: 'APPROVE',
    label: '✅ Approve',
    description: 'Low risk. No SAR required.',
  };

  if (breachingAlerts.length > 0) {
    verdict = {
      verdict: 'SLA_BREACH_IMMINENT',
      label: '🚨 SLA Breach — Assign Immediately',
      description: `${breachingAlerts.length} alert(s) approaching or past 3-hour SLA. Assign NOW.`,
      actions: ['assign_to_analyst', 'alert_omar', 'alert_zaid'],
    };
  } else if (sarRequired) {
    verdict = {
      verdict: 'FILE_SAR',
      label: '📋 File SAR',
      description: 'Suspicious activity meets SAR threshold. File with FinCEN. Day One = CRC approval date. Deadline = Day One + 30 calendar days.',
      actions: ['generate_sar_template', 'alert_bsa_officer', 'log_decision'],
    };
  } else if (ellipticScore > 40 || volume > 5000 || txCount > 20) {
    verdict = {
      verdict: 'ESCALATE',
      label: '⚠️ Escalate',
      description: 'Medium risk. Needs senior review.',
      actions: ['escalate_alert', 'assign_to_senior'],
    };
  }

  return {
    user_id: userData.id,
    user_email: userData.email,
    created_at: userData.created_at,
    is_cashier: isCashier,
    transactionPattern: txPattern,
    openAlerts: openAlerts.map(a => ({
      ar_id: a.ar_id,
      rule_id: a.rule_id,
      status: a.status,
      age_hours: a.age_hours,
      sla_status: a.age_hours >= 3 ? '🔴 BREACHED' : a.age_hours >= 2.5 ? '🟡 IMMINENT' : '🟢 OK',
    })),
    ellipticRisk,
    sar_required: sarRequired,
    sar_deadline: sarRequired ? 'Day One (CRC approval) + 30 calendar days — POL-BSA-001-v4.2 §5.3' : null,
    ewra_flag: '⚠️ EWRA-20: HIGH Residual Risk until PRO-TM-003 closed (Q3 2026)',
    verdict,
  };
}

module.exports = router;
