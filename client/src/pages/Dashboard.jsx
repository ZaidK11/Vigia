import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

// ─── Urgency helpers ────────────────────────────────────────────
const URGENCY_BADGE = {
  overdue:   'bg-red-900/40 text-red-400 border border-red-700',
  today:     'bg-orange-900/40 text-orange-400 border border-orange-700',
  red:       'bg-red-900/30 text-red-400',
  yellow:    'bg-amber-900/30 text-amber-400',
  green:     'bg-emerald-900/30 text-emerald-400',
};

const URGENCY_ROW = {
  overdue: 'bg-red-950/30 border-l-2 border-red-600',
  today:   'bg-orange-950/20 border-l-2 border-orange-500',
  red:     'bg-red-950/20 border-l-2 border-red-800',
  yellow:  '',
  green:   '',
};

const TYPE_BADGE = {
  Support:    'bg-blue-900/30 text-blue-300',
  KYC:        'bg-purple-900/30 text-purple-300',
  TM:         'bg-amber-900/30 text-amber-300',
  Fraud:      'bg-red-900/30 text-red-300',
  Escalation: 'bg-red-900/50 text-red-200 font-bold',
};

function daysLabel(daysLeft) {
  if (daysLeft < 0) return { text: 'OVERDUE', cls: 'text-red-400 font-bold' };
  if (daysLeft === 0) return { text: 'TODAY', cls: 'text-orange-400 font-bold' };
  if (daysLeft === 1) return { text: '1d', cls: 'text-orange-300' };
  if (daysLeft <= 3) return { text: `${daysLeft}d`, cls: 'text-amber-400' };
  return { text: `${daysLeft}d`, cls: 'text-gray-400' };
}

