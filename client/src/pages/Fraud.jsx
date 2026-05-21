import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaResponse from '../components/VigiaResponse.jsx';

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now() - new Date(ts)) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function PriorityBadge({ status, riskFlags, screeningFlags }) {
  const isHigh = riskFlags?.length > 0 || screeningFlags?.includes('Elliptic') || status?.toLowerCase().includes('escalat');
  if (isHigh) return <span className="priority-high">HIGH</span>;
  if (status?.includes('Investigation') || status?.includes('Monitoring')) return <span className="priority-medium">MEDIUM</span>;
  return <span className="priority-low">LOW</span>;
}

function getToken() { return localStorage.getItem('vigia_token'); }
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// ── Build the investigation command ─────────────────────────────
function buildInvestigationCommand(c, panels) {
  const { txnPattern, networkAnalysis, customerContext, regulatory } = panels || {};
  return `Fraud investigation — analyze this case and give a VERDICT.

Case: ${c.id}
User: ${c.userId || 'Unknown'} | Account age: ${customerContext?.accountAge || 'Unknown'}
Status: ${c.status} | Days open: ${regulatory?.daysOpen || 0}

Transaction pattern:
- Total: ${txnPattern?.totalVolume || 'N/A'} across ${txnPattern?.count || 0} transactions
- Avg amount: ${txnPattern?.avgAmount || 'N/A'} | Span: ${txnPattern?.timeSpan || 'N/A'}
- Flags: ${txnPattern?.flags?.join(', ') || 'None'}

Risk signals:
- Risk level: ${networkAnalysis?.riskLevel || 'Unknown'}
- Risk score: ${networkAnalysis?.riskScore || 'N/A'}
- Screening flags: ${networkAnalysis?.screeningFlags?.join(', ') || 'None'}
- Risk flags: ${networkAnalysis?.riskFlags?.join(', ') || 'None'}

SAR threshold: ${regulatory?.sarThreshold || 'Unknown'}
SAR deadline: ${regulatory?.sarDeadlineDays ?? '?'} days remaining

REQUIRED OUTPUT FORMAT:
VERDICT: [FRAUD | NOT_FRAUD | MONITOR]
CONFIDENCE: [HIGH | MEDIUM | LOW] — [percentage, e.g. 87%]
PATTERN TYPE: [structuring | layering | circular flow | mule account | smurfing | none]
SAR: [FILE | DO NOT FILE | PENDING — needs more info]

KEY FINDINGS:
[List 3-5 specific red flags or green flags that drove your verdict]

REASONING:
[2-3 sentences explaining the verdict. Be specific — reference the actual transaction data above.]

NEXT STEP:
[One sentence, one owner, one action]`;
}

// ── Build narrative command (post-verdict) ───────────────────────
function buildNarrativeCommand(c, panels, verdict) {
  const { txnPattern, networkAnalysis, customerContext, regulatory } = panels || {};
  return `Write a fraud investigation narrative for Jira. This is for internal compliance records, not customer communication.

Case: ${c.id} | User: ${c.userId || 'Unknown'}
Verdict: ${verdict || 'FRAUD'} | Account age: ${customerContext?.accountAge || 'Unknown'}

Transaction data:
- ${txnPattern?.count || 0} transactions totaling ${txnPattern?.totalVolume || 'N/A'} over ${txnPattern?.timeSpan || 'N/A'}
- Pattern flags: ${txnPattern?.flags?.join('; ') || 'None'}
- Screening flags: ${networkAnalysis?.screeningFlags?.join('; ') || 'None'}

SAR clock: ${regulatory?.daysOpen || 0} days open | ${regulatory?.sarDeadlineDays ?? '?'} days to deadline
SAR threshold status: ${regulatory?.sarThreshold || 'Unknown'}

Write a professional investigation narrative with these four sections:
1. SUBJECT AND ACTIVITY — who is this, what did they do
2. RED FLAGS — specific patterns that raised suspicion
3. ANALYSIS — why this is (or isn't) suspicious activity
4. RECOMMENDATION — what action to take

Keep it factual, passive voice where possible, BSA-defensible. No customer-facing language. This goes into Jira.`;
}

