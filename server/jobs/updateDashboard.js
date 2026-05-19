// ============================================================
// VIGÍA BSA DECISION ENGINE — BUILD HEADER
// ============================================================
// Tool Name:        Compliance Dashboard Cron Job
// Build Date:       2026-05-19
// Authorized by:    Zaid Khan (U087TL6CGNM)
// POLICY COMPLIANCE: POL-BSA-001-v4.2
// EWRA RISK MITIGATION: Risk ID(s): EWRA-01, EWRA-20 | Residual: LOW
// HISTORICAL AUDIT GAP: Crowe Finding ##6, ##7 (2025)
// ============================================================

const axios = require('axios');
const jiraLib = require('../lib/jira');

// ─── In-memory cache (lightweight, no Redis dep) ───────────────
let dashboardCache = { data: [], updatedAt: null };
function getCache() { return dashboardCache; }
function setCache(data) {
  dashboardCache = { data, updatedAt: new Date().toISOString() };
}

// ─── Date helpers ──────────────────────────────────────────────
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function businessDaysFromNow(dateStr, bizDays) {
  const d = new Date(dateStr);
  let added = 0;
  while (added < bizDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString();
}

function calcDaysLeft(dueStr) {
  const now = new Date();
  const due = new Date(dueStr);
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function urgencyLevel(daysLeft, type, kountScore) {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'today';
  if (type === 'TM' && daysLeft < 7) return 'red';
  if (kountScore >= 0.9) return 'red';
  if (daysLeft <= 3 || kountScore >= 0.5) return 'yellow';
  return 'green';
}

// ─── Freshdesk ─────────────────────────────────────────────────
async function fetchFreshdesk() {
  const FD_BASE = process.env.FRESHDESK_BASE_URL || 'https://airtm.freshdesk.com/api/v2';
  const FD_KEY = process.env.FRESHDESK_KEY || '';
  if (!FD_KEY) return [];

  const auth = { username: FD_KEY, password: 'X' };
  try {
    // Fetch open + pending tickets
    const [open, pending] = await Promise.all([
      axios.get(`${FD_BASE}/tickets`, {
        auth,
        params: { filter: 'open', per_page: 100 },
        headers: { Accept: 'application/json' },
        timeout: 15000
      }).catch(() => ({ data: [] })),
      axios.get(`${FD_BASE}/tickets`, {
        auth,
        params: { filter: 'pending', per_page: 100 },
        headers: { Accept: 'application/json' },
        timeout: 15000
      }).catch(() => ({ data: [] }))
    ]);

    const tickets = [...(open.data || []), ...(pending.data || [])];
    return tickets.map(t => {
      const due = t.due_by || addDays(t.created_at, 1);
      const daysLeft = calcDaysLeft(due);
      return {
        id: `FD-${t.id}`,
        title: t.subject || 'Support ticket',
        type: 'Support',
        assigned: t.responder_id ? (t.responder?.name || 'Assigned') : 'Unassigned',
        created: t.created_at,
        due,
        daysLeft,
        urgency: urgencyLevel(daysLeft, 'Support', 0),
        priority: t.priority === 4 ? 'urgent' : t.priority === 3 ? 'high' : t.priority === 2 ? 'medium' : 'low',
        status: t.status === 2 ? 'Open' : t.status === 3 ? 'Pending' : 'Open',
        source: 'freshdesk',
        link: `https://airtm.freshdesk.com/a/tickets/${t.id}`,
        kountScore: 0
      };
    });
  } catch (err) {
    console.error('[Dashboard] Freshdesk fetch error:', err.message);
    return [];
  }
}

// ─── Jira (KYC, Fraud/AR projects) ────────────────────────────
async function fetchJira() {
  try {
    const [kycIssues, arIssues, comIssues] = await Promise.all([
      jiraLib.searchIssues(`project = KS AND status != Done AND status != Closed ORDER BY created ASC`, 100),
      jiraLib.searchIssues(`project = AR AND status != Done AND status != Closed ORDER BY created ASC`, 100),
      jiraLib.searchIssues(`project = COM AND status != Done AND status != Closed ORDER BY created ASC`, 50)
    ]);

    const mapIssue = (issue, type) => {
      const f = issue.fields || {};
      const created = f.created;
      const assignee = f.assignee?.displayName || f.assignee?.emailAddress || 'Unassigned';
      const summary = f.summary || 'No summary';
      const status = f.status?.name || 'Open';
      const priority = f.priority?.name?.toLowerCase() || 'medium';

      let due;
      if (type === 'KYC') {
        due = businessDaysFromNow(created, f.labels?.includes('enhanced') ? 7 : 5);
      } else if (type === 'TM') {
        due = addDays(created, 30); // SAR 30-day deadline
      } else {
        due = businessDaysFromNow(created, 3);
      }

      const daysLeft = calcDaysLeft(due);
      return {
        id: issue.key,
        title: summary,
        type,
        assigned: assignee.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        created,
        due,
        daysLeft,
        urgency: urgencyLevel(daysLeft, type, 0),
        priority,
        status,
        source: 'jira',
        link: `https://airtech.atlassian.net/browse/${issue.key}`,
        kountScore: 0
      };
    };

    return [
      ...kycIssues.map(i => mapIssue(i, 'KYC')),
      ...arIssues.map(i => mapIssue(i, 'TM')),
      ...comIssues.map(i => mapIssue(i, 'Escalation'))
    ];
  } catch (err) {
    console.error('[Dashboard] Jira fetch error:', err.message);
    return [];
  }
}

// ─── Elliptic alerts ───────────────────────────────────────────
async function fetchEllipticAlerts() {
  // Only surface active alerts if there are recent high-risk flags
  // Elliptic doesn't have a native "alerts list" endpoint, so we check for
  // any OFAC/SDN items queued in ClickHouse
  try {
    const ch = require('../lib/clickhouse');
    const rows = await ch.query(`
      SELECT key, summary, created_at, current_status
      FROM analytics_compliance.fact_ar_issues
      WHERE alert_category = 'Sanctions'
        AND is_closed = 0
      ORDER BY created_at DESC
      LIMIT 20
      FORMAT JSONEachRow
    `).catch(() => []);

    return rows.map(r => {
      const created = r.created_at;
      const daysLeft = calcDaysLeft(addDays(created, 1)); // sanctions = 24h SLA
      return {
        id: r.key || `SANC-${r.summary?.slice(0,8)}`,
        title: `⚠️ Sanctions alert — ${r.summary?.slice(0,60) || r.key}`,
        type: 'Escalation',
        assigned: 'Zaid',
        created,
        due: addDays(created, 1),
        daysLeft,
        urgency: 'red',
        priority: 'urgent',
        status: r.current_status || 'Escalate',
        source: 'elliptic',
        link: `https://airtech.atlassian.net/browse/${r.key}`,
        kountScore: 1
      };
    });
  } catch (err) {
    console.error('[Dashboard] Elliptic/sanctions fetch error:', err.message);
    return [];
  }
}

// ─── Main update function ──────────────────────────────────────
async function updateDashboard() {
  console.log('[Dashboard] Update job starting...');
  const started = Date.now();

  try {
    const [support, jira, sanctions] = await Promise.all([
      fetchFreshdesk(),
      fetchJira(),
      fetchEllipticAlerts()
    ]);

    const all = [...sanctions, ...support, ...jira];

    // Sort: overdue → today → by days left → priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    all.sort((a, b) => {
      if (a.urgency === 'overdue' && b.urgency !== 'overdue') return -1;
      if (a.urgency !== 'overdue' && b.urgency === 'overdue') return 1;
      if (a.urgency === 'today' && b.urgency !== 'today') return -1;
      if (a.urgency !== 'today' && b.urgency === 'today') return 1;
      if (a.urgency === 'red' && b.urgency !== 'red') return -1;
      if (a.urgency !== 'red' && b.urgency === 'red') return 1;
      const daysDiff = (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
      if (daysDiff !== 0) return daysDiff;
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    });

    setCache(all);
    const elapsed = Date.now() - started;
    console.log(`[Dashboard] Updated: ${all.length} cases (${support.length} support, ${jira.length} jira, ${sanctions.length} sanctions) in ${elapsed}ms`);
  } catch (err) {
    console.error('[Dashboard] Update job failed:', err.message);
  }
}

// ─── Scheduler (node-schedule optional, fallback to setInterval) ──
function startScheduler() {
  updateDashboard(); // run immediately on startup

  // Try node-schedule first (0,30 * * * *)
  try {
    const schedule = require('node-schedule');
    schedule.scheduleJob('0,30 * * * *', updateDashboard);
    console.log('[Dashboard] Scheduler started (node-schedule, every 30 min)');
  } catch {
    // Fallback to setInterval (30 min)
    setInterval(updateDashboard, 30 * 60 * 1000);
    console.log('[Dashboard] Scheduler started (setInterval, every 30 min)');
  }
}

module.exports = { startScheduler, updateDashboard, getCache };
