// ============================================================
// VIGÍA Analytics — Unified Metrics API
// Support + KYC + TM dashboards
// Authorized by: Zaid Khan (U087TL6CGNM)
// ============================================================
const express = require('express');
const router = express.Router();
const axios = require('axios');
const ch = require('../lib/clickhouse');
const jira = require('../lib/jira');

const FD_BASE = process.env.FRESHDESK_BASE_URL || 'https://airtm.freshdesk.com/api/v2';
const FD_KEY  = process.env.FRESHDESK_KEY || '';

function fdAuth() { return { username: FD_KEY, password: 'X' }; }

async function fdGet(path, params = {}) {
  try {
    const res = await axios.get(`${FD_BASE}${path}`, {
      auth: fdAuth(), params,
      headers: { Accept: 'application/json' }, timeout: 20000
    });
    return res.data;
  } catch (err) {
    console.error(`[Analytics/FD] ${path}:`, err.response?.status, err.message);
    return null;
  }
}

// ── Date helpers ─────────────────────────────────────────────────
function parseRange(req) {
  const now = new Date();
  const to   = req.query.date_to   ? new Date(req.query.date_to)   : now;
  const from = req.query.date_from ? new Date(req.query.date_from) : new Date(now - 30*24*60*60*1000);
  return { from, to,
    fromISO: from.toISOString(),
    toISO:   to.toISOString(),
    fromFD:  Math.floor(from.getTime()/1000),
    toCH:    to.toISOString().replace('T',' ').slice(0,19),
    fromCH:  from.toISOString().replace('T',' ').slice(0,19),
  };
}

function diffMin(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}
function diffHr(a, b) {
  return parseFloat(((new Date(b) - new Date(a)) / 3600000).toFixed(2));
}

// ── Compliance group IDs cache ────────────────────────────────────
let _compGroupIds = null;
async function getComplianceGroupIds() {
  if (_compGroupIds) return _compGroupIds;
  const groups = await fdGet('/groups', { per_page: 100 });
  if (!groups) return [];
  const COMP_NAMES = [
    '1st level - compliance','compliance arg','compliance ind',
    'compliance kyc','compliance kyb','compliance tm',
    'fraud & risk prevention','verifications - personal'
  ];
  _compGroupIds = (groups || [])
    .filter(g => COMP_NAMES.includes((g.name||'').toLowerCase()))
    .map(g => g.id);
  return _compGroupIds;
}

// ── Fetch all Freshdesk tickets (paginated) in date range ─────────
async function fetchFdTickets({ from, to, complianceOnly = false } = {}) {
  const groupIds = complianceOnly ? await getComplianceGroupIds() : [];
  const allTickets = [];
  let page = 1;
  const updatedSince = from.toISOString();
  while (true) {
    const batch = await fdGet('/tickets', {
      per_page: 100, page,
      updated_since: updatedSince,
      include: 'stats,requester'
    });
    if (!batch || batch.length === 0) break;
    for (const t of batch) {
      if (complianceOnly && groupIds.length && !groupIds.includes(t.group_id)) continue;
      const created = new Date(t.created_at);
      if (created < from || created > to) continue;
      allTickets.push(t);
    }
    if (batch.length < 100) break;
    page++;
    if (page > 20) break; // safety cap
  }
  return allTickets;
}

