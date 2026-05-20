const express = require('express');
const router = express.Router();
const ch = require('../lib/clickhouse');
const { logAction } = require('../lib/audit');
const axios = require('axios');

// ── Freshdesk helpers ────────────────────────────────────────────
const FD_BASE = process.env.FRESHDESK_BASE_URL || 'https://airtm.freshdesk.com/api/v2';
const FD_KEY  = process.env.FRESHDESK_KEY || '';

function fdAuth() {
  return { username: FD_KEY, password: 'X' };
}

async function fdGet(path, params = {}) {
  try {
    const res = await axios.get(`${FD_BASE}${path}`, {
      auth: fdAuth(),
      params,
      headers: { Accept: 'application/json' },
      timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error(`[Freshdesk] GET ${path}:`, err.response?.data || err.message);
    return null;
  }
}

async function fdPost(path, body) {
  try {
    const res = await axios.post(`${FD_BASE}${path}`, body, {
      auth: fdAuth(),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error(`[Freshdesk] POST ${path}:`, err.response?.data || err.message);
    return null;
  }
}

async function fdPatch(path, body) {
  try {
    const res = await axios.patch(`${FD_BASE}${path}`, body, {
      auth: fdAuth(),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error(`[Freshdesk] PATCH ${path}:`, err.response?.data || err.message);
    return null;
  }
}

// ── CH helpers ───────────────────────────────────────────────────
async function getUserByEmail(email) {
  if (!email) return null;
  const escaped = email.replace(/'/g, "\\'");
  const rows = await ch.query(`
    SELECT o.id, o.status, o.email, o.first_name, o.last_name, o.country, o.registered_at,
           d.tier_level, d.document_verified, d.facial_verified, d.watchlist_verified,
           r.risk_level, r.score
    FROM data_lake.oauth2_onix_users o
    LEFT JOIN data_lake.security_hub_dodrio_users d ON d.id = o.id AND d._peerdb_is_deleted = 0
    LEFT JOIN (
      SELECT user_id, risk_level, score, created_at,
             row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
      FROM data_lake.security_hub_dodrio_risk_level
      WHERE _peerdb_is_deleted = 0
    ) r ON r.user_id = o.id AND r.rn = 1
    WHERE o.email = '${escaped}' AND o._peerdb_is_deleted = 0
    LIMIT 1
  `);
  return rows[0] || null;
}

// ── Risk scoring ─────────────────────────────────────────────────
function computeRiskScore(user, ticket, priorTickets) {
  let score = 0;
  const factors = [];

  // Account age
  const age = user?.registered_at
    ? Math.floor((Date.now() - new Date(user.registered_at)) / 86400000)
    : null;
  if (age !== null) {
    if (age < 7) {
      score += 25;
      factors.push({ name: 'New account (<7 days)', contribution: 25, flag: 'red', detail: 'High fraud indicator' });
    } else if (age < 30) {
      score += 10;
      factors.push({ name: 'Account <30 days old', contribution: 10, flag: 'yellow', detail: `${age} days old` });
    } else if (age >= 365) {
      score -= 10;
      factors.push({ name: 'Established account (1+ year)', contribution: -10, flag: 'green', detail: `${Math.floor(age / 365)} year(s) old` });
    }
  }

  // KYC document verification
  const docVerified = user?.document_verified;
  if (docVerified === 0 || docVerified === false || docVerified === '0') {
    score += 20;
    factors.push({ name: 'Identity not fully verified', contribution: 20, flag: 'red', detail: 'KYC document check incomplete' });
  } else if (docVerified === 1 || docVerified === true || docVerified === '1') {
    score -= 5;
    factors.push({ name: 'Identity verified', contribution: -5, flag: 'green', detail: 'KYC document check passed' });
  }

  // Internal risk level
  const riskLevel = (user?.risk_level || '').toLowerCase();
  if (riskLevel === 'high') {
    score += 30;
    factors.push({ name: 'High internal risk classification', contribution: 30, flag: 'red', detail: 'Risk score from platform' });
  } else if (riskLevel === 'medium') {
    score += 15;
    factors.push({ name: 'Medium internal risk classification', contribution: 15, flag: 'yellow', detail: 'Risk score from platform' });
  } else if (riskLevel === 'low') {
    score -= 5;
    factors.push({ name: 'Low internal risk', contribution: -5, flag: 'green', detail: 'Risk score from platform' });
  }

  // Watchlist verification
  const watchVerified = user?.watchlist_verified;
  if (watchVerified === 0 || watchVerified === false || watchVerified === '0') {
    score += 15;
    factors.push({ name: 'Not cleared on watchlists', contribution: 15, flag: 'red', detail: 'Persona watchlist check pending' });
  } else if (watchVerified === 1 || watchVerified === true || watchVerified === '1') {
    score -= 5;
    factors.push({ name: 'Watchlist clear', contribution: -5, flag: 'green', detail: 'Persona watchlist passed' });
  }

  // Prior contact frequency
  const priorCount = (priorTickets || []).length;
  if (priorCount > 5) {
    score += 10;
    factors.push({ name: 'High support contact frequency', contribution: 10, flag: 'yellow', detail: `${priorCount} tickets in 30 days` });
  }

  // Ticket priority
  if (ticket?.priority === 4) {
    score += 10;
    factors.push({ name: 'Ticket flagged Urgent', contribution: 10, flag: 'red', detail: 'Freshdesk Urgent priority' });
  }

  // TODO: Add Kount score when API key is available (Merchant 171489)

  score = Math.max(0, Math.min(100, score));

  let level, verdict, nextSteps;
  if (score >= 70) {
    level = 'CRITICAL';
    verdict = 'ESCALATE';
    nextSteps = [
      'Click ESCALATE to move to Fraud Investigation team',
      'Do not approve any transactions without fraud review',
      'Compliance team will reach out to customer directly'
    ];
  } else if (score >= 50) {
    level = 'HIGH';
    verdict = 'ESCALATE';
    nextSteps = [
      'Click ESCALATE to move to Fraud Investigation team',
      'Do not approve any transactions without fraud review',
      'Review account history before taking any action'
    ];
  } else if (score >= 30) {
    level = 'MEDIUM';
    verdict = 'VERIFY';
    nextSteps = [
      'Review account details carefully before responding',
      'If uncertain about any transaction, verify customer intent',
      'Use suggested response below, customize based on your review'
    ];
  } else {
    level = 'LOW';
    verdict = 'APPROVE';
    nextSteps = [
      'Routine inquiry — suggested response should be sufficient',
      'Send & Close after reviewing the response',
      'Monitor for follow-up contact'
    ];
  }

  const confidence = score > 60 ? 'HIGH' : score > 35 ? 'MEDIUM' : 'LOW';

  return { score, level, verdict, confidence, factors, nextSteps };
}

// ── Ticket summary ───────────────────────────────────────────────
function buildTicketSummary(ticket, user, conv) {
  const firstMsg = (conv[0]?.body_text || ticket.description_text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .trim()
    .slice(0, 250);

  const age = user?.registered_at
    ? Math.floor((Date.now() - new Date(user.registered_at)) / 86400000)
    : null;
  const kyc = (user?.document_verified === 1 || user?.document_verified === true || user?.document_verified === '1')
    ? 'verified identity'
    : 'unverified identity';
  const accountCtx = age != null ? ` Account is ${age} days old with ${kyc}.` : '';

  return firstMsg
    ? `${firstMsg}${accountCtx}`
    : `Ticket #${ticket.id}: ${ticket.subject}.${accountCtx}`;
}

// ── Build VIGÍA command for a ticket ────────────────────────────
function buildTicketCommand(ticket, user, convHistory, priorTickets) {
  const age = user?.registered_at
    ? Math.floor((Date.now() - new Date(user.registered_at)) / 86400000)
    : null;
  const tier = user?.tier_level != null ? `Tier ${user.tier_level}` : 'Unknown';
  const lastMsg = convHistory?.slice(-1)[0]?.body_text?.slice(0, 300) || ticket.description_text?.slice(0, 300) || '';
  const priorCount = priorTickets?.length || 0;

  return `Support agent needs to respond to a Freshdesk support ticket.

TICKET: #${ticket.id} — "${ticket.subject}"
Priority: ${['Low','Medium','High','Urgent'][ticket.priority - 1] || ticket.priority}
Status: ${['Open','Pending','Resolved','Closed','','Waiting on Customer'][ticket.status - 2] || ticket.status}
Customer: ${user?.first_name || ''} ${user?.last_name || ''} (${ticket.requester?.email || 'unknown'})

ACCOUNT CONTEXT:
- Status: ${user?.status || 'Unknown'} | KYC tier: ${tier}
- Account age: ${age != null ? age + ' days' : 'Unknown'}
- Risk level: ${user?.risk_level || 'Unknown'}
- ID Verified: ${user?.document_verified ? 'Yes' : 'No'} | Facial: ${user?.facial_verified ? 'Yes' : 'No'} | Watchlist: ${user?.watchlist_verified ? 'Yes' : 'No'}
- Prior tickets (30d): ${priorCount}

CUSTOMER MESSAGE:
"${lastMsg}"

Step 1 — Check if this is a special request (cashier application, business/merchant account, P2P agent, high-value transaction, account recovery after ban). If YES, recommend escalation and do NOT write a response template.

Step 2 — If routine, generate a professional, specific, empathetic support response (under 120 words):
1. Acknowledge their SPECIFIC issue (not generic)
2. Explain clearly what's happening or what they need to do
3. Give concrete next steps with timeline
4. Warm, helpful Airtm tone — sound human, not like a template
5. Reference the account context above (age, KYC status, risk) if relevant
Also: is escalation to compliance needed? (YES/NO and one-line reason)`;
}

// ── Role enforcement for ticket-specific routes ────────────────
const SUPPORT_ROLES = ['SUPPORT_ANALYST', 'LEADERSHIP'];
function requireSupport(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!SUPPORT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Support portal access required' });
  }
  next();
}

// ── GET /api/support/tickets — open Freshdesk queue ─────────────
router.get('/tickets', requireSupport, async (req, res) => {
  const tickets = await fdGet('/tickets', {
    order_by: 'created_at',
    order_type: 'desc',
    per_page: 50,
    include: 'requester,stats'
  });

  if (!tickets) return res.json({ tickets: [], error: 'Freshdesk unavailable' });

  const enriched = tickets
    .filter(t => t.status === 2 || t.status === 3) // Open or Pending only
    .map(t => {
      const hoursOpen = Math.floor((Date.now() - new Date(t.created_at)) / 3600000);
      const isUrgent = hoursOpen >= 3;
      const urgencyScore = (t.priority || 1) * 10 + (isUrgent ? 20 : 0);
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        email: t.requester?.email,
        name: t.requester?.name,
        created_at: t.created_at,
        updated_at: t.updated_at,
        first_responded_at: t.stats?.first_responded_at,
        resolved_at: t.stats?.resolved_at,
        group_id: t.group_id,
        tags: t.tags || [],
        hoursOpen,
        isUrgent,
        urgencyScore
      };
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore);

  res.json({ tickets: enriched });
});

// ── GET /api/support/ticket/:id — full detail + analysis ────────
router.get('/ticket/:id', requireSupport, async (req, res) => {
  const { id } = req.params;

  const [ticket, convRaw] = await Promise.all([
    fdGet(`/tickets/${id}?include=requester,company,stats`),
    fdGet(`/tickets/${id}/conversations`)
  ]);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const email = ticket.requester?.email;
  const [user, priorTickets] = await Promise.all([
    getUserByEmail(email),
    email ? fdGet('/tickets/filter', { query: `"email:'${email}'"`, per_page: 10 })
      .then(d => (d?.results || []).filter(t => t.id !== parseInt(id)))
      .catch(() => [])
    : Promise.resolve([])
  ]);

  const conv = (convRaw || []).map(c => ({
    id: c.id,
    author_type: c.incoming ? 'customer' : 'agent',
    body_text: c.body_text,
    created_at: c.created_at
  }));

  const command = buildTicketCommand(ticket, user, conv, priorTickets);
  const risk = computeRiskScore(user, ticket, priorTickets);
  const summary = buildTicketSummary(ticket, user, conv);

  if (req.user) {
    logAction({
      userEmail: req.user.email,
      action: 'SUPPORT_TICKET_VIEW',
      resourceId: `FD-${id}`,
      details: { customerEmail: email, subject: ticket.subject, riskLevel: risk.level }
    });
  }

  res.json({
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      description_text: ticket.description_text,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      tags: ticket.tags || [],
      requester: ticket.requester
    },
    conversation: conv,
    user,
    priorTickets: (priorTickets || []).slice(0, 5).map(t => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      created_at: t.created_at
    })),
    risk,
    summary,
    command
  });
});

// ── POST /api/support/ticket/:id/reply — send reply + close ────
router.post('/ticket/:id/reply', requireSupport, async (req, res) => {
  const { id } = req.params;
  const { body, close = true, usedVigiaFlag = false } = req.body;

  if (!body) return res.status(400).json({ error: 'Reply body required' });

  // Send the reply
  const reply = await fdPost(`/tickets/${id}/reply`, { body });
  if (!reply) return res.status(500).json({ error: 'Failed to send reply via Freshdesk' });

  // Close ticket if requested
  if (close) await fdPatch(`/tickets/${id}`, { status: 4 }); // 4 = Resolved

  // Log to audit
  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'SUPPORT_REPLY_SENT',
    resourceId: `FD-${id}`,
    decision: close ? 'RESOLVED' : 'REPLIED',
    details: { usedVigiaFlag, bodyLength: body.length }
  });

  res.json({ success: true, ticketId: id, closed: close });
});

// ── POST /api/support/ticket/:id/escalate — escalate to compliance
router.post('/ticket/:id/escalate', requireSupport, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // Add a note to the ticket
  await fdPost(`/tickets/${id}/notes`, {
    body: `<b>Escalated to Compliance</b><br>Reason: ${reason || 'Flagged by VIGÍA'}<br>Agent: ${req.user?.email}`,
    notify_emails: ['zaid@airtm.io']
  });

  // Update priority to Urgent
  await fdPatch(`/tickets/${id}`, { priority: 4, tags: ['compliance-escalated'] });

  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'SUPPORT_ESCALATED',
    resourceId: `FD-${id}`,
    decision: 'ESCALATED',
    details: { reason }
  });

  res.json({ success: true });
});