// ── Build escalation command ─────────────────────────────────────
function buildEscalationCommand(c, panels) {
  const { txnPattern, regulatory } = panels || {};
  return `Escalation recommendation for fraud case ${c.id}.

User: ${c.userId || 'Unknown'} | Days open: ${regulatory?.daysOpen || 0}
Volume: ${txnPattern?.totalVolume || 'N/A'} | Transactions: ${txnPattern?.count || 0}
Flags: ${txnPattern?.flags?.join(', ') || 'None'}

Should this account be:
A) Immediately blocked — account poses ongoing risk
B) Limited — restrict functionality while investigating  
C) Monitored only — keep open, flag all activity
D) Cleared — no further action needed

Provide: Recommended action (A/B/C/D), 2-sentence justification, confidence level, and who should own the next step.`;
}

// ── Case Detail ──────────────────────────────────────────────────
function CaseDetail({ caseId, onClose }) {
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verdict, setVerdict] = useState(null); // FRAUD | NOT_FRAUD | MONITOR
  const [investigationDone, setInvestigationDone] = useState(false);
  const [activeOutput, setActiveOutput] = useState(null); // narrative | escalation | monitoring
  const [outputCommand, setOutputCommand] = useState('');
  const [decisionLogged, setDecisionLogged] = useState(false);

  useEffect(() => {
    setLoading(true);
    setCaseData(null);
    setVerdict(null);
    setInvestigationDone(false);
    setActiveOutput(null);
    setDecisionLogged(false);
    api.fraud.case(caseId)
      .then(setCaseData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  const handleAnalysisComplete = (text) => {
    // Parse verdict from response
    const verdictMatch = text.match(/VERDICT:\s*(FRAUD|NOT_FRAUD|MONITOR)/i);
    if (verdictMatch) {
      setVerdict(verdictMatch[1].toUpperCase());
    }
    setInvestigationDone(true);
  };

  const showOutput = (type) => {
    setActiveOutput(type);
    const c = caseData?.case || {};
    const panels = caseData?.panels || {};
    if (type === 'narrative') setOutputCommand(buildNarrativeCommand(c, panels, verdict));
    if (type === 'escalation') setOutputCommand(buildEscalationCommand(c, panels));
    if (type === 'monitoring') setOutputCommand(`Write monitoring notes for fraud case ${c.id}. User ${c.userId || 'Unknown'} is being monitored. Summarize what behavior to watch for, what thresholds should trigger re-investigation, and what the review cadence should be. Keep it short and actionable for the analyst who will check this case next week.`);
  };

  const logDecision = async (decision) => {
    const c = caseData?.case || {};
    try {
      await fetch('/api/fraud/decision', {
        method: 'POST', headers: authHdr(),
        body: JSON.stringify({ caseId: c.id, decision, notes: `Verdict: ${verdict}` })
      });
      setDecisionLogged(true);
    } catch {}
  };

  if (loading) return (
    <div className="p-6 space-y-3">
      <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
      <div className="h-32 bg-gray-100 rounded animate-pulse" />
      <div className="h-24 bg-gray-100 rounded animate-pulse" />
    </div>
  );

  const c = caseData?.case || {};
  const panels = caseData?.panels || {};
  const { txnPattern, networkAnalysis, regulatory } = panels;

  const investigationCommand = buildInvestigationCommand(c, panels);

  const verdictColor = {
    FRAUD: 'bg-red-100 text-red-700 border-red-200',
    NOT_FRAUD: 'bg-green-100 text-green-700 border-green-200',
    MONITOR: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  }[verdict] || '';

  return (
    <div className="p-5 max-w-2xl">
      {/* Back + header */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm">{c.id}</span>
            <PriorityBadge status={c.status} riskFlags={networkAnalysis?.riskFlags} screeningFlags={networkAnalysis?.screeningFlags} />
            {verdict && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${verdictColor}`}>
                {verdict.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{c.summary?.slice(0, 80)}</p>
        </div>
      </div>

      {/* Case data summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Case Data</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            ['Total Volume', txnPattern?.totalVolume],
            ['Transactions', txnPattern?.count],
            ['Time Span', txnPattern?.timeSpan],
            ['Risk Level', networkAnalysis?.riskLevel?.toUpperCase()],
            ['Days Open', regulatory?.daysOpen],
            ['SAR Deadline', regulatory?.sarDeadlineDays != null ? `${regulatory.sarDeadlineDays}d left` : '—'],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400 uppercase">{label}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{val || '—'}</p>
            </div>
          ))}
        </div>

        {/* Flags */}
        {txnPattern?.flags?.length > 0 && (
          <div className="space-y-1 mb-3">
            {txnPattern.flags.map((f, i) => (
              <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">{f}</p>
            ))}
          </div>
        )}

        {/* Screening / risk flags */}
        {(networkAnalysis?.screeningFlags?.length > 0 || networkAnalysis?.riskFlags?.length > 0) && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-3">
            <p className="text-xs font-semibold text-red-700 mb-1.5">Signal flags</p>
            <div className="flex flex-wrap gap-1.5">
              {[...(networkAnalysis.screeningFlags || []), ...(networkAnalysis.riskFlags || [])].map((f, i) => (
                <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{f}</span>
              ))}
            </div>
          </div>
        )}

        {regulatory?.sarThreshold && regulatory.sarThreshold.includes('⚠️') && (
          <div className="mt-3 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
            <p className="text-xs font-semibold text-orange-700">{regulatory.sarThreshold}</p>
          </div>
        )}

        {c.userId && <p className="text-xs text-gray-400 font-mono mt-3">User ID: {c.userId}</p>}
      </div>

      {/* Investigation — single section */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Investigation</p>
        <VigiaResponse
          command={investigationCommand}
          portalType="fraud"
          resourceId={c.id}
          label="🔎 Get Fraud Overview"
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

          {/* Output buttons — conditional on verdict */}
          <div className="space-y-2 mb-4">
            <button onClick={() => showOutput('narrative')}
              className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'narrative' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div>
                <p className="text-sm font-semibold text-gray-800">📝 Get Investigation Narrative</p>
                <p className="text-xs text-gray-500">Generate text to copy into Jira — all verdicts</p>
              </div>
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {verdict === 'FRAUD' && (
              <button onClick={() => showOutput('escalation')}
                className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'escalation' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div>
                  <p className="text-sm font-semibold text-gray-800">🚨 Get Escalation Recommendation</p>
                  <p className="text-xs text-gray-500">Block / Limit / Monitor — with justification</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {verdict === 'MONITOR' && (
              <button onClick={() => showOutput('monitoring')}
                className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all ${activeOutput === 'monitoring' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div>
                  <p className="text-sm font-semibold text-gray-800">👁️ Get Monitoring Notes</p>
                  <p className="text-xs text-gray-500">What to watch, thresholds, review cadence</p>
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
                portalType="fraud"
                resourceId={`${c.id}-${activeOutput}`}
                label={activeOutput === 'narrative' ? '📝 Generate Narrative' : activeOutput === 'escalation' ? '🚨 Generate Escalation Rec' : '👁️ Generate Monitoring Notes'}
              />
              <p className="text-xs text-gray-400 mt-2 text-center">
                ↑ Copy this text and paste into Jira manually
              </p>
            </div>
          )}

          {/* Action buttons — conditional on verdict */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Log Action</p>

            {verdict === 'FRAUD' && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => logDecision('FILE_SAR')} disabled={decisionLogged}
                  title="Log that SAR should be filed — agent pastes narrative into Jira and submits to compliance"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-50">
                  File SAR
                </button>
                <button onClick={() => logDecision('BLOCK_ACCOUNT')} disabled={decisionLogged}
                  title="Log account block recommendation — compliance will execute"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all disabled:opacity-50">
                  Block Account
                </button>
                <button onClick={() => logDecision('MONITOR')} disabled={decisionLogged}
                  title="Log that account should be monitored before further action"
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
                  Monitor
                </button>
              </div>
            )}

            {verdict === 'NOT_FRAUD' && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => logDecision('CLOSE_CASE')} disabled={decisionLogged}
                  title="Log case closure — no fraudulent activity found"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all disabled:opacity-50">
                  Close Case
                </button>
                <button onClick={() => logDecision('MONITOR')} disabled={decisionLogged}
                  title="Keep monitoring even though verdict is not fraud"
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
                  Monitor Anyway
                </button>
              </div>
            )}

            {verdict === 'MONITOR' && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => logDecision('MONITOR')} disabled={decisionLogged}
                  title="Log monitoring action — case stays open for review"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white transition-all disabled:opacity-50">
                  Monitor
                </button>
                <button onClick={() => logDecision('REQUEST_INFO')} disabled={decisionLogged}
                  title="Log that more information is needed before a decision"
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
                  Request Info
                </button>
                <button onClick={() => logDecision('FILE_SAR')} disabled={decisionLogged}
                  title="Upgrade to SAR filing if monitoring reveals confirmed fraud"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-all disabled:opacity-50">
                  Escalate to SAR
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

// ── Status Group ─────────────────────────────────────────────────
function StatusGroup({ label, dotColor, cases, onSelect, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
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
      {open && (
        <div className="border-t border-gray-100">
          {cases.length === 0 && (
            <div className="py-4 text-center text-sm text-gray-400">No cases in this group</div>
          )}
          {cases.map(c => (
            <button key={c.id} onClick={() => onSelect(c.id)}
              className="w-full text-left px-5 py-3.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-gray-600">{c.id}</span>
                    <PriorityBadge status={c.status} riskFlags={c.riskFlags} screeningFlags={c.screeningFlags} />
                  </div>
                  <p className="text-sm text-gray-800 truncate">{c.summary?.slice(0, 70) || 'No summary'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.assignee || 'Unassigned'} · {timeAgo(c.created)}</p>
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
  );
}


// -- UserInvestigatePanel --
function UserInvestigatePanel() {
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [command, setCommand] = React.useState('');
  const [userData, setUserData] = React.useState(null);

  const doInvestigate = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setCommand('');
    setUserData(null);
    try {
      const r = await fetch('/api/support/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('vigia_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      });
      const d = await r.json();
      setUserData(d);
      const user = d.user || {};
      const risk = d.risk || {};
      const txns = d.transactions || [];
      const age = user.registered_at ? Math.floor((Date.now() - new Date(user.registered_at)) / 86400000) : null;
      const total = txns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
      const txnLines = txns.slice(0, 5).map(t => `- ${t.operation_type || 'txn'}: $${t.amount} (${(t.created_at || '').slice(0,10)})`).join('\n');
      setCommand(`Full fraud investigation - user account review.
USER: ${user.email || query} (${user.first_name || ''} ${user.last_name || ''})
Account age: ${age != null ? age + ' days' : 'Unknown'} | Status: ${user.status || 'Unknown'}
KYC: Tier ${user.tier_level != null ? user.tier_level : '?'} | ID verified: ${user.document_verified ? 'Yes' : 'No'} | Watchlist: ${user.watchlist_verified ? 'Clear' : 'Pending'}
Platform risk: ${risk.risk_level || 'Unknown'} (score: ${risk.score != null ? risk.score : '?'})
TRANSACTIONS (last 30 days):
- Count: ${txns.length} | Total: $${total.toFixed(2)}
${txnLines}

Analyze from a fraud perspective. Consider: account age, KYC gaps, transaction patterns, risk score.

REQUIRED OUTPUT:
VERDICT: [FRAUD_RISK / MONITOR / CLEAR]
CONFIDENCE: [0-100]%
KEY SIGNALS: [specific red flags or green flags from the data above]
PATTERN: [structuring / mule / velocity / account-takeover / none — based on actual data]
REASONING: [2-3 sentences citing specific data points]
NEXT STEP: [one action, one owner]`);
    } catch (err) { setUserData({ error: err.message }); }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5 mb-5">
      <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">Investigate User</p>
      <p className="text-xs text-gray-600 mb-3">Enter any user email or account ID for a full fraud overview and verdict</p>
      <form onSubmit={doInvestigate} className="flex gap-2 mb-3">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="user@email.com or account UUID..."
          className="flex-1 px-4 py-2.5 rounded-xl border-2 border-red-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
        <button type="submit" disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: '#DC2626' }}>
          {loading ? '...' : 'Investigate'}
        </button>
      </form>
      {userData && !userData.error && userData.user && !userData.user.note && (
        <div className="rounded-xl bg-white border border-red-100 p-3 mb-3 grid grid-cols-3 gap-3">
          {[
            ['Age', userData.user.registered_at ? Math.floor((Date.now()-new Date(userData.user.registered_at))/86400000)+'d' : '—'],
            ['Risk', userData.risk?.risk_level || '—'],
            ['Status', userData.user.status || '—'],
            ['ID', userData.user.document_verified ? 'Verified' : 'Not verified'],
            ['Watchlist', userData.user.watchlist_verified ? 'Clear' : 'Pending'],
            ['30d txns', (userData.transactions || []).length],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-[10px] text-gray-400 uppercase">{l}</p>
              <p className="text-xs font-medium text-gray-800">{v}</p>
            </div>
          ))}
        </div>
      )}
      {command && (
        <VigiaResponse command={command} portalType="fraud"
          resourceId="user-investigate"
          label="Get Full Fraud Overview and Verdict" />
      )}
      {userData?.error && <p className="text-sm text-red-600 mt-2">{userData.error}</p>}
      {userData?.user?.note && <p className="text-sm text-amber-700 mt-2 bg-amber-50 rounded p-2">{userData.user.note}</p>}
    </div>
  );
}

// -- PatternCatcher --
function PatternCatcher() {
  const [patterns, setPatterns] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [lastRun, setLastRun] = React.useState(null);
  const [open, setOpen] = React.useState(false);

  const runAnalysis = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/fraud/patterns', {
        headers: { Authorization: `Bearer ${localStorage.getItem('vigia_token')}` }
      });
      const d = await r.json();
      setPatterns(d);
      setLastRun(new Date().toLocaleTimeString());
    } catch (err) { setPatterns({ error: err.message }); }
    setLoading(false);
  }, []);

  useEffect(() => {
    runAnalysis();
    const iv = setInterval(runAnalysis, 3600000);
    return () => clearInterval(iv);
  }, [runAnalysis]);

  const signals = (patterns?.signals) || [];
  const urgentCount = signals.filter(s => s.severity === 'HIGH').length;

  return (
    <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden mb-5">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-xl">📡</span>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">
              Fraud Pattern Signals
              {urgentCount > 0 && (
                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{urgentCount} HIGH</span>
              )}
              {loading && <span className="ml-2 text-xs text-gray-400">scanning...</span>}
            </p>
            <p className="text-[10px] text-gray-400">
              Elliptic · Kount · ClickHouse · {lastRun ? `Updated ${lastRun}` : 'Loading...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); runAnalysis(); }}
            className="text-xs text-amber-600 hover:text-amber-800 font-medium">Refresh</button>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="border-t border-amber-100 p-4">
          {loading && !patterns && (
            <div className="space-y-2">
              {Array(3).fill(0).map((_, i) => <div key={i} className="h-12 bg-amber-50 rounded animate-pulse" />)}
            </div>
          )}
          {patterns?.error && <p className="text-sm text-red-500 p-2">{patterns.error}</p>}
          {signals.length > 0 && (
            <div className="space-y-2">
              {signals.map((s, i) => (
                <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${
                  s.severity === 'HIGH' ? 'border-red-200 bg-red-50' :
                  s.severity === 'MEDIUM' ? 'border-amber-200 bg-amber-50' :
                  'border-gray-200 bg-gray-50'}`}>
                  <span className="text-lg flex-shrink-0 mt-0.5">
                    {s.severity === 'HIGH' ? '🚨' : s.severity === 'MEDIUM' ? '⚠️' : '📊'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{s.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] font-bold text-gray-500">{s.count} accounts</span>
                      <span className="text-[10px] text-gray-400">{s.source}</span>
                      {s.trend && <span className="text-[10px] font-medium text-red-600">{s.trend}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {signals.length === 0 && !loading && !patterns?.error && (
            <p className="text-sm text-gray-400 text-center py-4">No unusual patterns detected in current data</p>
          )}
          <p className="text-[10px] text-gray-400 mt-3 text-center">
            Signals are informational — not auto-filed as cases. Fraud team reviews and acts.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Fraud Component ─────────────────────────────────────────
export default function Fraud() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);

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
      const q = searchQuery.toLowerCase();
      const matched = cases.filter(c =>
        c.id?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q) ||
        c.userId?.toLowerCase().includes(q)
      );
      setSearchResults(matched);
    } catch {}
    setSearchLoading(false);
  };

  // Group cases by status priority
  const escalate = cases.filter(c => c.status?.toLowerCase().includes('escalat') || c.status?.toLowerCase().includes('ready'));
  const active = cases.filter(c => !c.status?.toLowerCase().includes('escalat') && !c.status?.toLowerCase().includes('ready') && (c.riskFlags?.length > 0 || c.screeningFlags?.length > 0 || c.status?.includes('New')));
  const monitoring = cases.filter(c => c.status?.toLowerCase().includes('monitor') || c.status?.toLowerCase().includes('limited'));
  const rest = cases.filter(c => !escalate.includes(c) && !active.includes(c) && !monitoring.includes(c));

  if (selectedId) {
    return (
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-gray-50">
        <CaseDetail caseId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Investigate User — PRIMARY */}
      <UserInvestigatePanel />

      {/* Pattern Catcher */}
      <PatternCatcher />

      {/* Search Cases — SECONDARY */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Search User or Case</p>
        <form onSubmit={doSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
            placeholder="User email, account ID, or case ID (e.g. AR-12345)..."
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-red-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
          />
          <button type="submit" disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#DC2626' }}>
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
              {searchResults.map(c => (
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
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
              No cases found for "{searchQuery}"
            </div>
          )}
        </div>
      )}

      {/* Cases by status — SECONDARY */}
      {loading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cases by Status</p>
          <p className="text-[10px] text-gray-400 mb-2">Click a group to expand → click a case to investigate</p>
          <StatusGroup label="🔴 Ready to Escalate" dotColor="bg-red-500" cases={escalate} onSelect={setSelectedId} defaultOpen={escalate.length > 0} />
          <StatusGroup label="🟡 Under Investigation" dotColor="bg-yellow-500" cases={active} onSelect={setSelectedId} defaultOpen={escalate.length === 0 && active.length > 0} />
          <StatusGroup label="👁️ Monitoring" dotColor="bg-blue-400" cases={monitoring} onSelect={setSelectedId} />
          {rest.length > 0 && (
            <StatusGroup label="📋 Other Open Cases" dotColor="bg-gray-400" cases={rest} onSelect={setSelectedId} />
          )}
        </div>
      )}
    </div>
  );
}
