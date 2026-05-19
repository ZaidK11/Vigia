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

export default function Fraud() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [command, setCommand] = useState('');
  const [viewMode, setViewMode] = useState('response');

  useEffect(() => {
    api.fraud.cases()
      .then(d => setCases(d.cases || []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  const selectCase = async (c) => {
    setSelected(c);
    setCaseData(null);
    setActiveAction(null);
    setCommand('');
    setCaseLoading(true);
    try {
      const d = await api.fraud.case(c.id);
      setCaseData(d);
    } catch {}
    setCaseLoading(false);
  };

  const handleAction = (type, mode = 'response') => {
    setActiveAction(type);
    setViewMode(mode);
    if (mode === 'response' && caseData) {
      setCommand(buildCommand(type, caseData.case || {}, caseData.panels));
    }
  };

  const panels = caseData?.panels;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left: Queue */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">Fraud Cases</h2>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? 'Loading...' : `${cases.length} open`}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && Array(4).fill(0).map((_, i) => (
            <div key={i} className="card-sm p-4"><div className="skeleton h-4 w-3/4 mb-2" /><div className="skeleton h-3 w-1/2" /></div>
          ))}
          {cases.map(c => (
            <div key={c.id} onClick={() => selectCase(c)}
              className={`queue-item ${selected?.id === c.id ? 'queue-item-active' : ''}`}>
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-700">{c.id}</span>
                <PriorityBadge status={c.status} riskFlags={c.riskFlags} screeningFlags={c.screeningFlags} />
              </div>
              <p className="text-xs text-gray-600 leading-snug mb-1.5">{c.summary?.slice(0, 65) || 'No summary'}</p>
              <p className="text-[10px] text-gray-400">{c.status} · {c.assignee || 'Unassigned'}</p>
            </div>
          ))}
          {!loading && cases.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No open cases</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="font-medium text-gray-400">Select a case from the queue</p>
              <p className="text-sm text-gray-300 mt-1">Click any case on the left to begin</p>
            </div>
          </div>
        )}

        {selected && (
          <div className="p-6 max-w-3xl">
            {caseLoading && (
              <div className="space-y-4">
                <div className="skeleton h-8 w-48" />
                <div className="skeleton h-32 w-full" />
                <div className="skeleton h-24 w-full" />
              </div>
            )}

            {caseData && !caseLoading && (
              <>
                {/* Case header */}
                <div className="card mb-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900">{caseData.case?.id}</span>
                        <PriorityBadge status={caseData.case?.status} riskFlags={panels?.networkAnalysis?.riskFlags} />
                      </div>
                      <p className="text-sm text-gray-600">{caseData.case?.summary}</p>
                      {caseData.case?.userId && <p className="text-xs text-gray-400 font-mono mt-1">User: {caseData.case.userId}</p>}
                    </div>
                  </div>

                  {/* Data panels */}
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {[
                      { label: 'Total', value: panels?.txnPattern?.totalVolume },
                      { label: 'Transactions', value: panels?.txnPattern?.count },
                      { label: 'Time Span', value: panels?.txnPattern?.timeSpan },
                      { label: 'Risk Level', value: panels?.networkAnalysis?.riskLevel?.toUpperCase() },
                      { label: 'Days Open', value: panels?.regulatory?.daysOpen },
                      { label: 'SAR Deadline', value: `${panels?.regulatory?.sarDeadlineDays ?? '?'}d left` },
                    ].map(d => (
                      <div key={d.label} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{d.label}</p>
                        <p className="text-sm font-bold text-gray-800 mt-0.5">{d.value || '—'}</p>
                      </div>
                    ))}
                  </div>

                  {panels?.txnPattern?.flags?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {panels.txnPattern.flags.map((f, i) => (
                        <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{f}</p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="card mb-4">
                  <p className="section-label">Investigation Actions</p>
                  <div className="space-y-2">
                    {[
                      { type: 'analysis', label: 'Get Analysis from VIGÍA', desc: 'Risk assessment and pattern classification', mode: 'response' },
                      { type: 'narrative', label: 'Write Investigation Narrative', desc: 'Pre-filled 4-section template with case data', mode: 'narrative' },
                      { type: 'escalation', label: 'Escalation Recommendation', desc: 'Should this account be blocked, limited, or cleared?', mode: 'response' },
                    ].map(a => (
                      <button key={a.type} onClick={() => handleAction(a.type, a.mode)}
                        className={`action-btn ${activeAction === a.type ? 'action-btn-active' : ''}`}>
                        <div className={`action-btn-icon ${activeAction === a.type ? 'bg-[#00C9A7]/20' : 'bg-gray-100'}`}>
                          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{a.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {viewMode === 'response' && command && (
                  <VigiaResponse command={command} portalType="fraud" resourceId={caseData.case?.id} />
                )}
                {viewMode === 'narrative' && (
                  <NarrativeEditor mode="fraud" resourceId={caseData.case?.id}
                    patternText={`${panels?.txnPattern?.count || 0} transactions totaling ${panels?.txnPattern?.totalVolume || 'N/A'} over ${panels?.txnPattern?.timeSpan || 'N/A'}. ${panels?.txnPattern?.flags?.join(' ') || ''}`} />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
