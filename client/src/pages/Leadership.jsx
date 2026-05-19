import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import VigiaChat from '../components/VigiaChat.jsx';

function StatCard({ label, value, sub, color = 'gray', loading }) {
  const colors = {
    teal: 'text-[#00C9A7] bg-[#00C9A7]/10',
    red: 'text-red-500 bg-red-50',
    amber: 'text-amber-500 bg-amber-50',
    blue: 'text-blue-500 bg-blue-50',
    gray: 'text-gray-600 bg-gray-100',
  };
  return (
    <div className="stat-card">
      {loading ? (
        <>
          <div className="skeleton h-8 w-20 mb-1" />
          <div className="skeleton h-4 w-28" />
        </>
      ) : (
        <>
          <p className={`text-2xl font-black ${color === 'teal' ? 'text-[#00C9A7]' : color === 'red' ? 'text-red-500' : color === 'amber' ? 'text-amber-500' : 'text-gray-800'}`}>
            {value ?? '—'}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}

function CaseRow({ id, summary, assignee, status, days }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-700">{id}</span>
          <span className={`badge text-[10px] ${status?.includes('escalate') ? 'bg-red-100 text-red-600' : status?.includes('New') ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
            {status}
          </span>
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{summary?.slice(0, 60) || 'No summary'}</p>
        {assignee && <p className="text-[10px] text-gray-400 mt-0.5">{assignee}</p>}
      </div>
      {days != null && <span className="text-[10px] text-gray-400 flex-shrink-0">{days}d</span>}
    </div>
  );
}

export default function Leadership() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tmAlerts, setTmAlerts] = useState([]);
  const [fraudCases, setFraudCases] = useState([]);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    Promise.all([
      api.leadership.stats(),
      api.tm.alerts().catch(() => ({ alerts: [] })),
      api.fraud.cases().catch(() => ({ cases: [] })),
    ]).then(([s, t, f]) => {
      setStats(s);
      setTmAlerts((t.alerts || []).slice(0, 5));
      setFraudCases((f.cases || []).slice(0, 5));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col">
      {showChat ? (
        /* Chat view */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
            <button onClick={() => setShowChat(false)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
            <span className="text-sm font-semibold text-gray-700">VIGÍA Direct Chat</span>
            <div className="w-20" />
          </div>
          <div className="flex-1 min-h-0">
            <VigiaChat />
          </div>
        </div>
      ) : (
        /* Dashboard view */
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Compliance Dashboard</h1>
                <p className="text-gray-500 text-sm mt-0.5">Overview of all open cases and team activity</p>
              </div>
              <button onClick={() => setShowChat(true)} className="btn-teal">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Open Chat with VIGÍA
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatCard label="Open Alerts" value={stats?.openAlerts} color="teal" loading={loading} />
              <StatCard label="Ready to Escalate" value={stats?.highRisk} color="red" loading={loading} />
              <StatCard label="Under Investigation" value={stats?.underInvestigation} color="amber" loading={loading} />
              <StatCard label="New Alerts" value={stats?.statusBreakdown?.['New'] || 0} color="blue" loading={loading} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fraud cases */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">Fraud Cases</h3>
                  <span className="badge-gray">{fraudCases.length} shown</span>
                </div>
                {loading ? (
                  <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
                ) : fraudCases.length ? (
                  fraudCases.map(c => (
                    <CaseRow key={c.id} id={c.id} summary={c.summary} assignee={c.assignee} status={c.status} />
                  ))
                ) : (
                  <p className="text-sm text-gray-400 py-4 text-center">No open fraud cases</p>
                )}
              </div>

              {/* TM alerts */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">TM Alerts</h3>
                  <span className="badge-gray">{tmAlerts.length} shown</span>
                </div>
                {loading ? (
                  <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
                ) : tmAlerts.length ? (
                  tmAlerts.map(a => (
                    <CaseRow key={a.id} id={a.id} summary={a.summary || a.type} assignee={a.assignedTo} status={a.status} />
                  ))
                ) : (
                  <p className="text-sm text-gray-400 py-4 text-center">No open TM alerts</p>
                )}
              </div>

              {/* Status breakdown */}
              {stats?.statusBreakdown && Object.keys(stats.statusBreakdown).length > 0 && (
                <div className="card">
                  <h3 className="font-bold text-gray-800 mb-4">Alert Status Breakdown</h3>
                  <div className="space-y-2">
                    {Object.entries(stats.statusBreakdown).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-600">{status}</span>
                        <span className="text-sm font-bold text-gray-800">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent audit */}
              {stats?.recentLogs?.length > 0 && (
                <div className="card">
                  <h3 className="font-bold text-gray-800 mb-4">Recent Activity</h3>
                  <div className="space-y-0">
                    {stats.recentLogs.slice(0, 8).map(log => (
                      <div key={log.id} className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-gray-500 truncate">{log.action}</p>
                          {log.resource_id && <p className="text-[10px] text-gray-400">{log.resource_id}</p>}
                          <p className="text-[10px] text-gray-300">{log.user_email?.split('@')[0]}</p>
                        </div>
                        {log.decision && (
                          <span className={`text-[10px] font-semibold flex-shrink-0 ${
                            log.decision.includes('SAR') || log.decision.includes('REJECT') ? 'text-red-500' :
                            log.decision.includes('APPROVE') ? 'text-emerald-500' : 'text-amber-500'
                          }`}>{log.decision.replace(/_/g,' ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
