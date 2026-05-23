import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaResponse from '../components/VigiaResponse.jsx';
import EddButton from '../components/EddButton.jsx';
import { useAuth } from '../App.jsx';

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now() - new Date(ts)) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function getToken() { return localStorage.getItem('vigia_token'); }
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// ── Build investigation command ──────────────────────────────────
function buildKycInvestigationCommand(app) {
  return `You are a KYC verification analyst at Airtm, a US MSB (FinCEN) and Argentina VASP (UIF/CNV).

Analyze this KYC application and provide a verdict.

Application ID: ${app.id}
Applicant: ${app.name || 'Unknown'}
Country: ${app.country || 'Unknown'}
KYC Tier: ${app.kycTier != null ? `Tier ${app.kycTier}` : 'Not assigned'}
Inquiry status: ${app.inquiryStatus || 'Unknown'}
Persona status: ${app.personaStatus || 'Unknown'}

Document verification:
- Identity document: ${app.documentVerified ? 'VERIFIED' : 'NOT VERIFIED'}
- Facial / liveness check: ${app.facialVerified ? 'VERIFIED' : 'NOT VERIFIED'}
- Watchlist / sanctions screening: ${app.watchlistVerified ? 'CLEAR' : 'NOT CLEARED'}

REQUIRED OUTPUT FORMAT — use exactly this structure:

VERDICT: [APPROVE / REQUEST_DOCS / REJECT]
CONFIDENCE: [0-100]%
KEY FACTORS:
- [Factor 1 — specific finding about verification or risk]
- [Factor 2]
- [Factor 3 if applicable]
REASONING: [2-3 sentences explaining the verdict, tied to specific verification data above]
NEXT STEP: [One clear action — who does what right now]

If APPROVE: Explain what makes this application approvable and confidence in verification.
If REQUEST_DOCS: List exactly which documents are needed and why each is required.
If REJECT: Cite the specific regulatory reason (sanctions match, fraud pattern, policy restriction, etc).`;
}

// ── Build conditional output commands ────────────────────────────
function buildOutputCommand(type, app, verdict) {
  if (type === 'approval_rec') {
    return `Write a 3-sentence approval recommendation for Jira comment. Application ${app.id}, applicant from ${app.country || 'Unknown'}. All documents verified. Persona status: ${app.personaStatus}. KYC Tier ${app.kycTier}. State why this application meets approval criteria under BSA/FinCEN CDD requirements. Passive voice, factual, no customer-facing language.`;
  }
  if (type === 'doc_request') {
    return `Write a Jira comment explaining what documents are needed for application ${app.id}.
Current status: Identity ${app.documentVerified ? 'verified' : 'NOT verified'} | Facial ${app.facialVerified ? 'verified' : 'NOT verified'} | Watchlist ${app.watchlistVerified ? 'clear' : 'NOT cleared'}.
Country: ${app.country || 'Unknown'}.
List exactly which documents are missing, why each is required under BSA/FinCEN CDD rules, and what the applicant needs to submit. Factual, internal compliance language.`;
  }
  if (type === 'doc_email') {
    return `Write a short, polite customer-facing email asking for the missing documents for this KYC application.
Missing: Identity ${!app.documentVerified ? 'document' : ''} ${!app.facialVerified ? '| selfie/liveness' : ''} ${!app.watchlistVerified ? '| additional screening required' : ''}.
Keep it simple, friendly, under 100 words. Do NOT mention regulatory requirements or internal systems. Just tell them what they need to send and why (to complete their verification). Sign as "Airtm Compliance Team".`;
  }
  if (type === 'rejection_reason') {
    return `Write a Jira comment explaining the rejection reason for KYC application ${app.id}.
Persona status: ${app.personaStatus}. Watchlist cleared: ${app.watchlistVerified ? 'Yes' : 'No'}.
Explain the regulatory basis for rejection (cite relevant BSA/FinCEN or UIF policy). Factual, passive voice, no customer-facing language.`;
  }
  if (type === 'rejection_email') {
    return `Write a short, professional customer-facing email notifying the applicant that their KYC verification could not be completed at this time.
Do NOT reveal specific reasons (regulatory requirement). Keep it under 80 words. Mention they can contact support if they have questions. Sign as "Airtm Compliance Team". No jargon.`;
  }
  return '';
}