// ── GET /api/support/metrics — real-time queue stats ───────────────
router.get('/metrics', requireSupport, async (req, res) => {
  try {
    const [openTickets, recentResolved] = await Promise.all([
      // All open/pending tickets
      fdGet('/tickets', { order_by: 'created_at', order_type: 'desc', per_page: 100, include: 'stats' }),
      // Recently resolved (last 50) for avg close time
      fdGet('/tickets', { order_by: 'updated_at', order_type: 'desc', per_page: 50, filter: 'resolved', include: 'stats' })
    ]);

    const open = (openTickets || []).filter(t => t.status === 2 || t.status === 3);
    const overdue = open.filter(t => {
      const hrs = Math.floor((Date.now() - new Date(t.created_at)) / 3600000);
      return hrs >= 3;
    });

    // Avg resolution time from recently resolved tickets
    let avgCloseHours = null;
    const resolved = (recentResolved || []).filter(t => t.stats?.resolved_at && t.created_at);
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((s, t) => {
        return s + (new Date(t.stats.resolved_at) - new Date(t.created_at));
      }, 0);
      avgCloseHours = Math.round((totalMs / resolved.length) / 3600000 * 10) / 10;
    }

    res.json({
      open: open.length,
      overdue: overdue.length,
      queue: open.length,
      avgCloseHours,
      refreshedAt: new Date().toISOString()
    });
  } catch (err) {
    res.json({ open: 0, overdue: 0, queue: 0, avgCloseHours: null, error: err.message });
  }
});

