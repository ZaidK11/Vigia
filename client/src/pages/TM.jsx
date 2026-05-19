import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaResponse from '../components/VigiaResponse.jsx';
import NarrativeEditor from '../components/NarrativeEditor.jsx';

function buildCommand(type, alert, panels) {
  const { txnPattern, regulatory } = panels || {};
  const base = `Alert: ${alert.id} | Status: ${alert.status} | Days open: ${alert.daysOpen || 0}
User: ${alert.userId || 'Unknown'} | Type: ${alert.type || 'TM'}
Total: ${txnPattern?.totalVolume || 'N/A'} across ${txnPattern?.count || 0} txns | Span: ${txnPattern?.timeSpan || 'N/A'}
Flags: ${txnPattern?.flags?.join(', ') || 'None'} | SAR deadline: ${regulatory?.sarDeadlineDays ?? '?'} days`;

  if (type === 'analysis') return `${base}\n\nAnalyze this TM alert:\n1. Risk level (LOW/MEDIUM/HIGH/CRITICAL)\n2. Pattern (structuring/velocity/layering/other)\n3. SAR recommendation (FILE_SAR/MONITOR/CLOSE)\n4. Confidence and reasoning citing BSA/FinCEN`;
  if (type === 'related') return `${base}\n\nFind related patterns and typologies:\n1. What does this pattern typically indicate?\n2. Similar FinCEN typologies that match\n3. Additional data points needed\n4. Cross-case considerations`;
  if (type === 'actions') return `${base}\n\nRecommend account actions during investigation:\n1. Limit / suspend / keep active — and why\n2. Compensating controls while investigating\n3. Regulatory deadline for final determination\n4. Concrete next action (who / what / by when)`;
  return '';
}

function buildJiraNote(alert, panels) {
  const { txnPattern, regulatory } = panels || {};
  return `INVESTIGATION NOTE — ${alert.id}
Date: ${new Date().toISOString().slice(0, 10)} | Analyst: [Your Name]

Summary: ${alert.summary || 'TM Alert Investigation'}
User: ${alert.userId || 'Unknown'} | Status: ${alert.status}

PATTERN:
- Total: ${txnPattern?.totalVolume || 'N/A'} across ${txnPattern?.count || 0} transactions
- Span: ${txnPattern?.timeSpan || 'N/A'}
- Flags: ${txnPattern?.flags?.join('; ') || 'None'}

SAR CLOCK: ${alert.daysOpen || 0} days open | ${regulatory?.sarDeadlineDays ?? '?'} days to SAR deadline
Threshold: ${regulatory?.sarThreshold || 'N/A'}

CUSTOMER CONTEXT: [Add here]

RECOMMENDATION: [ ] FILE SAR  [ ] MONITOR  [ ] CLOSE

NEXT ACTION: [Specific next step]

EWRA-20 | POL-BSA-001-v4.2 | MEM-TM-001`;
}