// ── Application Detail ────────────────────────────────────────────
function AppDetail({ appId, onClose }) {
  const { user } = useAuth();
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState(null); // APPROVE | REQUEST_DOCS | REJECT
  const [investigationDone, setInvestigationDone] = useState(false);
  const [activeOutput, setActiveOutput] = useState(null);
  const [outputCommand, setOutputCommand] = useState('');
  const [decisionLogged, setDecisionLogged] = useState(false);

  useEffect(() => {
    setLoading(true);
    setAppData(null);
    setVerdict(null);
    setInvestigationDone(false);
    setActiveOutput(null);
    setDecisionLogged(false);
    api.kyc.application(appId)
      .then(setAppData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appId]);

  const handleAnalysisComplete = (text) => {
    const m = text.match(/VERDICT:\s*(APPROVE|REQUEST_DOCS|REJECT)/i);
    if (m) setVerdict(m[1].toUpperCase());
    setInvestigationDone(true);
  };

  const showOutput = (type) => {
    setActiveOutput(type);
    setOutputCommand(buildOutputCommand(type, appData?.application || {}, verdict));
  };

  const logDecision = async (decision) => {
    try {
      await api.kyc.decision(appId, decision, `Verdict: ${verdict}`);
      setDecisionLogged(true);
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

  const investigationCommand = buildKycInvestigationCommand(app);

  const verdictColor = {
    APPROVE: 'bg-green-100 text-green-700 border-green-200',
    REQUEST_DOCS: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    REJECT: 'bg-red-100 text-red-700 border-red-200',
  }[verdict] || '';

  return (
    <div className="p-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">{app.name || app.id}</span>
            {verdict && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${verdictColor}`}>
                {verdict.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{app.id} · {app.country || '—'} · {app.inquiryStatus}</p>
        </div>
        <EddButton
          subject={{ firstName: (app.name||'').split(' ')[0]||'', lastName: (app.name||'').split(' ').slice(1).join(' ')||app.name||'', country: app.country||'' }}
          caseId={appId}
          analystId={user?.email}
          analystName={user?.name}
        />
      </div>

      {/* Application data panel */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Application Data</p>

        {/* Key facts grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
          {[
            ['Name', app.name],
            ['Country', app.country || '—'],
            ['KYC Tier', app.kycTier != null ? `Tier ${app.kycTier}` : '—'],
            ['Inquiry status', app.inquiryStatus || '—'],
            ['Persona status', app.personaStatus || '—'],
            ['Email', app.email || '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="text-xs font-medium text-gray-800">{val}</p>
            </div>
          ))}
        </div>

        {/* Document verification status */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Verification Status</p>
          <div className="space-y-2">
            {[
              ['Identity Document', app.documentVerified],
              ['Facial / Liveness Check', app.facialVerified],
              ['Watchlist / Sanctions', app.watchlistVerified],
            ].map(([label, verified]) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{label}</span>
                <span className={`text-sm font-semibold ${verified ? 'text-green-600' : 'text-red-500'}`}>
                  {verified ? '✓ Verified' : '✗ Not verified'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk indicators */}
        {(!app.documentVerified || !app.facialVerified || !app.watchlistVerified) && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs font-semibold text-amber-700 mb-1">Missing verifications</p>
            <div className="space-y-0.5">
              {!app.documentVerified && <p className="text-xs text-amber-700">· Identity document not verified</p>}
              {!app.facialVerified && <p className="text-xs text-amber-700">· Facial / liveness check not verified</p>}
              {!app.watchlistVerified && <p className="text-xs text-amber-700">· Watchlist screening not cleared</p>}
            </div>
          </div>
        )}
      </div>

      {/* Investigation — single button */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Investigation</p>
        <VigiaResponse
          command={investigationCommand}
          portalType="kyc"
          resourceId={app.id}
          label="🪪 Get KYC Verdict"
          onComplete={handleAnalysisComplete}
        />
      </div>

      {/* Conditional outputs — only after verdict */}
      {investigationDone && verdict && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Steps</p>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${verdictColor}`}>
              {verdict.replace('_', ' ')}
            </span>
          </div>

          {/* Output buttons — conditional */}
          <div className="space-y-2 mb-4">
            {verdict === 'APPROVE' && (
              <button onClick={() => showOutput('approval_rec')}
                className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'approval_rec' ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div>
                  <p className="text-sm font-semibold text-gray-800">✅ Get Approval Recommendation</p>
                  <p className="text-xs text-gray-500">Jira comment — why this application meets criteria</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {verdict === 'REQUEST_DOCS' && (
              <>
                <button onClick={() => showOutput('doc_request')}
                  className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'doc_request' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">📋 Get Document Request (Jira)</p>
                    <p className="text-xs text-gray-500">Which docs needed and why — for Jira comment</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button onClick={() => showOutput('doc_email')}
                  className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'doc_email' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">✉️ Get Document Request Email</p>
                    <p className="text-xs text-gray-500">Customer-facing email — polite, no jargon</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {verdict === 'REJECT' && (
              <>
                <button onClick={() => showOutput('rejection_reason')}
                  className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'rejection_reason' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">❌ Get Rejection Reason (Jira)</p>
                    <p className="text-xs text-gray-500">Regulatory basis for rejection — for Jira comment</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button onClick={() => showOutput('rejection_email')}
                  className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'rejection_email' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">✉️ Get Rejection Email</p>
                    <p className="text-xs text-gray-500">Customer-facing — no regulatory detail revealed</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Output panel */}
          {activeOutput && outputCommand && (
            <div className="mb-4">
              <VigiaResponse
                command={outputCommand}
                portalType="kyc"
                resourceId={`${app.id}-${activeOutput}`}
                label={activeOutput.includes('email') ? '✉️ Generate Email' : '📋 Generate Jira Comment'}
              />
              <p className="text-xs text-gray-400 mt-2 text-center">
                ↑ Copy this text and paste {activeOutput.includes('email') ? 'into Freshdesk / email' : 'into Jira'} manually
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Log Action</p>

            {verdict === 'APPROVE' && (
              <div className="flex gap-2">
                <button onClick={() => logDecision('APPROVE')} disabled={decisionLogged}
                  title="Log application approval — analyst completes verification in Persona"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all disabled:opacity-50">
                  Approve Application
                </button>
              </div>
            )}

            {verdict === 'REQUEST_DOCS' && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => logDecision('REQUEST_DOCS')} disabled={decisionLogged}
                  title="Log document request sent — awaiting customer response"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white transition-all disabled:opacity-50">
                  Send Request
                </button>
                <button onClick={() => logDecision('REJECT')} disabled={decisionLogged}
                  title="Log rejection if customer does not respond within SLA"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all disabled:opacity-50">
                  Reject (No Response)
                </button>
              </div>
            )}

            {verdict === 'REJECT' && (
              <div className="flex gap-2">
                <button onClick={() => logDecision('REJECT')} disabled={decisionLogged}
                  title="Log application rejection — audit trail entry created"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-50">
                  Reject Application
                </button>
              </div>
            )}

            {decisionLogged && (
              <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <p className="text-xs font-medium text-green-700">✓ Decision logged to audit trail</p>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">
              All logged actions are recorded in the audit trail. Analyst must complete the action in Persona separately.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Group ──────────────────────────────────────────────────
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

// ── Main KYC Component ────────────────────────────────────────────
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
      const q = searchQuery.toLowerCase();
      const matched = apps.filter(a =>
        a.id?.toLowerCase().includes(q) ||
        a.userId?.toLowerCase().includes(q) ||
        a.status?.toLowerCase().includes(q)
      );
      setSearchResults(matched);
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

  const pending = apps.filter(a => ['pending', 'needs_review', 'created'].includes(a.status));
  const waiting = apps.filter(a => ['waiting', 'failed'].includes(a.status));

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
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-purple-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
          <button type="submit" disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#7C3AED' }}>
            {searchLoading ? '...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Search results */}
      {searchResults !== null && (
        <div className="mb-6">
          {searchResults.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600">{searchResults.length} result(s) for "{searchQuery}"</p>
              </div>
              {searchResults.map(a => (
                <button key={a.id} onClick={() => setSelectedId(a.id)}
                  className="w-full text-left px-4 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800 truncate">{a.id}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.status} · {a.country || '—'} · {timeAgo(a.created)}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
              No applications found for "{searchQuery}"
            </div>
          )}
        </div>
      )}

      {/* Applications by status — SECONDARY */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Applications by Status</p>
        <StatusGroup icon="⏳" label="Pending Review" count={pending.length} onClickAll={() => setShowList(l => !l)} />
        <StatusGroup icon="📋" label="Awaiting / Failed" count={waiting.length} onClickAll={() => setShowList(l => !l)} />
        <StatusGroup icon="🔢" label="All Loaded" count={apps.length} onClickAll={() => setShowList(l => !l)} />

        {showList && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">
                {loading ? 'Loading...' : `${apps.length} applications`}
              </p>
              <button onClick={() => setShowList(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
            </div>
            {loading ? (
              <div className="p-4 space-y-2">
                {Array(4).fill(0).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : apps.map(a => (
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
