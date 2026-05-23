import React, { useState, useEffect, useCallback } from 'react';
import VigiaResponse from '../components/VigiaResponse.jsx';
import EddButton from '../components/EddButton.jsx';
import { useAuth } from '../App.jsx';

const PRIORITY_LABEL = ['', 'Low', 'Medium', 'High', 'Urgent'];
const STATUS_LABEL = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed', 6: 'Waiting' };

const RISK_COLORS = {
  CRITICAL: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  HIGH: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
  MEDIUM: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700' },
  LOW: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700' },
};

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function secAgo(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function getToken() { return localStorage.getItem('vigia_token'); }
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// ── Ticket Detail Panel ─────────────────────────────────────────
function TicketDetail({ ticketId, onClose }) {
  const { user: authUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [escalateFlagged, setEscalateFlagged] = useState(false); // local flag only
  const [escalateConfirming, setEscalateConfirming] = useState(false); // show confirm dialog
  const [escalating, setEscalating] = useState(false); // actual API call in progress
  const [escalated, setEscalated] = useState(false); // API call done
  const [vigiaUsed, setVigiaUsed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setReplyText('');
    setReplySent(false);
    setEscalateFlagged(false);
    setEscalateConfirming(false);
    setEscalated(false);
    setVigiaUsed(false);
    fetch(`/api/support/ticket/${ticketId}`, { headers: authHdr() })
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  const handleVigiaComplete = (text) => {
    const lines = text.split('\n');
    const idx = lines.findIndex(l => /^hi |^dear |response:/i.test(l));
    setReplyText(idx >= 0 ? lines.slice(idx).join('\n').trim() : text.trim());
    setVigiaUsed(true);
  };

  const sendReply = async (close = true) => {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      await fetch(`/api/support/ticket/${ticketId}/reply`, {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ body: replyText, close, usedVigiaFlag: vigiaUsed })
      });
      setReplySent(true);
    } catch {}
    setReplySending(false);
  };

  // Step 1: flag locally (no API call yet)
  const flagForEscalation = () => {
    setEscalateFlagged(true);
    setEscalateConfirming(true);
  };

  // Step 2: confirmed — actually call Freshdesk
  const confirmEscalate = async () => {
    setEscalateConfirming(false);
    setEscalating(true);
    try {
      await fetch(`/api/support/ticket/${ticketId}/escalate`, {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ reason: 'Flagged by support agent via VIGÍA portal' })
      });
      setEscalated(true);
    } catch {}
    setEscalating(false);
  };

  const cancelEscalate = () => {
    setEscalateFlagged(false);
    setEscalateConfirming(false);
  };

  if (loading) return (
    <div className="p-6 space-y-3">
      <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
      <div className="h-24 bg-gray-100 rounded animate-pulse" />
      <div className="h-32 bg-gray-100 rounded animate-pulse" />
    </div>
  );

  if (!data) return <div className="p-6 text-sm text-gray-400">Failed to load ticket.</div>;

  const { ticket, conversation: conv = [], user, priorTickets: prior = [], risk, summary, command } = data;
  const rc = RISK_COLORS[risk?.level] || RISK_COLORS.LOW;

  return (
    <div className="p-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</button>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-500">#{ticket.id}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: '#FEF3C7', color: '#92400E' }}>
              {PRIORITY_LABEL[ticket.priority]}
            </span>
            <span className="text-xs text-gray-400">{STATUS_LABEL[ticket.status]}</span>
          </div>
          <h3 className="font-bold text-gray-900 mt-0.5 text-sm leading-snug">{ticket.subject}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {ticket.requester?.name || ticket.requester?.email} · {timeAgo(ticket.created_at)}
          </p>
        </div>
        <EddButton
          subject={{
            firstName: (ticket.requester?.name||'').split(' ')[0]||'',
            lastName: (ticket.requester?.name||'').split(' ').slice(1).join(' ')||'',
            country: ''
          }}
          caseId={`FD-${ticket.id}`}
          analystId={authUser?.email}
          analystName={authUser?.name}
        />
      </div>

      {/* 1. What's the issue */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-4">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">What is the customer asking?</p>
        <p className="text-sm text-gray-900 leading-relaxed font-medium">
          {summary || ticket.description_text?.replace(/<[^>]+>/g, '').trim().slice(0, 300) || ticket.subject || 'No description provided.'}
        </p>
      </div>

      {/* 2. Prior History */}
      {prior.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
            Prior Contact ({prior.length} tickets)
          </p>
          <div className="space-y-1.5">
            {prior.slice(0, 4).map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate">#{p.id} — {p.subject?.slice(0, 55)}</span>
                <span className="text-gray-400 flex-shrink-0 ml-2">{timeAgo(p.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Account Context */}
      {user && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Account Context</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ['Account age', user.registered_at ? `${Math.floor((Date.now() - new Date(user.registered_at)) / 86400000)} days` : '—'],
              ['Status', user.status || '—'],
              ['KYC tier', user.tier_level != null ? `Tier ${user.tier_level}` : '—'],
              ['Risk level', user.risk_level || '—'],
              ['ID verified', user.document_verified ? '✅ Yes' : '❌ No'],
              ['Watchlist', user.watchlist_verified ? '✅ Clear' : '❌ Pending'],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="text-xs font-medium text-gray-800">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Vigía Verdict */}
      {risk && (
        <div className={`rounded-xl border p-4 mb-4 ${rc.border} ${rc.bg}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Vigía Verdict</p>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${rc.badge}`}>
              {risk.level} — {risk.score}/100
            </span>
          </div>

          {/* Risk factors */}
          <div className="space-y-1.5 mb-3">
            {risk.factors.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs mt-0.5 flex-shrink-0">
                  {f.flag === 'red' ? '❌' : f.flag === 'green' ? '✅' : '⚠️'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-700">{f.name}</span>
                  {f.detail && <span className="text-[10px] text-gray-400 ml-1">— {f.detail}</span>}
                </div>
                <span className={`text-xs font-medium flex-shrink-0 ${f.contribution > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {f.contribution > 0 ? '+' : ''}{f.contribution}
                </span>
              </div>
            ))}
            {risk.factors.length === 0 && (
              <p className="text-xs text-gray-400 italic">No account data — risk assessment incomplete</p>
            )}
          </div>

          {/* Recommended action + next steps */}
          <div className="bg-white bg-opacity-60 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-gray-700 mb-1.5">
              Recommended: {risk.verdict}
            </p>
            <ol className="space-y-1">
              {risk.nextSteps.map((step, i) => (
                <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                  <span className="text-gray-400">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Quick action button */}
          {risk.verdict === 'ESCALATE' && !escalated && !escalateFlagged && (
            <button onClick={flagForEscalation}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-all">
              🚨 Flag for Escalation
            </button>
          )}
          {escalateFlagged && !escalated && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-center">
              <p className="text-xs font-semibold text-red-700 mb-2">⚠️ Flagged for escalation</p>
              <p className="text-xs text-red-600 mb-3">This will notify Zaid and set the ticket to Urgent in Freshdesk.</p>
              <div className="flex gap-2">
                <button onClick={cancelEscalate}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-100">
                  Cancel
                </button>
                <button onClick={confirmEscalate} disabled={escalating}
                  className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-60">
                  {escalating ? 'Escalating...' : 'Confirm Escalation'}
                </button>
              </div>
            </div>
          )}
          {risk.verdict === 'VERIFY' && (
            <div className="text-xs text-amber-700 bg-amber-100 rounded-lg p-2 text-center font-medium">
              ⚠️ Verify customer intent before closing
            </div>
          )}
          {risk.verdict === 'APPROVE' && (
            <div className="text-xs text-green-700 bg-green-100 rounded-lg p-2 text-center font-medium">
              ✅ Routine — proceed with suggested response
            </div>
          )}
        </div>
      )}

      {/* Generate Response — prominent, right after verdict */}
      {command && !replySent && !escalated && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 mb-4">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2.5">
            Step: Generate a Response
          </p>
          <VigiaResponse
            command={command}
            portalType="support"
            resourceId={`FD-${ticket.id}`}
            label="✍️ Generate Response for This Ticket"
            onComplete={handleVigiaComplete}
          />
          {vigiaUsed && (
            <p className="text-[10px] text-blue-500 mt-2">Response generated — scroll down to edit and send</p>
          )}
        </div>
      )}

      {/* Customer's original message */}
      {(() => {
        const firstCustomerMsg = conv.find(c => c.author_type === 'customer');
        const msgText = firstCustomerMsg?.body_text?.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
          || ticket.description_text?.replace(/<[^>]+>/g, '').trim();
        if (!msgText) return null;
        return (
          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
              Customer's message · {timeAgo(firstCustomerMsg?.created_at || ticket.created_at)}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{msgText.slice(0, 600)}</p>
          </div>
        );
      })()}

      {/* 5. Suggested Reply — last */}
      {!replySent && !escalated && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Suggested Reply</p>

          {/* VIGÍA button first */}
          {command && (
            <div className="mb-3">
              <VigiaResponse
                command={command}
                portalType="support"
                resourceId={`FD-${ticket.id}`}
                label="Generate VIGÍA Response"
                onComplete={handleVigiaComplete}
              />
            </div>
          )}

          <textarea
            className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[90px]"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Type response, or generate one above..."
          />
          {vigiaUsed && <p className="text-[10px] text-blue-500 mt-1">Using VIGÍA suggestion — edit as needed</p>}

          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              onClick={() => sendReply(true)}
              disabled={!replyText.trim() || replySending}
              title="Send this reply to the customer and mark the ticket Resolved in Freshdesk"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all disabled:opacity-50">
              {replySending ? 'Sending...' : '✅ Send & Close'}
            </button>
            <button
              onClick={() => sendReply(false)}
              disabled={!replyText.trim() || replySending}
              title="Send this reply to the customer but keep the ticket open for follow-up"
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-all">
              Send (keep open)
            </button>
            <button
              onClick={escalateFlagged ? confirmEscalate : flagForEscalation}
              disabled={escalating || escalated}
              title="Flag this ticket for compliance team review — you will be asked to confirm before anything is sent to Freshdesk"
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all disabled:opacity-60 ${
                escalateFlagged ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
              }`}>
              {escalating ? '...' : escalateFlagged ? '✓ Flagged — Confirm?' : '🚨 Flag for Escalation'}
            </button>
          </div>
          <div className="mt-2 flex gap-4">
            <p className="text-[10px] text-gray-400"><strong>Send &amp; Close</strong> — sends email + resolves ticket in Freshdesk</p>
            <p className="text-[10px] text-gray-400"><strong>Send (keep open)</strong> — sends email + keeps ticket open</p>
            <p className="text-[10px] text-gray-400"><strong>Escalate</strong> — flags for compliance, Urgent priority, notifies Zaid</p>
          </div>
        </div>
      )}

      {replySent && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center mb-4">
          <p className="font-semibold text-green-700">Response sent & ticket closed</p>
          <p className="text-xs text-gray-500 mt-1">Logged to audit trail</p>
        </div>
      )}

      {escalated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center mb-4">
          <p className="font-semibold text-amber-700">Escalated to compliance team</p>
          <p className="text-xs text-gray-500 mt-1">Priority set to Urgent · Zaid notified</p>
        </div>
      )}
    </div>
  );
}

// ── Search Result Panel ─────────────────────────────────────────
function SearchResult({ result }) {
  const { user, risk, transactions = [] } = result;
  if (result.error) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-600">{result.error}</p>
    </div>
  );

  const age = user?.registered_at
    ? Math.floor((Date.now() - new Date(user.registered_at)) / 86400000) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Account</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            ['Name', user.first_name ? `${user.first_name} ${user.last_name || ''}` : '—'],
            ['Email', user.email || '—'],
            ['Account age', age != null ? `${age} days` : '—'],
            ['Status', user.status || '—'],
            ['KYC tier', user.tier_level != null ? `Tier ${user.tier_level}` : '—'],
            ['Risk level', risk?.risk_level || '—'],
            ['ID verified', user.document_verified ? '✅ Yes' : '❌ No'],
            ['Watchlist', user.watchlist_verified ? '✅ Clear' : '❌ Pending'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="text-xs font-medium text-gray-800 truncate">{val}</p>
            </div>
          ))}
        </div>
      </div>
      {transactions.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Recent Transactions ({transactions.length})
          </p>
          <div className="space-y-1.5">
            {transactions.slice(0, 5).map((t, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-600">
                <span>{t.operation_type || t.type || 'Transaction'}</span>
                <span className="font-medium">{t.amount} · {timeAgo(t.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {result.command && (
        <VigiaResponse command={result.command} portalType="support"
          resourceId={user?.email} label="Get Account Summary" />
      )}
    </div>
  );
}


// ── Metrics Bar ──────────────────────────────────────────────────
function MetricsBar() {
  const [metrics, setMetrics] = React.useState(null);

  const fetchMetrics = React.useCallback(() => {
    fetch('/api/support/metrics', { headers: authHdr() })
      .then(r => r.json())
      .then(setMetrics)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchMetrics();
    const iv = setInterval(fetchMetrics, 60000);
    return () => clearInterval(iv);
  }, [fetchMetrics]);

  if (!metrics) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap mb-5 p-3.5 rounded-xl bg-white border border-gray-200">
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-xs text-gray-500">Open:</span>
        <span className="text-xs font-bold text-gray-900">{metrics.open ?? '—'}</span>
      </div>
      <div className="w-px h-3 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${metrics.overdue > 0 ? 'bg-red-500' : 'bg-green-500'}`} />
        <span className="text-xs text-gray-500">Overdue (&gt;3h):</span>
        <span className={`text-xs font-bold ${metrics.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {metrics.overdue ?? '—'}
        </span>
      </div>
      <div className="w-px h-3 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-gray-500">Avg close:</span>
        <span className="text-xs font-bold text-gray-900">
          {metrics.avgCloseHours != null ? `${metrics.avgCloseHours}h` : '—'}
        </span>
      </div>
      <div className="flex-1" />
      <span className="text-[10px] text-gray-400">Updates every 60s</span>
    </div>
  );
}

// ── Main Support Component ──────────────────────────────────────
export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [, setTick] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const fetchTickets = useCallback((showSpinner = false) => {
    if (showSpinner) setTicketsLoading(true);
    fetch('/api/support/tickets', { headers: authHdr() })
      .then(r => r.json())
      .then(d => {
        setTickets((d.tickets || []).sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0)));
        setLastRefreshed(Date.now());
      })
      .catch(() => {})
      .finally(() => setTicketsLoading(false));
  }, []);

  useEffect(() => { fetchTickets(true); }, [fetchTickets]);
  useEffect(() => {
    const iv = setInterval(() => fetchTickets(false), 30000);
    return () => clearInterval(iv);
  }, [fetchTickets]);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    setSearchPerformed(true);
    setSelectedTicketId(null);
    try {
      const r = await fetch('/api/support/search', {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ query: searchQuery.trim() })
      });
      setSearchResult(await r.json());
    } catch (err) { setSearchResult({ error: err.message }); }
    setSearchLoading(false);
  };

  const urgentCount = tickets.filter(t => t.isUrgent).length;

  // If a ticket is selected, show detail full-width
  if (selectedTicketId) {
    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-gray-50">
        <TicketDetail
          ticketId={selectedTicketId}
          onClose={() => {
            setSelectedTicketId(null);
            fetchTickets(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Metrics bar */}
      <MetricsBar />

      {/* Search — PRIMARY */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Search User</p>
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Name, email, or account ID..."
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            style={{ color: '#111827' }}
          />
          <button type="submit" disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#0066FF' }}>
            {searchLoading ? '...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Search result */}
      {searchPerformed && (
        <div className="mb-6">
          {searchLoading && (
            <div className="space-y-2">
              <div className="h-6 bg-gray-100 rounded animate-pulse w-1/3" />
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
            </div>
          )}
          {searchResult && !searchLoading && <SearchResult result={searchResult} />}
        </div>
      )}

      {/* Queue — SECONDARY */}
      <div>
        <button onClick={() => setQueueOpen(o => !o)}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all">
          <div className="flex items-center gap-3">
            <span className="text-xl">📋</span>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">
                Open Ticket Queue
                {!ticketsLoading && tickets.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                    {tickets.length}
                  </span>
                )}
                {urgentCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                    ⚠️ {urgentCount} urgent
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Refreshed {secAgo(lastRefreshed)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); fetchTickets(false); }}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium">↻</button>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${queueOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {queueOpen && (
          <div className="mt-2 rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {ticketsLoading && (
              <div className="p-4 space-y-2">
                {Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            )}
            {!ticketsLoading && tickets.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">No open tickets</div>
            )}
            {tickets.map(t => (
              <button key={t.id} onClick={() => setSelectedTicketId(t.id)}
                className={`w-full text-left px-4 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${t.isUrgent ? 'border-l-4 border-l-orange-400' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-gray-500">#{t.id}</span>
                      {t.isUrgent && <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">⚠️ {t.hoursOpen}h open</span>}
                    </div>
                    <p className="text-sm font-medium text-gray-800 truncate">{t.subject}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.name || t.email}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 mt-1">
                    {PRIORITY_LABEL[t.priority]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
