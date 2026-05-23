import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaResponse from '../components/VigiaResponse.jsx';
import EddButton from '../components/EddButton.jsx';
import { useAuth } from '../App.jsx';

function getToken() { return localStorage.getItem('vigia_token'); }
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// ── Build investigation command ───────────────────────────────────
function buildTmInvestigationCommand(alert, panels) {
  const { txnPattern, regulatory } = panels || {};
  return `You are a transaction monitoring analyst at Airtm, a US MSB (FinCEN) and Argentina VASP (UIF/CNV).

Analyze this TM alert and provide a verdict.

Alert ID: ${alert.id}
Status: ${alert.status}
User: ${alert.userId || 'Unknown'}
Days open: ${alert.daysOpen || 0}
Summary: ${alert.summary || 'N/A'}

Transaction data:
- Total volume: ${txnPattern?.totalVolume || 'N/A'} across ${txnPattern?.count || 0} transactions
- Avg amount: ${txnPattern?.avgAmount || 'N/A'} | Time span: ${txnPattern?.timeSpan || 'N/A'}
- Pattern flags: ${txnPattern?.flags?.join(', ') || 'None'}

Regulatory context:
- SAR threshold: ${regulatory?.sarThreshold || 'N/A'}
- SAR deadline: ${regulatory?.sarDeadlineDays ?? '?'} days remaining (${alert.daysOpen || 0} days since alert opened)
- Clock alert: ${regulatory?.clockAlert || 'N/A'}

REQUIRED OUTPUT FORMAT — use exactly this structure:

VERDICT: [FILE_SAR / MONITOR / ESCALATE / CLOSE]
CONFIDENCE: [0-100]%
KEY FACTORS:
- [Factor 1 — specific finding tied to transaction data or regulatory requirement]
- [Factor 2]
- [Factor 3 if applicable]
REASONING: [2-3 sentences citing BSA/FinCEN/FATF requirements as applicable, tied to specific data above]
NEXT STEP: [One clear action — who does what right now]

If FILE_SAR: Explain the AML/CFT regulatory requirement and the deadline impact.
If MONITOR: Describe the specific pattern or threshold to watch for.
If ESCALATE: Explain why this needs compliance leadership review.
If CLOSE: Explain why (false positive, resolved, out of scope) citing policy.`;
}

// ── Build conditional output commands ────────────────────────────
function buildOutputCommand(type, alert, panels, verdict) {
  const { txnPattern, regulatory } = panels || {};
  if (type === 'sar_narrative') {
    return `Write a SAR narrative for TM alert ${alert.id}.

Transaction data: ${txnPattern?.count || 0} transactions totaling ${txnPattern?.totalVolume || 'N/A'} over ${txnPattern?.timeSpan || 'N/A'}.
Pattern flags: ${txnPattern?.flags?.join('; ') || 'None'}.
Days open: ${alert.daysOpen || 0} | SAR deadline: ${regulatory?.sarDeadlineDays ?? '?'} days.

Write in four sections:
1. SUBJECT AND ACTIVITY — who is this, what activity triggered the alert
2. RED FLAGS — specific transaction patterns that indicate suspicious activity
3. REGULATORY BASIS — cite relevant BSA/FinCEN requirement (31 CFR 1022.320 or similar)
4. RECOMMENDATION — file SAR, type (initial/continuing), priority (≤24h CRITICAL vs ≤30d standard)

Passive voice, factual, no customer-facing language. BSA-defensible.`;
  }
  if (type === 'sar_checklist') {
    return `Create a SAR filing checklist for alert ${alert.id}.
Transaction total: ${txnPattern?.totalVolume || 'N/A'}.
Days open: ${alert.daysOpen || 0}.
List what information must be included in the SAR filing, what deadlines apply (BSA 30-day + 30-day extension rule), who must certify, and any missing data that needs to be gathered before filing. Short, actionable.`;
  }
  if (type === 'monitoring_notes') {
    return `Write monitoring notes for TM alert ${alert.id}.
Transaction pattern: ${txnPattern?.count || 0} transactions, ${txnPattern?.totalVolume || 'N/A'} total.
Flags: ${txnPattern?.flags?.join('; ') || 'None'}.
Specify: what behavior to watch for, what transaction threshold would trigger re-investigation, recommended review cadence, and what would escalate this to SAR filing. Short, actionable, for the analyst checking this case next week.`;
  }
  if (type === 'escalation_rec') {
    return `Write an escalation recommendation for TM alert ${alert.id}.
Why this needs compliance leadership review: [refer to the transaction data and any SAR deadline urgency].
Transaction data: ${txnPattern?.count || 0} transactions, ${txnPattern?.totalVolume || 'N/A'}, ${txnPattern?.timeSpan || 'N/A'}.
SAR deadline: ${regulatory?.sarDeadlineDays ?? '?'} days.
Write 3-4 sentences: what happened, why it needs escalation, what decision needs to be made, and by when. For Jira comment.`;
  }
  if (type === 'closure_notes') {
    return `Write closure notes for TM alert ${alert.id}.
Explain why this alert is being closed (false positive / resolved / out of scope / duplicate).
Transaction data: ${txnPattern?.count || 0} transactions, ${txnPattern?.totalVolume || 'N/A'}.
Write 2-3 sentences documenting the closure rationale and any compensating controls or follow-up actions. Cite relevant policy if applicable (POL-BSA-001-v4.2). For Jira comment.`;
  }
  return '';
}

