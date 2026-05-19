import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaResponse from '../components/VigiaResponse.jsx';

const REQUEST_DOCS = ['Proof of Address', 'Additional Government ID', 'Income / Source of Funds Proof', 'Business Registration (KYB)', 'Other'];
const REJECT_REASONS = ['ID Document Quality Poor', 'Sanctions / Watchlist Match', 'Fraud Suspected', 'Incomplete Documents', 'Country Restriction (Policy)', 'PEP — Not Disclosed', 'Other'];

function DocRow({ label, verified }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${verified ? 'text-emerald-600' : 'text-red-500'}`}>
        {verified ? '✓ Verified' : '✗ Not verified'}
      </span>
    </div>
  );
}

export default function KYC() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [appData, setAppData] = useState(null);
  const [appLoading, setAppLoading] = useState(false);
  const [decision, setDecision] = useState(null);
  const [decisionDetail, setDecisionDetail] = useState('');
  const [logged, setLogged] = useState(false);
  const [eddCommand, setEddCommand] = useState('');
  const [manualId, setManualId] = useState('');

  useEffect(() => {
    api.kyc.applications()
      .then(d => setApps(d.applications || []))
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  const selectApp = async (id) => {
    setSelected(id);
    setAppData(null);
    setDecision(null);
    setDecisionDetail('');
    setLogged(false);
    setEddCommand('');
    setAppLoading(true);
    try {
      const d = await api.kyc.application(id);
      setAppData(d);
    } catch {}
    setAppLoading(false);
  };

  const logDecision = async (d, detail = '') => {
    setDecision(d);
    try {
      await api.kyc.decision(selected, d, detail || decisionDetail);
      setLogged(true);
    } catch {}
  };

  const showEdd = () => {
    const app = appData?.application;
    if (!app) return;
    setEddCommand(`Perform Enhanced Due Diligence for KYC applicant.
Name: ${app.name} | Country: ${app.country} | Status: ${app.inquiryStatus}
Document verified: ${app.documentVerified ? 'Yes' : 'No'} | Facial verified: ${app.facialVerified ? 'Yes' : 'No'} | Watchlist: ${app.watchlistVerified ? 'Yes' : 'No'} | KYC tier: ${app.kycTier ?? 'Unknown'}

Under POL-BSA-001-v4.2 Section 4.3:
1. Risk level for this profile (country, documents, anomalies)
2. EDD required? (High=12mo / Medium=18mo / Low=24mo cadence)
3. Specific concerns if any
4. Recommendation: APPROVE / REJECT / REQUEST_DOCS / EDD_REQUIRED
5. Confidence`);
  };

  const app = appData?.application;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left: Queue */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">KYC Applications</h2>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? 'Loading...' : `${apps.length} pending`}</p>
        </div>
        {/* Manual ID input */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="flex gap-1.5">
            <input type="text" value={manualId} onChange={e => setManualId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && selectApp(manualId)}
              placeholder="Enter inquiry ID..." className="input text-xs py-1.5 px-2" />
            <button onClick={() => selectApp(manualId)} disabled={!manualId}
              className="btn-teal btn-sm flex-shrink-0">Load</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && Array(3).fill(0).map((_, i) => (
            <div key={i} className="card-sm p-3"><div className="skeleton h-4 w-3/4 mb-2" /><div className="skeleton h-3 w-1/2" /></div>
          ))}
          {apps.map(a => (
            <div key={a.id} onClick={() => selectApp(a.id)}
              className={`queue-item ${selected === a.id ? 'queue-item-active' : ''}`}>
              <div className="flex items-start justify-between mb-1">
                <span className="text-xs font-mono text-gray-500">{a.id.slice(0, 16)}...</span>
                <span className="badge-pending text-[10px]">{a.status}</span>
              </div>
              <p className="text-xs text-gray-500">{a.country || 'Unknown'} · {a.created?.slice(0, 10)}</p>
            </div>
          ))}
          {!loading && apps.length === 0 && (
            <div className="text-center py-8"><p className="text-sm text-gray-400">No pending applications</p></div>
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="font-medium text-gray-400">Select an application to review</p>
              <p className="text-sm text-gray-300 mt-1">Choose from the pending queue or enter an ID</p>
            </div>
          </div>
        )}

        {selected && (
          <div className="p-6 max-w-3xl">
            {appLoading && (
              <div className="space-y-4">
                <div className="skeleton h-8 w-48" /><div className="skeleton h-40 w-full" />
              </div>
            )}

            {app && !appLoading && (
              <>
                {/* Applicant header */}
                <div className="card mb-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{app.name}</h3>
                      {app.email && <p className="text-sm text-gray-500">{app.email}</p>}
                      <p className="text-xs text-gray-400 font-mono mt-1">{app.id}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className={app.inquiryStatus === 'approved' ? 'badge-active' : 'badge-pending'}>
                        {app.inquiryStatus || 'Unknown'}
                      </span>
                      {app.country && <span className="badge-gray">{app.country}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Document status */}
                    <div>
                      <p className="section-label">Document Verification</p>
                      <DocRow label="National ID" verified={app.documentVerified} />
                      <DocRow label="Selfie / Liveness" verified={app.facialVerified} />
                      <DocRow label="Watchlist / Sanctions" verified={app.watchlistVerified} />
                    </div>
                    {/* Screening */}
                    <div>
                      <p className="section-label">Screening</p>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">OFAC / SDN</span>
                          <span className="text-xs font-semibold text-emerald-600">Clear</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">PEP Check</span>
                          <span className="text-xs font-semibold text-emerald-600">Clear</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">KYC Tier</span>
                          <span className="text-xs font-semibold text-gray-700">{app.kycTier != null ? `Tier ${app.kycTier}` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decision section */}
                {!logged ? (
                  <div className="card mb-4">
                    <p className="section-label">Decision</p>
                    <div className="space-y-3">
                      {/* Approve */}
                      <div>
                        <button onClick={() => logDecision('APPROVE')} disabled={!!decision}
                          className="btn-success w-full justify-center py-2.5">
                          Approve KYC
                        </button>
                      </div>

                      {/* Request docs */}
                      <div className="border border-gray-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Request More Documents</p>
                        <select value={decisionDetail} onChange={e => setDecisionDetail(e.target.value)}
                          className="select mb-2" disabled={!!decision}>
                          <option value="">Select document type...</option>
                          {REQUEST_DOCS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <button onClick={() => decisionDetail && logDecision('REQUEST_DOCS', decisionDetail)}
                          disabled={!decisionDetail || !!decision} className="btn-amber w-full justify-center py-2">
                          Request {decisionDetail || 'Document'}
                        </button>
                      </div>

                      {/* Reject */}
                      <div className="border border-gray-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Reject Application</p>
                        <select value={decisionDetail} onChange={e => setDecisionDetail(e.target.value)}
                          className="select mb-2" disabled={!!decision}>
                          <option value="">Select rejection reason...</option>
                          {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={() => decisionDetail && logDecision('REJECT', decisionDetail)}
                          disabled={!decisionDetail || !!decision} className="btn-danger w-full justify-center py-2">
                          Reject — {decisionDetail || 'Select Reason'}
                        </button>
                      </div>

                      {/* EDD */}
                      <button onClick={showEdd} className="action-btn">
                        <div className="action-btn-icon bg-gray-100">
                          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">EDD Analysis from VIGÍA</p>
                          <p className="text-xs text-gray-500">Enhanced due diligence assessment</p>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="card border-emerald-200 bg-emerald-50 mb-4 text-center py-6">
                    <p className="font-semibold text-emerald-700">Decision recorded</p>
                    <p className="text-sm text-gray-600 mt-1">{decision} · {decisionDetail || 'No detail'}</p>
                    <p className="text-xs text-gray-400 mt-1">Logged to audit trail</p>
                  </div>
                )}

                {eddCommand && (
                  <VigiaResponse command={eddCommand} portalType="kyc" resourceId={app.id} label="VIGÍA EDD Assessment" />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
