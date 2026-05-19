import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaResponse from '../components/VigiaResponse.jsx';

const REQUEST_DOCS = ['Proof of Address', 'Additional Government ID', 'Income / Source of Funds Proof', 'Business Registration (KYB)', 'Other'];
const REJECT_REASONS = ['ID Document Quality Poor', 'Sanctions / Watchlist Match', 'Fraud Suspected', 'Incomplete Documents', 'Country Restriction (Policy)', 'PEP — Not Disclosed', 'Other'];

function DocRow({ label, verified }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${verified ? 'text-emerald-600' : 'text-gray-400'}`}>
        {verified ? '✓ Verified' : '— Pending'}
      </span>
    </div>
  );
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

// ── Application Detail ──────────────────────────────────────────
function AppDetail({ appId, onClose }) {
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState(null);
  const [decisionDetail, setDecisionDetail] = useState('');
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.kyc.application(appId)
      .then(setAppData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appId]);

  const logDecision = async (d, detail = '') => {
    setDecision(d);
    try {
      await api.kyc.decision(appId, d, detail || decisionDetail);
      setLogged(true);
    } catch {}
  };

  if (loading) return (
    <div className="p-6 space-y-3">
      <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
      <div className="h-32 bg-gray-100 rounded animate-pulse" />
    </div>
  );

  const app = appData?.application;
  if (!app) return <div className="p-6 text-sm text-gray-400">Application not found.</div>;

  return (
    <div className="p-5 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">{app.name}</h3>
          <p className="text-xs text-gray-400">{app.id} · {app.country || 'Unknown country'} · {app.inquiryStatus}</p>
        </div>
      </div>

      {/* Account context */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Applicant Context</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          {[
            ['Name', app.name],
            ['Email', app.email || '—'],
            ['Country', app.country || '—'],
            ['KYC Tier', app.kycTier != null ? `Tier ${app.kycTier}` : '—'],
            ['Persona Status', app.personaStatus || '—'],
            ['Inquiry Status', app.inquiryStatus || '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="text-xs font-medium text-gray-800">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Documents */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Verification Status</p>
        <DocRow label="Identity Document" verified={app.documentVerified} />
        <DocRow label="Facial / Liveness Check" verified={app.facialVerified} />
        <DocRow label="Watchlist / Sanctions" verified={app.watchlistVerified} />
      </div>

      {/* EDD Analysis */}
      {appData?.command && (
        <div className="mb-4">
          <VigiaResponse command={appData.command} portalType="kyc" resourceId={app.id}
            label="Run EDD Analysis" />
        </div>
      )}

      {/* Decision */}
      {!logged ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Log Decision</p>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { d: 'APPROVE', label: '✅ Approve', color: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
              { d: 'REQUEST_DOCS', label: '📋 Request Docs', color: 'border-yellow-300 bg-yellow-50 text-yellow-700' },
              { d: 'REJECT', label: '❌ Reject', color: 'border-red-300 bg-red-50 text-red-700' },
            ].map(b => (
              <button key={b.d} onClick={() => setDecision(b.d)}
                className={`py-2 rounded-lg border text-xs font-semibold transition-all ${decision === b.d ? b.color : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {b.label}
              </button>
            ))}
          </div>

          {decision === 'REQUEST_DOCS' && (
            <select className="w-full border border-gray-200 rounded-lg p-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-200"
              value={decisionDetail} onChange={e => setDecisionDetail(e.target.value)}>
              <option value="">Select document needed...</option>
              {REQUEST_DOCS.map(d => <option key={d}>{d}</option>)}
            </select>
          )}
          {decision === 'REJECT' && (
            <select className="w-full border border-gray-200 rounded-lg p-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-200"
              value={decisionDetail} onChange={e => setDecisionDetail(e.target.value)}>
              <option value="">Select rejection reason...</option>
              {REJECT_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          )}
          {decision && (
            <button onClick={() => logDecision(decision)}
              disabled={(['REQUEST_DOCS', 'REJECT'].includes(decision) && !decisionDetail)}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: decision === 'APPROVE' ? '#059669' : decision === 'REJECT' ? '#DC2626' : '#D97706' }}>
              Log {decision} Decision
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center mb-4">
          <p className="font-semibold text-emerald-700">Decision logged: {decision}</p>
          <p className="text-xs text-gray-500 mt-1">Recorded in audit trail</p>
        </div>
      )}
    </div>
  );
}