// ─── StatCard ───────────────────────────────────────────────────
function DashStat({ label, value, sub, color, loading }) {
  const colors = {
    blue:   'text-blue-400 bg-blue-900/20 border-blue-800',
    orange: 'text-orange-400 bg-orange-900/20 border-orange-800',
    red:    'text-red-400 bg-red-900/20 border-red-800',
    teal:   'text-[#00C9A7] bg-[#00C9A7]/10 border-[#00C9A7]/30',
  };
  const cls = colors[color] || colors.teal;
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${cls}`}>

      {/* Data Health Banner */}
      {!localStorage.getItem('vigia_dh_dismissed') && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px',
          padding: '8px 14px', marginBottom: '12px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', fontSize: '12px'
        }}>
          <span style={{ color: '#166534' }}>
            <strong>Data note:</strong> ~87% of signup data lacks country attribution — market-level metrics are understated. USVA $0 days may indicate rail issues. Canonical MAU uses both sides of completed transactions.
          </span>
          <button onClick={() => { localStorage.setItem('vigia_dh_dismissed','1'); window.location.reload(); }}
            style={{ background:'transparent', border:'none', color:'#16a34a', cursor:'pointer', fontSize:'18px', padding:'0 4px', marginLeft: '8px', flexShrink: 0 }}>×</button>
        </div>
      )}

      {loading ? (
        <div className="skeleton h-8 w-16 rounded" />
      ) : (
        <span className="text-3xl font-black">{value ?? '—'}</span>
      )}
      <span className="text-sm font-medium opacity-80">{label}</span>
      {sub && <span className="text-xs opacity-60">{sub}</span>}
    </div>
  );
}

// ─── Case detail panel ──────────────────────────────────────────
function CaseDetail({ c, onClose }) {
  if (!c) return null;
  const dl = daysLabel(c.daysLeft);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#0D1117] border border-[#1E2533] rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-lg font-bold text-white">{c.id}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[c.type] || 'bg-gray-800 text-gray-400'}`}>{c.type}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCY_BADGE[c.urgency] || ''}`}>{dl.text}</span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{c.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white ml-3 text-xl leading-none">×</button>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div className="bg-[#131920] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Assigned to</p>
            <p className="text-white font-medium">{c.assigned}</p>
          </div>
          <div className="bg-[#131920] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Priority</p>
            <p className={`font-medium capitalize ${c.priority === 'urgent' || c.priority === 'high' ? 'text-red-400' : c.priority === 'medium' ? 'text-amber-400' : 'text-emerald-400'}`}>{c.priority}</p>
          </div>
          <div className="bg-[#131920] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Due date</p>
            <p className={`font-medium ${dl.cls}`}>{new Date(c.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <div className="bg-[#131920] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Status</p>
            <p className="text-white font-medium">{c.status}</p>
          </div>
          <div className="bg-[#131920] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Source</p>
            <p className="text-gray-300 font-medium capitalize">{c.source}</p>
          </div>
          <div className="bg-[#131920] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-0.5">Created</p>
            <p className="text-gray-300 text-xs">{new Date(c.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <a
            href={c.link}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-[#00C9A7]/20 text-[#00C9A7] rounded-lg text-sm font-medium hover:bg-[#00C9A7]/30 transition-colors"
          >
            Open in {c.source === 'freshdesk' ? 'Freshdesk' : 'Jira'} ↗
          </a>
          {c.urgency === 'overdue' || c.urgency === 'red' ? (
            <span className="px-3 py-1.5 bg-red-900/30 text-red-400 rounded-lg text-sm font-medium border border-red-800">
              ⚠️ Needs immediate action
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────
const FILTERS = ['All', 'Support', 'KYC', 'TM', 'Fraud', 'Escalations', 'Overdue', 'Due Today'];

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('All');
  const [sortBy, setSortBy] = useState('due');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/api/dashboard');
      setData(res.cases || []);
      setStats(res.stats || {});
      setLastUpdated(res.stats?.updatedAt ? new Date(res.stats.updatedAt) : new Date());
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000); // auto-refresh 30s
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post('/api/dashboard/refresh', {});
    } catch {}
    await fetchDashboard();
  };

  // Filter
  const filtered = data.filter(c => {
    if (filter === 'All') return true;
    if (filter === 'Escalations') return c.urgency === 'red' || c.urgency === 'overdue' || c.type === 'Escalation';
    if (filter === 'Overdue') return c.daysLeft < 0;
    if (filter === 'Due Today') return c.daysLeft >= 0 && c.daysLeft < 1;
    return c.type.toLowerCase() === filter.toLowerCase();
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortBy === 'due') { av = a.daysLeft; bv = b.daysLeft; }
    else if (sortBy === 'priority') {
      const p = { urgent: 0, high: 1, medium: 2, low: 3 };
      av = p[a.priority] ?? 2; bv = p[b.priority] ?? 2;
    }
    else if (sortBy === 'type') { av = a.type; bv = b.type; }
    else if (sortBy === 'assigned') { av = a.assigned; bv = b.assigned; }
    else if (sortBy === 'id') { av = a.id; bv = b.id; }
    else { av = a.daysLeft; bv = b.daysLeft; }

    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <span className="text-gray-700 ml-1">↕</span>;
    return <span className="text-[#00C9A7] ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            ⚖️ Compliance Dashboard
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            All open cases — Support, KYC, TM, Fraud &amp; Escalations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-600">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 bg-[#131920] border border-[#1E2533] rounded-lg text-sm text-gray-400 hover:text-white hover:border-[#00C9A7] transition-colors disabled:opacity-50"
          >
            {refreshing ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <DashStat label="Open Cases" value={stats?.total} color="blue" loading={loading} />
        <DashStat label="Due Today" value={stats?.dueToday} color="orange" loading={loading}
          sub={stats?.dueToday > 0 ? 'Need action now' : undefined} />
        <DashStat label="Overdue" value={stats?.overdue} color="red" loading={loading}
          sub={stats?.overdue > 0 ? 'Immediate attention' : undefined} />
        <DashStat label="Sources" value={stats ? Object.keys(stats.byType || {}).length : undefined}
          color="teal" loading={loading}
          sub={stats ? Object.entries(stats.byType || {}).map(([k, v]) => `${k}:${v}`).join(' · ') : undefined} />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-[#00C9A7] text-black'
                : 'bg-[#131920] border border-[#1E2533] text-gray-400 hover:text-white hover:border-[#2A3545]'
            }`}
          >
            {f}
            {f !== 'All' && stats?.byType?.[f] ? (
              <span className="ml-1.5 text-xs opacity-70">{stats.byType[f]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-4 text-red-400 text-sm">
          ⚠️ {error} — <button onClick={fetchDashboard} className="underline">retry</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-[#0D1117] border border-[#1E2533] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-600">
            <div className="text-4xl mb-3">⚖️</div>
            <p>Loading cases…</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center text-gray-600">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-white font-medium">No cases in this view</p>
            <p className="text-sm mt-1">
              {filter !== 'All' ? `No ${filter} cases open` : 'Queue is clear'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2533] text-gray-500 text-xs uppercase tracking-wide">
                  {[
                    { key: 'id', label: 'Case ID' },
                    { key: 'type', label: 'Type' },
                    { key: 'assigned', label: 'Assigned' },
                    { key: 'due', label: 'Due Date' },
                    { key: 'due', label: 'Days Left', noSort: true },
                    { key: 'priority', label: 'Priority' },
                  ].map((col, i) => (
                    <th
                      key={`${col.key}-${i}`}
                      className="px-4 py-3 text-left cursor-pointer hover:text-gray-300 select-none whitespace-nowrap"
                      onClick={() => !col.noSort && handleSort(col.key)}
                    >
                      {col.label}{!col.noSort && <SortIcon col={col.key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, idx) => {
                  const dl = daysLabel(c.daysLeft);
                  return (
                    <tr
                      key={`${c.id}-${idx}`}
                      onClick={() => setSelected(c)}
                      className={`border-b border-[#1A2030] cursor-pointer hover:bg-[#131920] transition-colors ${URGENCY_ROW[c.urgency] || ''}`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-white whitespace-nowrap">{c.id}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[c.type] || 'bg-gray-800 text-gray-400'}`}>
                          {c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{c.assigned}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(c.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-xs ${dl.cls}`}>{dl.text}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs capitalize ${
                          c.priority === 'urgent' || c.priority === 'high' ? 'text-red-400' :
                          c.priority === 'medium' ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {c.priority === 'urgent' ? '🔴' : c.priority === 'high' ? '🔴' : c.priority === 'medium' ? '🟡' : '🟢'} {c.priority}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-gray-600 border-t border-[#1A2030]">
              Showing {sorted.length} of {data.length} cases · Auto-refreshes every 30s
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      <CaseDetail c={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
