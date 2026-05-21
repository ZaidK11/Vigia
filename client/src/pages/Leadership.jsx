import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import CkeChat from '../components/CkeChat.jsx';

function MetricCard({ label, value, sub, color, loading }) {
  const colorMap = {
    blue:   { num: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
    red:    { num: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-100' },
    amber:  { num: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-100' },
    green:  { num: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
    purple: { num: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    gray:   { num: 'text-gray-700',   bg: 'bg-gray-50',   border: 'border-gray-200' },
  };
  const c = colorMap[color] || colorMap.gray;
  return (
    <div className={`rounded-2xl border p-5 ${c.bg} ${c.border}`}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 bg-white bg-opacity-60 rounded animate-pulse w-16" />
          <div className="h-4 bg-white bg-opacity-60 rounded animate-pulse w-24" />
        </div>
      ) : (
        <>
          <p className={`text-3xl font-black ${c.num}`}>{value ?? '—'}</p>
          <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}

function AlertRow({ label, value, urgent }) {
  return (
    <div className={`flex items-center justify-between py-3 border-b border-gray-100 last:border-0 ${urgent ? 'text-red-700' : ''}`}>
      <span className={`text-sm ${urgent ? 'font-semibold text-red-700' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm font-bold ${urgent ? 'text-red-600' : 'text-gray-800'}`}>{value ?? '—'}</span>
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
      setTmAlerts(t.alerts || []);
      setFraudCases(f.cases || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Derived metrics
  const escalationRate = stats?.openAlerts
    ? Math.round((stats.highRisk / stats.openAlerts) * 100)
    : null;

  const sarsDueSoon = tmAlerts.filter(a => {
    const d = a.daysOpen || 0;
    return (90 - d) <= 7; // within 7 days of SAR deadline (BSA 30-day, then 60-day max = ~90 days)
  }).length;

  const kycPending = 0; // placeholder — would come from KYC API if wired

  const statusBreakdown = stats?.statusBreakdown || {};
  const readyToEscalate = statusBreakdown['Ready to escalate'] || 0;
  const newInv = (statusBreakdown['New Investigation'] || 0) + (statusBreakdown['New'] || 0);
  const monitoring = statusBreakdown['Monitoring'] || 0;
  const limited = statusBreakdown['Limited'] || 0;

  if (showChat) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <button onClick={() => setShowChat(false)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Overview
          </button>
          <span className="text-sm font-semibold text-gray-700">VIGÍA — Ask Anything</span>
          <div className="w-24" />
        </div>
        <div className="flex-1 min-h-0">
          <CkeChat />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Compliance Overview</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Risk summary and team performance · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={() => setShowChat(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: '#0066FF' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Ask VIGÍA
          </button>
        </div>

        {/* Key metrics — top row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard label="Open Cases" value={stats?.openAlerts} color="blue"
            sub="All active investigations" loading={loading} />
          <MetricCard label="Ready to Escalate" value={readyToEscalate} color="red"
            sub="Require immediate action" loading={loading} />
          <MetricCard label="Escalation Rate"
            value={escalationRate != null ? `${escalationRate}%` : null} color={escalationRate > 20 ? 'red' : 'green'}
            sub="High risk / total open" loading={loading} />
          <MetricCard label="SARs Due ≤7 Days" value={sarsDueSoon} color={sarsDueSoon > 0 ? 'red' : 'green'}
            sub="Regulatory filing deadline" loading={loading} />
        </div>

        {/* Alerts that need action TODAY */}
        {!loading && (readyToEscalate > 0 || sarsDueSoon > 0) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 mb-6">
            <p className="text-sm font-bold text-red-700 mb-3">🚨 Needs Attention Today</p>
            <div className="space-y-2">
              {readyToEscalate > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <span className="font-bold">{readyToEscalate}</span>
                  <span>case{readyToEscalate !== 1 ? 's' : ''} ready to escalate — review in Fraud / TM portals</span>
                </div>
              )}
              {sarsDueSoon > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <span className="font-bold">{sarsDueSoon}</span>
                  <span>SAR{sarsDueSoon !== 1 ? 's' : ''} due within 7 days — check TM portal immediately</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Risk summary by domain */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Risk Summary by Domain</p>
            {loading ? (
              <div className="space-y-2">{Array(4).fill(0).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : (
              <>
                <AlertRow label="Fraud alerts open" value={fraudCases.length} urgent={fraudCases.length > 20} />
                <AlertRow label="TM alerts open" value={tmAlerts.length} urgent={tmAlerts.length > 50} />
                <AlertRow label="SARs due ≤7 days" value={sarsDueSoon} urgent={sarsDueSoon > 0} />
                <AlertRow label="KYC pending review" value={kycPending || '—'} />
              </>
            )}
          </div>

          {/* Investigation status breakdown */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Investigation Status</p>
            {loading ? (
              <div className="space-y-2">{Array(4).fill(0).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : Object.keys(statusBreakdown).length > 0 ? (
              Object.entries(statusBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <AlertRow key={status} label={status} value={count}
                    urgent={status.toLowerCase().includes('escalat')} />
                ))
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">No data available</p>
            )}
          </div>

        </div>

        {/* Recent audit activity */}
        {stats?.recentLogs?.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Recent Team Activity</p>
            <div className="space-y-0">
              {stats.recentLogs.slice(0, 10).map((log, i) => (
                <div key={log.id || i} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-600 truncate">{log.action?.replace(/_/g, ' ')}</span>
                      {log.decision && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          log.decision?.includes('SAR') || log.decision?.includes('REJECT') ? 'bg-red-50 text-red-600' :
                          log.decision?.includes('APPROVE') ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {log.decision.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    {log.resource_id && <p className="text-[10px] text-gray-400 mt-0.5">{log.resource_id}</p>}
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{log.user_email?.split('@')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick navigation */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Go To</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '📊 Case Queue Dashboard', path: '/dashboard', desc: 'Full case list, filters, actions' },
              { label: '🔍 Fraud Investigation', path: '/fraud', desc: `${fraudCases.length} open cases` },
              { label: '📡 TM Alerts', path: '/tm', desc: `${tmAlerts.length} open alerts` },
              { label: '🪪 KYC Applications', path: '/kyc', desc: 'Pending verifications' },
            ].map(item => (
              <a key={item.path} href={item.path}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