export default function TM() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [alertData, setAlertData] = useState(null);
  const [alertLoading, setAlertLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [command, setCommand] = useState('');
  const [viewMode, setViewMode] = useState('response');
  const [jiraNote, setJiraNote] = useState('');
  const [jiraCopied, setJiraCopied] = useState(false);

  useEffect(() => {
    api.tm.alerts()
      .then(d => setAlerts(d.alerts || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  const selectAlert = async (a) => {
    setSelected(a);
    setAlertData(null);
    setActiveAction(null);
    setCommand('');
    setJiraNote('');
    setAlertLoading(true);
    try {
      const d = await api.tm.alert(a.id);
      setAlertData(d);
    } catch {}
    setAlertLoading(false);
  };

  const handleAction = (type, mode = 'response') => {
    setActiveAction(type);
    setViewMode(mode);
    if (mode === 'response' && alertData?.alert) {
      setCommand(buildCommand(type, alertData.alert, alertData.panels));
    } else if (mode === 'jira' && alertData?.alert) {
      setJiraNote(buildJiraNote(alertData.alert, alertData.panels));
    }
  };

  const copyJira = () => {
    navigator.clipboard.writeText(jiraNote).then(() => {
      setJiraCopied(true);
      setTimeout(() => setJiraCopied(false), 2000);
    });
  };

  const panels = alertData?.panels;
  const alert = alertData?.alert;

  // Priority sort: New Investigation first
  const sortedAlerts = [...alerts].sort((a, b) => {
    const priority = (s) => s?.includes('New Investigation') ? 0 : s?.includes('New') ? 1 : 2;
    return priority(a.status) - priority(b.status);
  });

  const sarUrgent = alert?.daysOpen > 60;
  const clockBreach = (alert?.daysOpen || 0) * 24 > 3;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left: Queue */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">TM Alerts</h2>
          <p className="text-xs text-gray-400 mt-0.5">{loading ? 'Loading...' : `${alerts.length} open`}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && Array(5).fill(0).map((_, i) => (
            <div key={i} className="card-sm p-3"><div className="skeleton h-4 w-3/4 mb-2" /><div className="skeleton h-3 w-1/2" /></div>
          ))}
          {sortedAlerts.map(a => {
            const isNew = a.status?.includes('New Investigation');
            return (
              <div key={a.id} onClick={() => selectAlert(a)}
                className={`queue-item ${selected?.id === a.id ? 'queue-item-active' : ''}`}>
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-xs font-bold text-gray-700">{a.id}</span>
                  <span className={isNew ? 'priority-high' : 'priority-medium'}>{a.status}</span>
                </div>
                <p className="text-xs text-gray-600 truncate mb-1">{a.summary?.slice(0, 55) || a.type || 'TM Alert'}</p>
                <p className="text-[10px] text-gray-400">{a.assignedTo || 'Unassigned'}</p>
              </div>
            );
          })}
          {!loading && alerts.length === 0 && (
            <div className="text-center py-8"><p className="text-sm text-gray-400">No open alerts</p></div>
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="font-medium text-gray-400">Select an alert from the queue</p>
              <p className="text-sm text-gray-300 mt-1">Sorted by priority — New Investigation first</p>
            </div>
          </div>
        )}

        {selected && (
          <div className="p-6 max-w-3xl">
            {alertLoading && (
              <div className="space-y-4">
                <div className="skeleton h-8 w-48" /><div className="skeleton h-40 w-full" />
              </div>
            )}

            {alert && !alertLoading && (
              <>
                {/* 3hr Clock Warning */}
                {clockBreach && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
                    <span className="text-amber-500 text-sm">⏱</span>
                    <p className="text-sm text-amber-700">
                      <strong>3-Hour SLA:</strong> This alert has been open {alert.daysOpen} day(s) — ensure disposition is documented.
                    </p>
                  </div>
                )}

                {/* Alert card */}
                <div className="card mb-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900">{alert.id}</span>
                        <span className={alert.status?.includes('New Investigation') ? 'priority-high' : 'priority-medium'}>
                          {alert.status}
                        </span>
                        {alert.isLimited && <span className="badge-limited">Limited</span>}
                      </div>
                      <p className="text-sm text-gray-600">{alert.summary}</p>
                      {alert.userId && <p className="text-xs text-gray-400 font-mono mt-1">User: {alert.userId}</p>}
                    </div>
                    {sarUrgent && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center flex-shrink-0 ml-3">
                        <p className="text-xs font-bold text-red-600">SAR DEADLINE</p>
                        <p className="text-lg font-black text-red-600">{panels?.regulatory?.sarDeadlineDays ?? '?'}</p>
                        <p className="text-[10px] text-red-400">days left</p>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Total', value: panels?.txnPattern?.totalVolume },
                      { label: 'Count', value: panels?.txnPattern?.count },
                      { label: 'Span', value: panels?.txnPattern?.timeSpan },
                      { label: 'Days Open', value: alert.daysOpen || 0, warn: clockBreach },
                    ].map(d => (
                      <div key={d.label} className="bg-gray-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-gray-500">{d.label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${d.warn ? 'text-amber-600' : 'text-gray-800'}`}>
                          {d.value || '—'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Flags */}
                  {panels?.txnPattern?.flags?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {panels.txnPattern.flags.map((f, i) => (
                        <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{f}</p>
                      ))}
                    </div>
                  )}

                  {/* SAR eligibility */}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-xs text-gray-500">{panels?.regulatory?.sarThreshold}</div>
                    {!sarUrgent && (
                      <div className="text-xs text-gray-500">SAR deadline: {panels?.regulatory?.sarDeadlineDays ?? '?'} days</div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="card mb-4">
                  <p className="section-label">Investigation Actions</p>
                  <div className="space-y-2">
                    {[
                      { type: 'analysis', label: 'Get Analysis from VIGÍA', desc: 'SAR recommendation and risk assessment', mode: 'response' },
                      { type: 'sar', label: 'Generate SAR Narrative', desc: 'Pre-filled 4-section template', mode: 'narrative' },
                      { type: 'jira', label: 'Write Jira Investigation Note', desc: 'Copy-ready note for Jira case file', mode: 'jira' },
                      { type: 'related', label: 'Related Cases & Typologies', desc: 'FinCEN patterns, cross-references', mode: 'response' },
                      { type: 'actions', label: 'Account Action Recommendation', desc: 'Limit / suspend / compensating controls', mode: 'response' },
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
                  <VigiaResponse command={command} portalType="tm" resourceId={alert.id} />
                )}
                {viewMode === 'narrative' && (
                  <NarrativeEditor mode="tm" resourceId={alert.id}
                    patternText={alertData.sarTemplate?.patternDescription || `${panels?.txnPattern?.count || 0} transactions totaling ${panels?.txnPattern?.totalVolume || 'N/A'} over ${panels?.txnPattern?.timeSpan || 'N/A'}. ${panels?.txnPattern?.flags?.join(' ') || ''}`} />
                )}
                {viewMode === 'jira' && jiraNote && (
                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-gray-800">Jira Investigation Note</p>
                      <button onClick={copyJira} className="btn-outline btn-sm">
                        {jiraCopied ? 'Copied!' : 'Copy to clipboard'}
                      </button>
                    </div>
                    <textarea className="textarea font-mono text-xs min-h-[280px]" value={jiraNote}
                      onChange={e => setJiraNote(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-2">Paste into Jira case comment. Fill in customer context and recommendation before posting.</p>
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