// ── POST /api/support/search — user search ───────────────────────
router.post('/search', async (req, res) => {
  const { query: searchQuery, commandType = 'account' } = req.body;
  if (!searchQuery) return res.status(400).json({ error: 'query required' });

  const isEmail = searchQuery.includes('@');
  const escaped = searchQuery.replace(/'/g, "\\'");
  const field = isEmail ? 'email' : 'id';

  const [users, dodrio] = await Promise.all([
    ch.query(`SELECT id, status, email, first_name, last_name, country, registered_at, created_at FROM data_lake.oauth2_onix_users WHERE ${field} = '${escaped}' AND _peerdb_is_deleted = 0 LIMIT 1`),
    ch.query(`SELECT id, tier_level, status, email, document_verified, facial_verified, watchlist_verified FROM data_lake.security_hub_dodrio_users WHERE email = '${escaped}' AND _peerdb_is_deleted = 0 LIMIT 1`)
  ]);

  const onixUser = users[0] || null;
  const dodrioUser = dodrio[0] || null;
  const userId = onixUser?.id || (searchQuery.match(/^[0-9a-f]{8}-/) ? searchQuery : null);

  const [riskRows, txns] = await Promise.all([
    userId ? ch.query(`SELECT risk_level, score FROM data_lake.security_hub_dodrio_risk_level WHERE user_id = toUUID('${userId}') AND _peerdb_is_deleted = 0 ORDER BY created_at DESC LIMIT 1`) : Promise.resolve([]),
    userId ? ch.query(`SELECT id, status, amount, operation_type, created_at FROM data_lake.payments_kecleon_operations WHERE airtm_user_id = toUUID('${userId}') AND _peerdb_is_deleted = 0 AND created_at >= now() - INTERVAL 30 DAY ORDER BY created_at DESC LIMIT 20`) : Promise.resolve([])
  ]);

  const user = onixUser ? {
    id: onixUser.id, email: onixUser.email,
    first_name: onixUser.first_name, last_name: onixUser.last_name,
    country: onixUser.country, registered_at: onixUser.registered_at || onixUser.created_at,
    status: dodrioUser?.status || onixUser.status,
    tier_level: dodrioUser?.tier_level,
    document_verified: dodrioUser?.document_verified,
    facial_verified: dodrioUser?.facial_verified,
    watchlist_verified: dodrioUser?.watchlist_verified
  } : { email: searchQuery, id: userId, note: 'User not found in database' };

  const risk = riskRows[0] || null;

  // Build a simple search command
  const age = user.registered_at ? Math.floor((Date.now() - new Date(user.registered_at)) / 86400000) : null;
  const command = `Support agent asking about customer: ${user.email || user.id}\nAccount age: ${age != null ? age + ' days' : 'Unknown'} | Status: ${user.status || 'Unknown'} | KYC tier: ${user.tier_level != null ? 'Tier ' + user.tier_level : 'Unknown'} | Risk: ${risk?.risk_level || 'Unknown'}\n\nProvide a brief account summary and recommended support action.`;

  if (req.user) {
    logAction({ userEmail: req.user.email, action: 'SUPPORT_USER_SEARCH', resourceId: searchQuery, details: { found: !!onixUser } });
  }

  res.json({ user, risk, transactions: txns, tickets: [], command, commandType });
});

module.exports = router;
