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

function getToken() { return localStorage.getItem('vigia_token'); }
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// ── Alert Detail ─────────────────────────────────────────────────
function AlertDetail({ alertId, onClose }) {
  const [alertData, setAlertData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState(null);
  const [command, setCommand] = useState('');
  const [viewMode, setViewMode] = useState('response');
  const [jiraNote, setJiraNote] = useState('');
  const [jiraCopied, setJiraCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.tm.alert(alertId)
      .then(setAlertData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [alertId]);

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

  if (loading) return (
    <div className="p-6 space-y-3">
      <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
      <div className="h-40 bg-gray-100 rounded animate-pulse" />
    </div>
  );

  const alert = alertData?.alert;
  const panels = alertData?.panels;
  if (!alert) return <div className="p-6 text-sm text-gray-400">Alert not found.</div>;

  const sarUrgent = (alert?.daysOpen || 0) > 60;
  const clockBreach = (alert?.daysOpen || 0) * 24 > 3;
  const sarDays = panels?.regulatory?.sarDeadlineDays;

  return (
    <div className="p-5 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm">{alert.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alert.status?.includes('New Investigation') ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {alert.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{alert.summary?.slice(0, 80)}</p>
        </div>
      </div>

      {/* 3hr clock */}
      {clockBreach && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-amber-500">⏱</span>
          <p className="text-sm text-amber-700">
            <strong>3-Hour SLA:</strong> This alert is {alert.daysOpen} day(s) old — disposition must be documented.
          </p>
        </div>
      )}

      {/* SAR countdown — prominent when critical */}
      {sarDays != null && (
        <div className={`rounded-xl border p-4 mb-4 ${sarDays <= 5 ? 'border-red-300 bg-red-50' : sarDays <= 15 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">SAR Deadline</p>
              <p className={`text-2xl font-black mt-0.5 ${sarDays <= 5 ? 'text-red-600' : sarDays <= 15 ? 'text-orange-600' : 'text-gray-800'}`}>
                {sarDays} days remaining
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{alert.daysOpen || 0} days since alert opened</p>
            </div>
            {sarDays <= 5 && (
              <div className="text-red-500 text-3xl">🚨</div>
            )}
          </div>
        </div>
      )}

      {/* Case overview */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Alert Overview</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Total Volume', panels?.txnPattern?.totalVolume],
            ['Transactions', panels?.txnPattern?.count],
            ['Time Span', panels?.txnPattern?.timeSpan],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400 uppercase">{label}</p>
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
        {alert.userId && (
          <p className="text-xs text-gray-400 font-mono mt-3">User ID: {alert.userId}</p>
        )}
      </div>

      {/* Investigation actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Investigation Actions</p>
        <div className="space-y-2">
          {[
            { type: 'analysis', label: '📡 Get Vigía Analysis', desc: 'SAR recommendation and risk assessment', mode: 'response' },
            { type: 'sar', label: '📝 Generate SAR Narrative', desc: 'Pre-filled 4-section template', mode: 'narrative' },
            { type: 'jira', label: '📋 Write Jira Note', desc: 'Copy-ready note for Jira case file', mode: 'jira' },
            { type: 'related', label: '🔗 Related Cases & Typologies', desc: 'FinCEN patterns, cross-references', mode: 'response' },
            { type: 'actions', label: '⚡ Account Action Recommendation', desc: 'Limit / suspend / compensating controls', mode: 'response' },
          ].map(a => (
            <button key={a.type} onClick={() => handleAction(a.type, a.mode)}
              className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeAction === a.type ? 'border-amber-300 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div>
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
        <VigiaResponse command={command} portalType="tm" resourceId={alert.id} />
      )}
      {viewMode === 'narrative' && (
        <NarrativeEditor mode="tm" resourceId={alert.id}
          patternText={alertData.sarTemplate?.patternDescription || `${panels?.txnPattern?.count || 0} transactions totaling ${panels?.txnPattern?.totalVolume || 'N/A'} over ${panels?.txnPattern?.timeSpan || 'N/A'}. ${panels?.txnPattern?.flags?.join(' ') || ''}`} />
      )}
      {viewMode === 'jira' && jiraNote && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800">Jira Investigation Note</p>
            <button onClick={copyJira}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-all">
              {jiraCopied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <textarea className="w-full font-mono text-xs border border-gray-200 rounded-xl p-3 min-h-[240px] resize-none focus:outline-none"
            value={jiraNote} onChange={e => setJiraNote(e.target.value)} />
          <p className="text-xs text-gray-400 mt-2">Paste into Jira case comment. Fill customer context and recommendation first.</p>
        </div>
      )}
    </div>
  );
}

// ── Status Group ─────────────────────────────────────────────────
function StatusGroup({ icon, label, dotColor, count, onClickAll }) {
  return (
    <button onClick={onClickAll}
      className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border border-gray-200 bg-white hover:shadow-sm hover:border-gray-300 transition-all">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">{count}</span>
      </div>
      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ── Main TM Component ─────────────────────────────────────────────
export default function TM() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [showGroup, setShowGroup] = useState(null);

  useEffect(() => {
    api.tm.alerts()
      .then(d => setAlerts(d.alerts || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const q = searchQuery.toLowerCase();
      const matched = alerts.filter(a =>
        a.id?.toLowerCase().includes(q) ||
        a.userId?.toLowerCase().includes(q) ||
        a.summary?.toLowerCase().includes(q)
      );
      setSearchResults(matched);
    } catch {}
    setSearchLoading(false);
  };

  const escalate = alerts.filter(a => a.status?.toLowerCase().includes('escalat') || a.status?.includes('Ready'));
  const newAlerts = alerts.filter(a => a.status?.includes('New'));
  const monitoring = alerts.filter(a => !a.status?.includes('New') && !a.status?.toLowerCase().includes('escalat') && !a.status?.toLowerCase().includes('ready'));

  const renderAlertList = (list) => (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mt-2">
      {list.map(a => {
        const sarDays = null; // loaded in detail view
        return (
          <button key={a.id} onClick={() => setSelectedId(a.id)}
            className="w-full text-left px-4 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold text-gray-600">{a.id}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${a.status?.includes('New Investigation') ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {a.status}
                  </span>
                </div>
                <p className="text-sm text-gray-800 truncate">{a.summary?.slice(0, 65) || a.type || 'TM Alert'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{a.assignedTo || 'Unassigned'}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        );
      })}
    </div>
  );

  if (selectedId) {
    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-gray-50">
        <AlertDetail alertId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Search — PRIMARY */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Search User or Alert</p>
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
            placeholder="User ID, alert ID, or summary..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white"
          />
          <button type="submit" disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#D97706' }}>
            {searchLoading ? '...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Search results */}
      {searchResults !== null && (
        <div className="mb-6">
          {searchResults.length > 0
            ? renderAlertList(searchResults)
            : <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-400">No alerts found for "{searchQuery}"</div>
          }
        </div>
      )}

      {/* Alerts by status — SECONDARY */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Alerts by Status</p>

        <div>
          <StatusGroup icon="🔴" label="Ready to Escalate" dotColor="bg-red-500" count={escalate.length} onClickAll={() => setShowGroup(showGroup === 'escalate' ? null : 'escalate')} />
          {showGroup === 'escalate' && renderAlertList(escalate)}
        </div>

        <div>
          <StatusGroup icon="🟡" label="New Alerts" dotColor="bg-yellow-500" count={newAlerts.length} onClickAll={() => setShowGroup(showGroup === 'new' ? null : 'new')} />
          {showGroup === 'new' && renderAlertList(newAlerts)}
        </div>

        <div>
          <StatusGroup icon="🟢" label="Under Investigation" dotColor="bg-green-500" count={monitoring.length} onClickAll={() => setShowGroup(showGroup === 'monitor' ? null : 'monitor')} />
          {showGroup === 'monitor' && renderAlertList(monitoring)}
        </div>
      </div>
    </div>
  );
}
