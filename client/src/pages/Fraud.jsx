import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaResponse from '../components/VigiaResponse.jsx';
import NarrativeEditor from '../components/NarrativeEditor.jsx';

function PriorityBadge({ status, riskFlags, screeningFlags }) {
  const isHigh = riskFlags?.length > 0 || screeningFlags?.includes('Elliptic') || status?.includes('escalate');
  if (isHigh) return <span className="priority-high">HIGH</span>;
  if (status?.includes('Investigation') || status?.includes('Monitoring')) return <span className="priority-medium">MEDIUM</span>;
  return <span className="priority-low">LOW</span>;
}

function buildCommand(type, c, panels) {
  const { txnPattern, networkAnalysis, regulatory } = panels || {};
  const base = `Case: ${c.id} | User: ${c.userId || 'Unknown'}
Total: ${txnPattern?.totalVolume || 'N/A'} across ${txnPattern?.count || 0} transactions
Span: ${txnPattern?.timeSpan || 'N/A'} | Flags: ${txnPattern?.flags?.join(', ') || 'None'}
Risk: ${networkAnalysis?.riskLevel || 'Unknown'} | Days open: ${regulatory?.daysOpen || 0}`;

  if (type === 'analysis') return `${base}\n\nAnalyze this fraud case:\n1. Risk level (LOW/MEDIUM/HIGH/CRITICAL)\n2. Pattern type (structuring/layering/circular/mule/other)\n3. SAR recommendation (YES/NO/PENDING)\n4. Confidence and reasoning (2-3 sentences)`;
  if (type === 'escalation') return `${base}\n\nEscalation recommendation:\nShould this account be A) Immediately blocked, B) Limited pending investigation, C) Monitored only, or D) Cleared?\nGive recommendation with 2-sentence justification and confidence level.`;
  return '';
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now() - new Date(ts)) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function getToken() { return localStorage.getItem('vigia_token'); }
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// ── Case Detail ─────────────────────────────────────────────────
function CaseDetail({ caseId, onClose }) {
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState(null);
  const [command, setCommand] = useState('');
  const [viewMode, setViewMode] = useState('response');

  useEffect(() => {
    setLoading(true);
    api.fraud.case(caseId)
      .then(setCaseData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  const handleAction = (type, mode = 'response') => {
    setActiveAction(type);
    setViewMode(mode);
    if (mode === 'response' && caseData) {
      setCommand(buildCommand(type, caseData.case || {}, caseData.panels));
    }
  };

  const panels = caseData?.panels;
  const c = caseData?.case || {};

  if (loading) return (
    <div className="p-6 space-y-3">
      <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
      <div className="h-32 bg-gray-100 rounded animate-pulse" />
    </div>
  );

  return (
    <div className="p-5 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm">{c.id}</span>
            <PriorityBadge status={c.status} riskFlags={panels?.networkAnalysis?.riskFlags} screeningFlags={panels?.networkAnalysis?.screeningFlags} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{c.summary?.slice(0, 80)}</p>
        </div>
      </div>

      {/* Case summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Case Overview</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Total Volume', panels?.txnPattern?.totalVolume],
            ['Transactions', panels?.txnPattern?.count],
            ['Time Span', panels?.txnPattern?.timeSpan],
            ['Risk Level', panels?.networkAnalysis?.riskLevel?.toUpperCase()],
            ['Days Open', panels?.regulatory?.daysOpen],
            ['SAR Deadline', panels?.regulatory?.sarDeadlineDays != null ? `${panels.regulatory.sarDeadlineDays}d left` : '—'],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{val || '—'}</p>
            </div>
          ))}
        </div>
        {panels?.txnPattern?.flags?.length > 0 && (
          <div className="mt-3 space-y-1">
            {panels.txnPattern.flags.map((f, i) => (
              <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">⚠️ {f}</p>
            ))}
          </div>
        )}
        {c.userId && (
          <p className="text-xs text-gray-400 font-mono mt-3">User ID: {c.userId}</p>
        )}
      </div>

      {/* What tools to check */}
      {(panels?.networkAnalysis?.screeningFlags?.length > 0 || panels?.networkAnalysis?.riskLevel === 'HIGH') && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 mb-4">
          <p className="text-xs font-semibold text-orange-700 mb-2">🔍 Investigate Further</p>
          <ul className="space-y-1.5 text-xs text-orange-800">
            {panels?.networkAnalysis?.screeningFlags?.includes('Elliptic') && (
              <li>→ Check Elliptic — blockchain risk flags detected</li>
            )}
            {panels?.networkAnalysis?.riskLevel === 'HIGH' && (
              <li>→ Review in Kount — high risk score on this account</li>
            )}
            <li>→ Check Jira AR project for prior investigations on this user</li>
            {panels?.regulatory?.daysOpen > 25 && (
              <li className="font-bold">→ SAR clock critical — {panels.regulatory.sarDeadlineDays ?? '?'} days remaining</li>
            )}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Investigation Actions</p>
        <div className="space-y-2">
          {[
            { type: 'analysis', label: '🔎 Get Vigía Analysis', desc: 'Risk assessment and pattern classification', mode: 'response' },
            { type: 'narrative', label: '📝 Write Investigation Narrative', desc: 'Pre-filled SAR narrative template', mode: 'narrative' },
            { type: 'escalation', label: '🚨 Escalation Recommendation', desc: 'Block / Limit / Monitor / Clear', mode: 'response' },
          ].map(a => (
            <button key={a.type} onClick={() => handleAction(a.type, a.mode)}
              className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl border transition-all ${activeAction === a.type ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">{a.label}</p>
                <p className="text-xs text-gray-500">{a.desc}</p>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'response' && command && (
        <VigiaResponse command={command} portalType="fraud" resourceId={c.id} />
      )}
      {viewMode === 'narrative' && (
        <NarrativeEditor mode="fraud" resourceId={c.id}
          patternText={`${panels?.txnPattern?.count || 0} transactions totaling ${panels?.txnPattern?.totalVolume || 'N/A'} over ${panels?.txnPattern?.timeSpan || 'N/A'}. ${panels?.txnPattern?.flags?.join(' ') || ''}`} />
      )}
    </div>
  );
}

// ── Status Group ────────────────────────────────────────────────
function StatusGroup({ label, color, dotColor, cases, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className="font-semibold text-gray-900 text-sm">{label}</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">{cases.length}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && cases.length > 0 && (
        <div className="border-t border-gray-100">
          {cases.map(c => (
            <button key={c.id} onClick={() => onSelect(c)}
              className="w-full text-left px-5 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-gray-600">{c.id}</span>
                    <PriorityBadge status={c.status} riskFlags={c.riskFlags} screeningFlags={c.screeningFlags} />
                  </div>
                  <p className="text-sm text-gray-800 truncate">{c.summary?.slice(0, 70) || 'No summary'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.assignee || 'Unassigned'} · {timeAgo(c.created_at)}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && cases.length === 0 && (
        <div className="border-t border-gray-100 py-4 text-center text-sm text-gray-400">No cases in this group</div>
      )}
    </div>
  );
}

// ── Main Fraud Component ────────────────────────────────────────
export default function Fraud() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    api.fraud.cases()
      .then(d => setCases(d.cases || []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const r = await fetch('/api/support/search', {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ query: searchQuery.trim() })
      });
      const d = await r.json();
      // Also filter cases by query
      const q = searchQuery.toLowerCase();
      const matchedCases = cases.filter(c =>
        c.id?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q) ||
        c.userId?.toLowerCase().includes(q)
      );
      setSearchResults({ user: d, cases: matchedCases });
    } catch {}
    setSearchLoading(false);
  };

  // Group cases by status
  const escalate = cases.filter(c => c.status?.toLowerCase().includes('escalat'));
  const active = cases.filter(c => !c.status?.toLowerCase().includes('escalat') && (c.riskFlags?.length > 0 || c.screeningFlags?.length > 0));
  const low = cases.filter(c => !c.status?.toLowerCase().includes('escalat') && !c.riskFlags?.length && !c.screeningFlags?.length);

  if (selectedId) {
    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-gray-50">
        <CaseDetail caseId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Search — PRIMARY */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Search User or Case</p>
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
            placeholder="User name, email, account ID, or case ID..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 bg-white"
          />
          <button type="submit" disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#DC2626' }}>
            {searchLoading ? '...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Search results */}
      {searchResults && (
        <div className="mb-6 space-y-3">
          {searchResults.cases?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600">Cases matching "{searchQuery}"</p>
              </div>
              {searchResults.cases.map(c => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className="w-full text-left px-4 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-gray-600">{c.id}</span>
                        <PriorityBadge status={c.status} riskFlags={c.riskFlags} screeningFlags={c.screeningFlags} />
                      </div>
                      <p className="text-sm text-gray-800">{c.summary?.slice(0, 70)}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchResults.cases?.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-400 text-center">
              No cases found for "{searchQuery}"
            </div>
          )}
        </div>
      )}

      {/* Cases by status — SECONDARY */}
      {loading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cases by Status</p>
          <StatusGroup label="🔴 Ready to Escalate" dotColor="bg-red-500" cases={escalate} onSelect={c => setSelectedId(c.id)} />
          <StatusGroup label="🟡 Under Investigation" dotColor="bg-yellow-500" cases={active} onSelect={c => setSelectedId(c.id)} />
          <StatusGroup label="🟢 Low Risk" dotColor="bg-green-500" cases={low} onSelect={c => setSelectedId(c.id)} />
        </div>
      )}
    </div>
  );
}