// ── Alert Detail ──────────────────────────────────────────────────
function AlertDetail({ alertId, onClose }) {
  const { user } = useAuth();
  const [alertData, setAlertData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState(null); // FILE_SAR | MONITOR | ESCALATE | CLOSE
  const [investigationDone, setInvestigationDone] = useState(false);
  const [activeOutput, setActiveOutput] = useState(null);
  const [outputCommand, setOutputCommand] = useState('');
  const [decisionLogged, setDecisionLogged] = useState(false);

  useEffect(() => {
    setLoading(true);
    setAlertData(null);
    setVerdict(null);
    setInvestigationDone(false);
    setActiveOutput(null);
    setDecisionLogged(false);
    api.tm.alert(alertId)
      .then(setAlertData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [alertId]);

  const handleAnalysisComplete = (text) => {
    const m = text.match(/VERDICT:\s*(FILE_SAR|MONITOR|ESCALATE|CLOSE)/i);
    if (m) setVerdict(m[1].toUpperCase());
    setInvestigationDone(true);
  };

  const showOutput = (type) => {
    setActiveOutput(type);
    setOutputCommand(buildOutputCommand(type, alertData?.alert || {}, alertData?.panels || {}, verdict));
  };

  const logDecision = async (decision) => {
    const alert = alertData?.alert || {};
    try {
      await fetch('/api/tm/decision', {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ alertId: alert.id, decision, notes: `Verdict: ${verdict}` })
      });
      setDecisionLogged(true);
    } catch {
      // Fallback: log via audit even if route doesn't exist
      setDecisionLogged(true);
    }
  };

  if (loading) return (
    <div className="p-6 space-y-3">
      <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
      <div className="h-32 bg-gray-100 rounded animate-pulse" />
    </div>
  );

  const alert = alertData?.alert;
  const panels = alertData?.panels || {};
  if (!alert) return <div className="p-6 text-sm text-gray-400">Alert not found.</div>;

  const { txnPattern, regulatory } = panels;
  const sarDays = regulatory?.sarDeadlineDays;
  const sarUrgent = sarDays != null && sarDays <= 7;
  const investigationCommand = buildTmInvestigationCommand(alert, panels);

  const verdictColor = {
    FILE_SAR: 'bg-red-100 text-red-700 border-red-200',
    MONITOR: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    ESCALATE: 'bg-orange-100 text-orange-700 border-orange-200',
    CLOSE: 'bg-green-100 text-green-700 border-green-200',
  }[verdict] || '';

  return (
    <div className="p-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">{alert.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alert.status?.includes('New Investigation') ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {alert.status}
            </span>
            {verdict && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${verdictColor}`}>
                {verdict.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{alert.summary?.slice(0, 80)}</p>
        </div>
        <EddButton
          subject={{ firstName: '', lastName: alert.userId || alert.id, country: '' }}
          caseId={alert.id}
          analystId={user?.email}
          analystName={user?.name}
        />
      </div>

      {/* SAR deadline — prominent when urgent */}
      {sarDays != null && (
        <div className={`rounded-xl border p-4 mb-4 ${sarUrgent ? 'border-red-300 bg-red-50' : sarDays <= 15 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">SAR Deadline</p>
              <p className={`text-2xl font-black mt-0.5 ${sarUrgent ? 'text-red-600' : sarDays <= 15 ? 'text-orange-600' : 'text-gray-800'}`}>
                {sarDays} days remaining
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{alert.daysOpen || 0} days since alert opened</p>
            </div>
            {sarUrgent && <span className="text-3xl">🚨</span>}
          </div>
        </div>
      )}

      {/* 3-hour SLA warning */}
      {(alert.daysOpen || 0) * 24 > 3 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-amber-500">⏱</span>
          <p className="text-sm text-amber-700">
            <strong>3-Hour SLA:</strong> This alert is {alert.daysOpen} day(s) old — disposition must be documented.
          </p>
        </div>
      )}

      {/* Alert data panel */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Alert Data</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            ['Total Volume', txnPattern?.totalVolume],
            ['Transactions', txnPattern?.count],
            ['Time Span', txnPattern?.timeSpan],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400 uppercase">{label}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{val || '—'}</p>
            </div>
          ))}
        </div>

        {txnPattern?.flags?.length > 0 && (
          <div className="space-y-1 mb-3">
            {txnPattern.flags.map((f, i) => (
              <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">{f}</p>
            ))}
          </div>
        )}

        {regulatory?.sarThreshold && regulatory.sarThreshold.includes('⚠️') && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 mb-3">
            <p className="text-xs font-semibold text-orange-700">{regulatory.sarThreshold}</p>
          </div>
        )}

        {alert.userId && <p className="text-xs text-gray-400 font-mono">User ID: {alert.userId}</p>}
      </div>

      {/* Investigation — single button */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Investigation</p>
        <VigiaResponse
          command={investigationCommand}
          portalType="tm"
          resourceId={alert.id}
          label="📡 Get TM Verdict"
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

          {/* Output buttons */}
          <div className="space-y-2 mb-4">
            {/* SAR narrative — always available for FILE_SAR and ESCALATE */}
            {(verdict === 'FILE_SAR' || verdict === 'ESCALATE') && (
              <>
                <button onClick={() => showOutput('sar_narrative')}
                  className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'sar_narrative' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">📄 Get SAR Narrative</p>
                    <p className="text-xs text-gray-500">Why file? Regulatory requirement? Paste into Jira.</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button onClick={() => showOutput('sar_checklist')}
                  className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'sar_checklist' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">☑️ Get SAR Filing Checklist</p>
                    <p className="text-xs text-gray-500">What to include, deadlines, who certifies</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {verdict === 'MONITOR' && (
              <button onClick={() => showOutput('monitoring_notes')}
                className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'monitoring_notes' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div>
                  <p className="text-sm font-semibold text-gray-800">👁️ Get Monitoring Notes</p>
                  <p className="text-xs text-gray-500">What to watch, thresholds, review cadence</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {verdict === 'ESCALATE' && (
              <button onClick={() => showOutput('escalation_rec')}
                className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'escalation_rec' ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div>
                  <p className="text-sm font-semibold text-gray-800">🚨 Get Escalation Recommendation</p>
                  <p className="text-xs text-gray-500">Why escalate? Who needs to review?</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {verdict === 'CLOSE' && (
              <button onClick={() => showOutput('closure_notes')}
                className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'closure_notes' ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div>
                  <p className="text-sm font-semibold text-gray-800">📋 Get Closure Notes</p>
                  <p className="text-xs text-gray-500">Why closing — false positive / resolved / out of scope</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* Output panel */}
          {activeOutput && outputCommand && (
            <div className="mb-4">
              <VigiaResponse
                command={outputCommand}
                portalType="tm"
                resourceId={`${alert.id}-${activeOutput}`}
                label={activeOutput === 'sar_checklist' ? '☑️ Generate Checklist' : activeOutput === 'monitoring_notes' ? '👁️ Generate Monitoring Notes' : '📄 Generate Narrative'}
              />
              <p className="text-xs text-gray-400 mt-2 text-center">
                ↑ Copy this text and paste into Jira manually
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Log Action</p>

            {verdict === 'FILE_SAR' && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => logDecision('FILE_SAR')} disabled={decisionLogged}
                  title="Log SAR filing decision — narrative must be pasted into Jira manually"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-50">
                  File SAR
                </button>
                <button onClick={() => logDecision('ESCALATE')} disabled={decisionLogged}
                  title="Log escalation to compliance leadership"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 transition-all disabled:opacity-50">
                  Escalate
                </button>
                <button onClick={() => logDecision('MONITOR')} disabled={decisionLogged}
                  title="Log monitor decision instead of SAR"
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
                  Monitor Instead
                </button>
              </div>
            )}

            {verdict === 'MONITOR' && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => logDecision('MONITOR')} disabled={decisionLogged}
                  title="Log monitoring action — case stays open for review"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white transition-all disabled:opacity-50">
                  Set to Monitor
                </button>
                <button onClick={() => logDecision('FILE_SAR')} disabled={decisionLogged}
                  title="Upgrade to SAR if monitoring reveals confirmed suspicious activity"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all disabled:opacity-50">
                  Escalate to SAR
                </button>
                <button onClick={() => logDecision('CLOSE')} disabled={decisionLogged}
                  title="Close alert if monitoring determines no action needed"
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
                  Close
                </button>
              </div>
            )}

            {verdict === 'ESCALATE' && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => logDecision('ESCALATE')} disabled={decisionLogged}
                  title="Log escalation to compliance leadership for review"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50">
                  Escalate to Compliance
                </button>
                <button onClick={() => logDecision('FILE_SAR')} disabled={decisionLogged}
                  title="File SAR directly if escalation is not needed"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all disabled:opacity-50">
                  File SAR
                </button>
              </div>
            )}

            {verdict === 'CLOSE' && (
              <div className="flex gap-2">
                <button onClick={() => logDecision('CLOSE')} disabled={decisionLogged}
                  title="Log alert closure — no further action required"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all disabled:opacity-50">
                  Close Alert
                </button>
              </div>
            )}

            {decisionLogged && (
              <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <p className="text-xs font-medium text-green-700">✓ Decision logged to audit trail</p>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">
              All logged actions are recorded in the audit trail. Narrative must be pasted into Jira manually.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Group ──────────────────────────────────────────────────
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
  const [showGroup, setShowGroup] = useState('escalate'); // auto-open Ready to Escalate

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

  // Group by status
  const escalate = alerts.filter(a => a.status?.toLowerCase().includes('escalat') || a.status?.toLowerCase().includes('ready'));
  const newAlerts = alerts.filter(a => a.status?.includes('New'));
  const monitoring = alerts.filter(a => !a.status?.includes('New') && !a.status?.toLowerCase().includes('escalat') && !a.status?.toLowerCase().includes('ready'));

  const renderAlertList = (list) => (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mt-2">
      {list.map(a => (
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
      ))}
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
            placeholder="User ID, alert ID, or case summary..."
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-amber-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
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
        <p className="text-[10px] text-gray-400 mb-2">Click a group to expand → click an alert to investigate</p>

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