// ── Status Group ────────────────────────────────────────────────
function StatusGroup({ icon, label, count, onClickAll }) {
  return (
    <button onClick={onClickAll}
      className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border border-gray-200 bg-white hover:shadow-sm hover:border-gray-300 transition-all">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <span className="font-semibold text-gray-900 text-sm">{label}</span>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">{count}</span>
      </div>
      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ── Main KYC Component ──────────────────────────────────────────
export default function KYC() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    api.kyc.applications()
      .then(d => setApps(d.applications || []))
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      // Search in loaded apps
      const q = searchQuery.toLowerCase();
      const matched = apps.filter(a =>
        a.id?.toLowerCase().includes(q) ||
        a.userId?.toLowerCase().includes(q) ||
        a.status?.toLowerCase().includes(q)
      );
      // Also search by email via ClickHouse
      const r = await fetch('/api/support/search', {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ query: searchQuery.trim() })
      });
      const userData = await r.json();
      setSearchResults({ apps: matched, userData });
    } catch {}
    setSearchLoading(false);
  };

  if (selectedId) {
    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-gray-50">
        <AppDetail appId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Search — PRIMARY */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Search User</p>
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
            placeholder="User name, email, account ID, or Persona ID..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
          />
          <button type="submit" disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#7C3AED' }}>
            {searchLoading ? '...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Search results */}
      {searchResults && (
        <div className="mb-6 space-y-3">
          {searchResults.apps?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600">
                  {searchResults.apps.length} application(s) matching "{searchQuery}"
                </p>
              </div>
              {searchResults.apps.map(a => (
                <button key={a.id} onClick={() => setSelectedId(a.id)}
                  className="w-full text-left px-4 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.id}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.status} · {a.country || '—'} · {timeAgo(a.created)}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchResults.apps?.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
              No applications found for "{searchQuery}"
            </div>
          )}
          {/* Account info if email search */}
          {searchResults.userData?.user && !searchResults.userData?.user?.note && (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
              <p className="text-xs font-semibold text-purple-700 mb-2">Account Found</p>
              <p className="text-sm text-gray-800">{searchResults.userData.user.first_name} {searchResults.userData.user.last_name}</p>
              <p className="text-xs text-gray-500">{searchResults.userData.user.email} · Risk: {searchResults.userData.risk?.risk_level || '—'}</p>
            </div>
          )}
        </div>
      )}

      {/* Applications by status — SECONDARY */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Applications by Status</p>
        <StatusGroup icon="⏳" label="Pending Review" count={apps.filter(a => ['pending','needs_review','created'].includes(a.status)).length} onClickAll={() => setShowList(l => !l)} />
        <StatusGroup icon="📋" label="Awaiting / Failed" count={apps.filter(a => ['waiting','failed'].includes(a.status)).length} onClickAll={() => setShowList(l => !l)} />
        <StatusGroup icon="🔢" label="All Loaded" count={apps.length} onClickAll={() => setShowList(l => !l)} />

        {showList && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mt-2">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">
                {loading ? 'Loading...' : `${apps.length} applications`}
              </p>
              <button onClick={() => setShowList(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
            </div>
            {loading && (
              <div className="p-4 space-y-2">
                {Array(4).fill(0).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
              </div>
            )}
            {apps.map(a => (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 truncate">{a.id}</p>
                    <p className="text-xs text-gray-400">{a.status} · {a.country || '—'} · {timeAgo(a.created)}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
