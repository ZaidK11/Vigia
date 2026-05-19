import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import SearchBox from '../components/SearchBox.jsx';
import UserCard from '../components/UserCard.jsx';
import VigiaResponse from '../components/VigiaResponse.jsx';

const PRIORITY_LABEL = ['', 'Low', 'Medium', 'High', 'Urgent'];
const PRIORITY_CLASS = ['', 'badge-gray', 'badge-pending', 'priority-medium', 'priority-high'];
const STATUS_LABEL = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed', 6: 'Waiting on Customer' };

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getToken() { return localStorage.getItem('vigia_token'); }
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

export default function Support() {
  const [view, setView] = useState('queue'); // 'queue' | 'search'
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [ticketData, setTicketData] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [vigiaCommand, setVigiaCommand] = useState('');
  const [vigiaUsed, setVigiaUsed] = useState(false);

  // Search state
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchCommand, setSearchCommand] = useState('');

  useEffect(() => {
    fetch('/api/support/tickets', { headers: authHdr() })
      .then(r => r.json())
      .then(d => setTickets(d.tickets || []))
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false));
  }, []);

  const selectTicket = async (t) => {
    setSelected(t);
    setTicketData(null);
    setReplyText('');
    setReplySent(false);
    setEscalated(false);
    setVigiaCommand('');
    setVigiaUsed(false);
    setTicketLoading(true);
    try {
      const res = await fetch(`/api/support/ticket/${t.id}`, { headers: authHdr() });
      const d = await res.json();
      setTicketData(d);
      setVigiaCommand(d.command || '');
    } catch {}
    setTicketLoading(false);
  };

  const handleVigiaComplete = (responseText) => {
    // Auto-populate reply with VIGÍA's suggested response
    const lines = responseText.split('\n');
    // Find the suggested response section
    const respIdx = lines.findIndex(l => l.toLowerCase().includes('response:') || l.toLowerCase().includes('hi ') || l.toLowerCase().includes('dear '));
    if (respIdx >= 0) {
      setReplyText(lines.slice(respIdx).join('\n').trim());
    }
    setVigiaUsed(true);
  };

  const sendReply = async (close = true) => {
    if (!replyText.trim() || !selected) return;
    setReplySending(true);
    try {
      await fetch(`/api/support/ticket/${selected.id}/reply`, {
        method: 'POST',
        headers: authHdr(),
        body: JSON.stringify({ body: replyText, close, usedVigiaFlag: vigiaUsed })
      });
      setReplySent(true);
      // Remove from queue
      setTickets(prev => prev.filter(t => t.id !== selected.id));
    } catch {}
    setReplySending(false);
  };

  const escalate = async () => {
    if (!selected) return;
    setEscalating(true);
    try {
      await fetch(`/api/support/ticket/${selected.id}/escalate`, {
        method: 'POST',
        headers: authHdr(),
        body: JSON.stringify({ reason: 'Flagged by support agent via VIGÍA portal' })
      });
      setEscalated(true);
    } catch {}
    setEscalating(false);
  };

  const onSearch = async (query) => {
    setSearchLoading(true);
    setSearchResult(null);
    setSearchCommand('');
    try {
      const res = await fetch('/api/support/search', {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ query, commandType: 'account' })
      });
      const d = await res.json();
      setSearchResult(d);
      setSearchCommand(d.command || '');
    } catch (err) { setSearchResult({ error: err.message }); }
    setSearchLoading(false);
  };

  const ticket = ticketData?.ticket;
  const conv = ticketData?.conversation || [];
  const user = ticketData?.user;
  const prior = ticketData?.priorTickets || [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left: Queue */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Support Portal</h2>
          <div className="flex gap-1 mt-2">
            <button onClick={() => setView('queue')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${view === 'queue' ? 'bg-[#00C9A7] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              Queue {ticketsLoading ? '' : `(${tickets.length})`}
            </button>
            <button onClick={() => setView('search')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${view === 'search' ? 'bg-[#00C9A7] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              Search User
            </button>
          </div>
        </div>

        {view === 'queue' && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {ticketsLoading && Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-3 rounded-xl border border-gray-200"><div className="skeleton h-4 w-3/4 mb-2" /><div className="skeleton h-3 w-1/2" /></div>
            ))}
            {!ticketsLoading && tickets.length === 0 && (
              <div className="text-center py-10"><p className="text-sm text-gray-400">No open tickets</p></div>
            )}
            {tickets.map(t => (
              <div key={t.id} onClick={() => selectTicket(t)}
                className={`queue-item ${selected?.id === t.id ? 'queue-item-active' : ''}`}>
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-bold text-gray-600">#{t.id}</span>
                  <span className={PRIORITY_CLASS[t.priority] || 'badge-gray'}>{PRIORITY_LABEL[t.priority]}</span>
                </div>
                <p className="text-xs font-medium text-gray-800 leading-snug mb-1 line-clamp-2">{t.subject}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">{t.name || t.email?.split('@')[0]}</span>
                  <span className="text-[10px] text-gray-400">{timeAgo(t.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'search' && (
          <div className="flex-1 overflow-y-auto p-3">
            <SearchBox onSearch={onSearch} loading={searchLoading} placeholder="Email or user ID..." />
            {searchResult?.error && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-600">{searchResult.error}</p>
              </div>
            )}
            {searchResult && !searchResult.error && (
              <div className="mt-3 space-y-3">
                <UserCard user={searchResult.user} risk={searchResult.risk}
                  extra={{ txnCount: searchResult.transactions?.length }} />
                {searchCommand && (
                  <VigiaResponse command={searchCommand} portalType="support"
                    resourceId={searchResult.user?.email} label="Get Account Summary" />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Ticket detail */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="font-medium text-gray-400">Select a ticket from the queue</p>
              <p className="text-sm text-gray-300 mt-1">Or switch to Search to look up a customer</p>
            </div>
          </div>
        )}

        {selected && (
          <div className="p-5 max-w-3xl">
            {ticketLoading && (
              <div className="space-y-3">
                <div className="skeleton h-7 w-56" />
                <div className="skeleton h-32 w-full" />
                <div className="skeleton h-20 w-full" />
              </div>
            )}

            {ticket && !ticketLoading && (
              <>
                {/* Ticket header */}
                <div className="card mb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-500">#{ticket.id}</span>
                        <span className={PRIORITY_CLASS[ticket.priority] || 'badge-gray'}>{PRIORITY_LABEL[ticket.priority]}</span>
                        <span className="badge-gray">{STATUS_LABEL[ticket.status]}</span>
                      </div>
                      <h3 className="font-bold text-gray-900">{ticket.subject}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ticket.requester?.name || ''} · {ticket.requester?.email} · {timeAgo(ticket.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Conversation */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3 max-h-48 overflow-y-auto">
                    {conv.length === 0 && (
                      <p className="text-sm text-gray-500">{ticket.description_text?.slice(0, 400) || 'No message'}</p>
                    )}
                    {conv.map(c => (
                      <div key={c.id} className={`${c.author_type === 'customer' ? '' : 'pl-4 border-l-2 border-[#00C9A7]'}`}>
                        <p className="text-[10px] font-semibold text-gray-400 mb-0.5">
                          {c.author_type === 'customer' ? (ticket.requester?.name || 'Customer') : 'Agent'} · {timeAgo(c.created_at)}
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">{c.body_text?.slice(0, 300)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Account context */}
                {user && (
                  <div className="mb-4">
                    <UserCard user={user} risk={{ risk_level: user.risk_level, score: user.score }}
                      extra={{ txnCount: ticketData?.user?.txnCount }} />
                  </div>
                )}

                {/* Prior tickets */}
                {prior.length > 0 && (
                  <div className="card-sm mb-4">
                    <p className="section-label">Prior Tickets ({prior.length})</p>
                    <div className="space-y-1">
                      {prior.slice(0, 3).map(p => (
                        <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                          <span className="text-xs text-gray-600 truncate">#{p.id} — {p.subject?.slice(0, 50)}</span>
                          <span className="badge-gray ml-2 flex-shrink-0">{STATUS_LABEL[p.status]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VIGÍA Analysis */}
                {vigiaCommand && !replySent && (
                  <div className="mb-4">
                    <VigiaResponse
                      command={vigiaCommand}
                      portalType="support"
                      resourceId={`FD-${ticket.id}`}
                      label="Get VIGÍA Analysis + Suggested Response"
                      onComplete={handleVigiaComplete}
                    />
                  </div>
                )}

                {/* Reply area */}
                {!replySent && !escalated && (
                  <div className="card mb-4">
                    <p className="section-label">Your Response</p>
                    <textarea
                      className="textarea min-h-[100px] text-sm"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="Type response or use VIGÍA suggestion above..."
                    />
                    {vigiaUsed && (
                      <p className="text-[10px] text-[#00C9A7] mt-1">Using VIGÍA suggestion — you can edit before sending</p>
                    )}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => sendReply(true)}
                        disabled={!replyText.trim() || replySending}
                        className="btn-success">
                        {replySending ? 'Sending...' : 'Send & Close Ticket'}
                      </button>
                      <button
                        onClick={() => sendReply(false)}
                        disabled={!replyText.trim() || replySending}
                        className="btn-outline">
                        Send (Keep Open)
                      </button>
                      <button onClick={escalate} disabled={escalating} className="btn-danger">
                        {escalating ? 'Escalating...' : 'Escalate to Compliance'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Sent confirmation */}
                {replySent && (
                  <div className="card border-emerald-200 bg-emerald-50 text-center py-6 mb-4">
                    <p className="font-semibold text-emerald-700">Response sent and ticket closed</p>
                    <p className="text-xs text-gray-500 mt-1">Logged to audit trail</p>
                    <button onClick={() => { setSelected(null); setTicketData(null); }} className="btn-outline btn-sm mt-3">
                      Back to queue
                    </button>
                  </div>
                )}

                {/* Escalated confirmation */}
                {escalated && (
                  <div className="card border-amber-200 bg-amber-50 text-center py-6 mb-4">
                    <p className="font-semibold text-amber-700">Ticket escalated to compliance team</p>
                    <p className="text-xs text-gray-500 mt-1">Priority set to Urgent · Zaid notified · Logged</p>
                    <button onClick={() => { setSelected(null); setTicketData(null); }} className="btn-outline btn-sm mt-3">
                      Back to queue
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