// ── /api/analytics/support/metrics ───────────────────────────────
router.get('/support/metrics', async (req, res) => {
  try {
    const range = parseRange(req);
    const complianceOnly = req.query.compliance_only === 'true';
    const agentFilter   = req.query.agent_id || null;
    const statusFilter  = req.query.status ? req.query.status.split(',') : null;
    const priorityMap   = { 1:'low', 2:'medium', 3:'high', 4:'urgent' };
    const statusMap     = { 2:'open', 3:'pending', 4:'resolved', 5:'closed', 6:'on_hold' };

    const tickets = await fetchFdTickets({ from: range.from, to: range.to, complianceOnly });

    // Agent names from employee resolver (best effort)
    const byAgent = {};
    const byStatus = {};
    const byPriority = {};
    const byCategoryRaw = {};
    const trend = {}; // date → count

    let totalFirstResponseMin = 0, countWithResponse = 0;
    let totalResolutionHr = 0, countResolved = 0;
    let slaBreached = 0, slaTotal = 0;

    for (const t of tickets) {
      const statusStr = statusMap[t.status] || 'unknown';
      if (statusFilter && !statusFilter.includes(statusStr)) continue;
      if (agentFilter && String(t.responder_id) !== String(agentFilter)) continue;

      // Status bucket
      byStatus[statusStr] = (byStatus[statusStr] || 0) + 1;

      // Priority
      const pri = priorityMap[t.priority] || 'medium';
      byPriority[pri] = (byPriority[pri] || 0) + 1;

      // Trend
      const day = t.created_at.slice(0, 10);
      if (!trend[day]) trend[day] = { total: 0, compliance: 0, general: 0 };
      trend[day].total++;
      const gIds = await getComplianceGroupIds();
      if (gIds.includes(t.group_id)) trend[day].compliance++;
      else trend[day].general++;

      // Tags → category
      (t.tags || []).forEach(tag => {
        byCategoryRaw[tag] = (byCategoryRaw[tag] || 0) + 1;
      });

      // First response (stats.first_responded_at)
      if (t.stats?.first_responded_at && t.created_at) {
        const mins = diffMin(t.created_at, t.stats.first_responded_at);
        if (mins >= 0) {
          totalFirstResponseMin += mins;
          countWithResponse++;
          slaTotal++;
          if (mins > 30) slaBreached++;
        }
      }

      // Resolution time
      if ((statusStr === 'resolved' || statusStr === 'closed') && t.stats?.resolved_at) {
        const hrs = diffHr(t.created_at, t.stats.resolved_at);
        if (hrs >= 0) { totalResolutionHr += hrs; countResolved++; }
      }

      // Agent
      const aid = t.responder_id || 'unassigned';
      if (!byAgent[aid]) byAgent[aid] = {
        agent_id: aid, name: t.responder_id ? `Agent #${aid}` : 'Unassigned',
        assigned: 0, avg_response_min: 0, total_response_min: 0, response_count: 0,
        avg_resolution_hr: 0, total_resolution_hr: 0, resolution_count: 0,
        sla_total: 0, sla_breached: 0
      };
      byAgent[aid].assigned++;
      if (t.stats?.first_responded_at && t.created_at) {
        const m = diffMin(t.created_at, t.stats.first_responded_at);
        if (m >= 0) {
          byAgent[aid].total_response_min += m;
          byAgent[aid].response_count++;
          byAgent[aid].sla_total++;
          if (m > 30) byAgent[aid].sla_breached++;
        }
      }
      if ((statusStr === 'resolved' || statusStr === 'closed') && t.stats?.resolved_at) {
        const h = diffHr(t.created_at, t.stats.resolved_at);
        if (h >= 0) { byAgent[aid].total_resolution_hr += h; byAgent[aid].resolution_count++; }
      }
    }

    // Compute agent averages
    const agentList = Object.values(byAgent).map(a => ({
      agent_id: a.agent_id, name: a.name, assigned: a.assigned,
      avg_response_min: a.response_count ? Math.round(a.total_response_min / a.response_count) : null,
      avg_resolution_hr: a.resolution_count ? parseFloat((a.total_resolution_hr / a.resolution_count).toFixed(1)) : null,
      sla_pct: a.sla_total ? Math.round(((a.sla_total - a.sla_breached) / a.sla_total) * 100) : null,
    })).sort((a, b) => (a.sla_pct ?? 100) - (b.sla_pct ?? 100));

    // Top categories
    const topCategories = Object.entries(byCategoryRaw)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Trend array sorted by date
    const trendArr = Object.entries(trend)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));

    res.json({
      total_tickets: tickets.length,
      by_status: byStatus,
      by_priority: byPriority,
      first_response_avg_min: countWithResponse ? Math.round(totalFirstResponseMin / countWithResponse) : null,
      resolution_avg_hr: countResolved ? parseFloat((totalResolutionHr / countResolved).toFixed(1)) : null,
      sla_pct: slaTotal ? Math.round(((slaTotal - slaBreached) / slaTotal) * 100) : null,
      sla_total, sla_breached,
      by_agent: agentList,
      top_categories: topCategories,
      trend: trendArr,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Analytics/Support]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/analytics/kyc/metrics ────────────────────────────────────
router.get('/kyc/metrics', async (req, res) => {
  try {
    const range = parseRange(req);
    const countryFilter = req.query.country ? req.query.country.split(',') : null;
    const statusFilter  = req.query.status  ? req.query.status.split(',')  : null;
    const analystFilter = req.query.analyst_id || null;

    // Pull from Persona via ClickHouse
    let whereClause = `WHERE created_at >= '${range.fromCH}' AND created_at <= '${range.toCH}'`;
    if (countryFilter && countryFilter.length) {
      const escaped = countryFilter.map(c => `'${c.toUpperCase()}'`).join(',');
      whereClause += ` AND country_code IN (${escaped})`;
    }

    const rows = await ch.query(`
      SELECT
        inquiry_id, user_id, inquiry_status, country_code,
        created_at, completed_at, kyc_outcome,
        has_sanctions_flag, has_pep_flag,
        document_type
      FROM analytics_compliance.stg_dodrio_persona_inquiries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 5000
    `);

    if (!rows || !rows.length) {
      return res.json({ total_cases: 0, by_status: {}, approval_rate_pct: null,
        avg_resolution_hr: null, by_analyst: [], trend: [], generated_at: new Date().toISOString() });
    }

    // Status buckets
    const byStatus = {};
    const byCountry = {};
    const trend = {};
    let totalResHr = 0, countRes = 0;
    let approved = 0, rejected = 0;
    const byDocType = {};

    for (const r of rows) {
      const st = (r.inquiry_status || 'unknown').toLowerCase();
      if (statusFilter && !statusFilter.includes(st)) continue;

      byStatus[st] = (byStatus[st] || 0) + 1;
      byCountry[r.country_code || 'unknown'] = (byCountry[r.country_code || 'unknown'] || 0) + 1;

      const day = (r.created_at || '').slice(0, 10);
      if (day) { if (!trend[day]) trend[day] = { created: 0, approved: 0, rejected: 0 };
        trend[day].created++; }

      if (r.completed_at && r.created_at) {
        const h = diffHr(r.created_at, r.completed_at);
        if (h >= 0 && h < 720) { totalResHr += h; countRes++; }
      }

      const outcome = (r.kyc_outcome || '').toLowerCase();
      if (outcome === 'approved' || st === 'approved') { approved++; if (day) trend[day].approved++; }
      if (outcome === 'declined' || outcome === 'rejected' || st === 'declined' || st === 'failed') {
        rejected++; if (day) trend[day].rejected++;
      }

      const dt = r.document_type || 'unknown';
      byDocType[dt] = (byDocType[dt] || 0) + 1;
    }

    // Age buckets for pending
    const pending = rows.filter(r => ['pending','needs_review','created','waiting'].includes((r.inquiry_status||'').toLowerCase()));
    const now = new Date();
    const pendingByAge = { '0-1d': 0, '1-3d': 0, '3-7d': 0, '7d+': 0 };
    for (const p of pending) {
      const ageDays = (now - new Date(p.created_at)) / 86400000;
      if (ageDays < 1) pendingByAge['0-1d']++;
      else if (ageDays < 3) pendingByAge['1-3d']++;
      else if (ageDays < 7) pendingByAge['3-7d']++;
      else pendingByAge['7d+']++;
    }

    const total = rows.length;
    const resolved = approved + rejected;

    res.json({
      total_cases: total,
      by_status: byStatus,
      by_country: byCountry,
      pending_count: pending.length,
      approved_count: approved,
      rejected_count: rejected,
      pending_by_age: pendingByAge,
      approval_rate_pct: resolved ? Math.round((approved / resolved) * 100) : null,
      avg_resolution_hr: countRes ? parseFloat((totalResHr / countRes).toFixed(1)) : null,
      by_doc_type: byDocType,
      trend: Object.entries(trend).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date,...v})),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Analytics/KYC]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/analytics/tm/metrics ─────────────────────────────────────
router.get('/tm/metrics', async (req, res) => {
  try {
    const range = parseRange(req);
    const statusFilter    = req.query.status ? req.query.status.split(',') : null;
    const alertTypeFilter = req.query.alert_type ? req.query.alert_type.split(',') : null;
    const slaFilter       = req.query.sla_status || null; // on_track|at_risk|overdue|any
    const analystFilter   = req.query.analyst_id || null;

    // Pull AR cases from ClickHouse
    const rows = await ch.query(`
      SELECT
        key, summary, current_status, alert_type, alert_category, alert_rule_code,
        assignee, created_at, is_closed,
        is_account_limited, days_in_status
      FROM analytics_compliance.fact_ar_issues
      WHERE created_at >= '${range.fromCH}'
        AND created_at <= '${range.toCH}'
      ORDER BY created_at DESC
      LIMIT 5000
    `);

    if (!rows || !rows.length) {
      return res.json({ total_cases: 0, by_status: {}, by_rule: [], by_analyst: [],
        sla_pct: null, false_positive_pct: null, avg_investigation_days: null,
        trend: [], generated_at: new Date().toISOString() });
    }

    const byStatus = {};
    const byRule = {};
    const byAnalyst = {};
    const trend = {};
    let totalDays = 0, countDays = 0;
    let slaBreached = 0, slaTotal = 0;
    let falsePosCount = 0, closedCount = 0;

    const SLA_DAYS = 30;
    const now = new Date();

    for (const r of rows) {
      const st = (r.current_status || 'unknown').toLowerCase();
      if (statusFilter && !statusFilter.includes(st)) continue;
      if (alertTypeFilter && alertTypeFilter.length && !alertTypeFilter.includes(r.alert_type)) continue;
      if (analystFilter && r.assignee !== analystFilter) continue;

      // SLA calc
      const ageInDays = (now - new Date(r.created_at)) / 86400000;
      const daysRemaining = SLA_DAYS - ageInDays;
      let slaStatus = 'on_track';
      if (daysRemaining < 0) slaStatus = 'overdue';
      else if (daysRemaining < 10) slaStatus = 'at_risk';
      if (slaFilter && slaFilter !== 'any' && slaStatus !== slaFilter) continue;

      byStatus[st] = (byStatus[st] || 0) + 1;

      // Rule
      const rule = r.alert_rule_code || r.alert_type || 'unknown';
      if (!byRule[rule]) byRule[rule] = { rule, total: 0, closed: 0, false_pos: 0, sar: 0 };
      byRule[rule].total++;
      if (r.is_closed) {
        byRule[rule].closed++;
        closedCount++;
        // False positive: closed status indicating no suspicious activity
        const noSusp = ['no suspicious activity','cleared','false positive','no action required'];
        if (noSusp.some(s => st.includes(s))) {
          byRule[rule].false_pos++;
          falsePosCount++;
        }
      }

      // Analyst
      const analyst = r.assignee || 'unassigned';
      if (!byAnalyst[analyst]) byAnalyst[analyst] = {
        analyst, assigned: 0, resolved: 0, total_days: 0, count_days: 0,
        sla_total: 0, sla_breached: 0, false_pos: 0
      };
      byAnalyst[analyst].assigned++;
      if (r.is_closed) byAnalyst[analyst].resolved++;
      if (r.days_in_status) {
        byAnalyst[analyst].total_days += parseFloat(r.days_in_status) || 0;
        byAnalyst[analyst].count_days++;
      }
      byAnalyst[analyst].sla_total++;
      if (slaStatus === 'overdue') byAnalyst[analyst].sla_breached++;

      // Trend
      const day = (r.created_at || '').slice(0, 10);
      if (day) {
        if (!trend[day]) trend[day] = { created: 0, closed: 0, escalated: 0 };
        trend[day].created++;
        if (r.is_closed) trend[day].closed++;
        if (st.includes('escalat')) trend[day].escalated++;
      }

      // Overall SLA
      slaTotal++;
      if (slaStatus === 'overdue') slaBreached++;

      // Avg investigation days
      if (r.days_in_status) { totalDays += parseFloat(r.days_in_status) || 0; countDays++; }
    }

    // Compute rule false positive pcts
    const ruleList = Object.values(byRule).map(r => ({
      rule: r.rule, total: r.total, closed: r.closed,
      false_pos: r.false_pos,
      false_pos_pct: r.closed ? Math.round((r.false_pos / r.closed) * 100) : null,
    })).sort((a, b) => (b.false_pos_pct ?? 0) - (a.false_pos_pct ?? 0));

    // Compute analyst averages
    const analystList = Object.values(byAnalyst).map(a => ({
      analyst: a.analyst, assigned: a.assigned, resolved: a.resolved,
      avg_days: a.count_days ? parseFloat((a.total_days / a.count_days).toFixed(1)) : null,
      sla_pct: a.sla_total ? Math.round(((a.sla_total - a.sla_breached) / a.sla_total) * 100) : null,
      false_pos: a.false_pos,
    })).sort((a, b) => (a.sla_pct ?? 100) - (b.sla_pct ?? 100));

    res.json({
      total_cases: rows.length,
      by_status: byStatus,
      by_rule: ruleList,
      by_analyst: analystList,
      sla_pct: slaTotal ? Math.round(((slaTotal - slaBreached) / slaTotal) * 100) : null,
      sla_total, sla_breached,
      false_positive_pct: closedCount ? Math.round((falsePosCount / closedCount) * 100) : null,
      avg_investigation_days: countDays ? parseFloat((totalDays / countDays).toFixed(1)) : null,
      trend: Object.entries(trend).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date,...v})),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Analytics/TM]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/analytics/:section/export/csv ───────────────────────────
router.get('/:section/export/csv', async (req, res) => {
  const { section } = req.params;
  const range = parseRange(req);
  let rows = [], headers = [], filename = '';

  try {
    if (section === 'support') {
      const tickets = await fetchFdTickets({ from: range.from, to: range.to, complianceOnly: req.query.compliance_only === 'true' });
      const statusMap = { 2:'open',3:'pending',4:'resolved',5:'closed',6:'on_hold' };
      headers = ['ticket_id','created_at','status','priority','group_id','tags','first_responded_at','resolved_at'];
      rows = tickets.map(t => [t.id, t.created_at, statusMap[t.status]||t.status, t.priority, t.group_id,
        (t.tags||[]).join('|'), t.stats?.first_responded_at||'', t.stats?.resolved_at||'']);
      filename = `vigia_support_export_${range.from.toISOString().slice(0,10)}.csv`;
    } else if (section === 'kyc') {
      const data = await ch.query(`
        SELECT inquiry_id, user_id, inquiry_status, country_code, created_at, completed_at, kyc_outcome, document_type
        FROM analytics_compliance.stg_dodrio_persona_inquiries
        WHERE created_at >= '${range.fromCH}' AND created_at <= '${range.toCH}'
        ORDER BY created_at DESC LIMIT 5000
      `);
      headers = ['inquiry_id','inquiry_status','country_code','created_at','completed_at','kyc_outcome','document_type'];
      rows = (data||[]).map(r => [r.inquiry_id,r.inquiry_status,r.country_code,r.created_at,r.completed_at,r.kyc_outcome,r.document_type]);
      filename = `vigia_kyc_export_${range.from.toISOString().slice(0,10)}.csv`;
    } else if (section === 'tm') {
      const data = await ch.query(`
        SELECT key, current_status, alert_type, alert_rule_code, assignee, created_at, is_closed, days_in_status
        FROM analytics_compliance.fact_ar_issues
        WHERE created_at >= '${range.fromCH}' AND created_at <= '${range.toCH}'
        ORDER BY created_at DESC LIMIT 5000
      `);
      headers = ['key','status','alert_type','alert_rule','assignee','created_at','is_closed','days_in_status'];
      rows = (data||[]).map(r => [r.key,r.current_status,r.alert_type,r.alert_rule_code,r.assignee,r.created_at,r.is_closed?'1':'0',r.days_in_status]);
      filename = `vigia_tm_export_${range.from.toISOString().slice(0,10)}.csv`;
    } else {
      return res.status(400).json({ error: 'Unknown section' });
    }
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[Analytics/Export]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
