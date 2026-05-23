import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

// ── Colour helpers ────────────────────────────────────────────────
function slaColor(pct) {
  if (pct == null) return 'text-gray-400';
  if (pct >= 95) return 'text-emerald-400';
  if (pct >= 80) return 'text-yellow-400';
  return 'text-red-400';
}
function slaBg(pct) {
  if (pct == null) return 'bg-gray-800';
  if (pct >= 95) return 'bg-emerald-900/40 border-emerald-700/40';
  if (pct >= 80) return 'bg-yellow-900/40 border-yellow-700/40';
  return 'bg-red-900/40 border-red-700/40';
}
function agePillColor(key) {
  if (key === '0-1d') return 'bg-emerald-900/60 text-emerald-300';
  if (key === '1-3d') return 'bg-yellow-900/60 text-yellow-300';
  if (key === '3-7d') return 'bg-orange-900/60 text-orange-300';
  return 'bg-red-900/60 text-red-300';
}

// ── Stat card ─────────────────────────────────────────────────────
function Stat({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4 flex flex-col gap-1">
      <div className={`text-2xl font-bold ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-gray-400 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Mini bar ──────────────────────────────────────────────────────
function MiniBar({ items, colorFn }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <div className="text-xs text-gray-400 w-28 flex-shrink-0 truncate">{item.label}</div>
          <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${colorFn ? colorFn(item) : 'bg-indigo-500'}`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-300 w-8 text-right">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Trend sparkline (SVG) ─────────────────────────────────────────
function Sparkline({ data, color = '#6366f1' }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 120, h = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-70">
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} />
    </svg>
  );
}

// ── Section heading ───────────────────────────────────────────────
function SectionHead({ title }) {
  return <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 mt-6 first:mt-0">{title}</div>;
}

// ── Date range presets ────────────────────────────────────────────
function dateFrom(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const TODAY = new Date().toISOString().slice(0, 10);

// ── Filter bar ────────────────────────────────────────────────────
function FilterBar({ filters, setFilters, extras = [] }) {
  return (
    <div className="flex flex-wrap gap-2 items-center mb-6">
      {['7', '30', '90'].map(d => (
        <button key={d}
          onClick={() => setFilters(f => ({ ...f, date_from: dateFrom(Number(d)), date_to: TODAY }))}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
            filters.date_from === dateFrom(Number(d))
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-[#111827] border-[#1e2d45] text-gray-400 hover:text-white'
          }`}>Last {d}d</button>
      ))}
      <input type="date" value={filters.date_from}
        onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
        className="bg-[#111827] border border-[#1e2d45] text-gray-300 text-xs rounded-xl px-3 py-1.5" />
      <span className="text-gray-600 text-xs">→</span>
      <input type="date" value={filters.date_to}
        onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
        className="bg-[#111827] border border-[#1e2d45] text-gray-300 text-xs rounded-xl px-3 py-1.5" />
      {extras}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUPPORT TAB
// ────────────────────────────────────────────────────────────────────────────
function SupportDash() {
  const [filters, setFilters] = useState({ date_from: dateFrom(30), date_to: TODAY, compliance_only: 'false' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters).toString();
      const res = await api.get(`/analytics/support/metrics?${params}`);
      setData(res.data);
      setUpdatedAt(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); const t = setInterval(load, 5 * 60000); return () => clearInterval(t); }, [load]);

  const exportCSV = async () => {
    const params = new URLSearchParams(filters).toString();
    window.open(`/api/analytics/support/export/csv?${params}`, '_blank');
  };

  const d = data;
  const statusOrder = ['open','pending','on_hold','resolved','closed'];
  const statusColors = { open:'bg-blue-500', pending:'bg-yellow-500', on_hold:'bg-orange-500', resolved:'bg-emerald-500', closed:'bg-gray-500' };

  return (
    <div>
      <FilterBar filters={filters} setFilters={setFilters} extras={[
        <label key="comp" className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={filters.compliance_only === 'true'}
            onChange={e => setFilters(f => ({ ...f, compliance_only: e.target.checked ? 'true' : 'false' }))}
            className="rounded" />
          Compliance only
        </label>,
        <button key="refresh" onClick={load}
          className="ml-auto px-3 py-1.5 bg-[#111827] border border-[#1e2d45] text-gray-400 hover:text-white text-xs rounded-xl transition-colors">
          {loading ? '↻ Loading…' : '↻ Refresh'}
        </button>,
        <button key="csv" onClick={exportCSV}
          className="px-3 py-1.5 bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 hover:text-white text-xs rounded-xl transition-colors">
          ↓ CSV
        </button>,
      ]} />

      {updatedAt && <div className="text-xs text-gray-600 mb-4">Updated {updatedAt.toLocaleTimeString()}</div>}

      {!d && loading && <div className="text-gray-500 text-sm py-12 text-center">Loading support metrics…</div>}
      {d && <>
        {/* Key stats */}
        <SectionHead title="Overview" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Total Tickets" value={d.total_tickets} />
          <Stat label="SLA %"
            value={d.sla_pct != null ? `${d.sla_pct}%` : '—'}
            sub={`${d.sla_breached || 0} breached / ${d.sla_total || 0} tracked`}
            color={slaColor(d.sla_pct)} />
          <Stat label="Avg First Response" value={d.first_response_avg_min != null ? `${d.first_response_avg_min}m` : '—'} sub="SLA: 30 min" />
          <Stat label="Avg Resolution" value={d.resolution_avg_hr != null ? `${d.resolution_avg_hr}h` : '—'} sub="SLA: 24 hr" />
        </div>

        {/* Status distribution */}
        <SectionHead title="Status Breakdown" />
        <div className="flex flex-wrap gap-2 mb-6">
          {statusOrder.map(s => d.by_status?.[s] != null && (
            <div key={s} className="bg-[#111827] border border-[#1e2d45] rounded-xl px-4 py-2 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColors[s] || 'bg-gray-500'}`} />
              <span className="text-xs text-gray-400 capitalize">{s.replace('_',' ')}</span>
              <span className="text-sm font-semibold text-white">{d.by_status[s]}</span>
            </div>
          ))}
        </div>

        {/* Top categories */}
        {d.top_categories?.length > 0 && <>
          <SectionHead title="Top Issue Categories (by tag)" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4 mb-6">
            <MiniBar items={d.top_categories.map(c => ({ label: c.tag, value: c.count }))} colorFn={() => 'bg-indigo-500'} />
          </div>
        </>}

        {/* Trend */}
        {d.trend?.length > 0 && <>
          <SectionHead title="Volume Trend (30d)" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4 mb-6 overflow-x-auto">
            <div className="flex items-end gap-1 min-w-max">
              {d.trend.map(t => {
                const max = Math.max(...d.trend.map(x => x.total), 1);
                const h = Math.round((t.total / max) * 48) + 4;
                return (
                  <div key={t.date} className="flex flex-col items-center gap-1">
                    <div title={`${t.date}: ${t.total}`} style={{ height: h }}
                      className="w-3 bg-indigo-600 rounded-sm hover:bg-indigo-400 transition-colors" />
                    <div className="text-[9px] text-gray-600 -rotate-45 origin-top-right w-4 overflow-visible whitespace-nowrap">
                      {t.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" /> Total tickets</span>
            </div>
          </div>
        </>}

        {/* Agent performance */}
        {d.by_agent?.length > 0 && <>
          <SectionHead title="Agent Performance" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl overflow-hidden mb-6">
            <table className="w-full text-xs">
              <thead className="bg-[#0d1526]">
                <tr className="text-gray-500">
                  <th className="text-left px-4 py-3">Agent</th>
                  <th className="text-right px-4 py-3">Assigned</th>
                  <th className="text-right px-4 py-3">Avg Response</th>
                  <th className="text-right px-4 py-3">Avg Resolution</th>
                  <th className="text-right px-4 py-3">SLA %</th>
                </tr>
              </thead>
              <tbody>
                {d.by_agent.map((a, i) => (
                  <tr key={a.agent_id} className={`border-t border-[#1e2d45] ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="px-4 py-2.5 text-gray-300 font-medium">{a.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{a.assigned}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{a.avg_response_min != null ? `${a.avg_response_min}m` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{a.avg_resolution_hr != null ? `${a.avg_resolution_hr}h` : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${slaColor(a.sla_pct)}`}>
                      {a.sla_pct != null ? `${a.sla_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
      </>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KYC TAB
// ────────────────────────────────────────────────────────────────────────────
function KycDash() {
  const [filters, setFilters] = useState({ date_from: dateFrom(30), date_to: TODAY });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters).toString();
      const res = await api.get(`/analytics/kyc/metrics?${params}`);
      setData(res.data);
      setUpdatedAt(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); const t = setInterval(load, 5 * 60000); return () => clearInterval(t); }, [load]);

  const exportCSV = () => window.open(`/api/analytics/kyc/export/csv?${new URLSearchParams(filters)}`, '_blank');
  const d = data;

  return (
    <div>
      <FilterBar filters={filters} setFilters={setFilters} extras={[
        <button key="refresh" onClick={load}
          className="ml-auto px-3 py-1.5 bg-[#111827] border border-[#1e2d45] text-gray-400 hover:text-white text-xs rounded-xl transition-colors">
          {loading ? '↻ Loading…' : '↻ Refresh'}
        </button>,
        <button key="csv" onClick={exportCSV}
          className="px-3 py-1.5 bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 hover:text-white text-xs rounded-xl transition-colors">
          ↓ CSV
        </button>,
      ]} />

      {updatedAt && <div className="text-xs text-gray-600 mb-4">Updated {updatedAt.toLocaleTimeString()}</div>}
      {!d && loading && <div className="text-gray-500 text-sm py-12 text-center">Loading KYC metrics…</div>}

      {d && <>
        <SectionHead title="Overview" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Total Cases" value={d.total_cases} />
          <Stat label="Pending" value={d.pending_count}
            color={d.pending_count > 50 ? 'text-yellow-400' : 'text-white'} />
          <Stat label="Approval Rate"
            value={d.approval_rate_pct != null ? `${d.approval_rate_pct}%` : '—'}
            sub={`${d.approved_count || 0} approved / ${d.rejected_count || 0} rejected`}
            color={d.approval_rate_pct != null && (d.approval_rate_pct < 70 || d.approval_rate_pct > 95) ? 'text-red-400' : 'text-emerald-400'} />
          <Stat label="Avg Resolution"
            value={d.avg_resolution_hr != null ? `${d.avg_resolution_hr}h` : '—'}
            sub="SLA: 48 hr"
            color={d.avg_resolution_hr > 48 ? 'text-red-400' : 'text-white'} />
        </div>

        {/* Status breakdown */}
        {d.by_status && Object.keys(d.by_status).length > 0 && <>
          <SectionHead title="Status Breakdown" />
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(d.by_status).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
              <div key={k} className="bg-[#111827] border border-[#1e2d45] rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="text-xs text-gray-400 capitalize">{k.replace(/_/g,' ')}</span>
                <span className="text-sm font-semibold text-white">{v}</span>
              </div>
            ))}
          </div>
        </>}

        {/* Pending by age */}
        {d.pending_by_age && <>
          <SectionHead title="Pending Cases by Age" />
          <div className="grid grid-cols-4 gap-3 mb-6">
            {Object.entries(d.pending_by_age).map(([k, v]) => (
              <div key={k} className={`rounded-xl border px-3 py-3 text-center ${agePillColor(k)} border-transparent`}>
                <div className="text-lg font-bold">{v}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{k}</div>
              </div>
            ))}
          </div>
        </>}

        {/* Country breakdown */}
        {d.by_country && Object.keys(d.by_country).length > 0 && <>
          <SectionHead title="Cases by Country" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4 mb-6">
            <MiniBar items={Object.entries(d.by_country).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({ label: k, value: v }))}
              colorFn={() => 'bg-purple-500'} />
          </div>
        </>}

        {/* Trend */}
        {d.trend?.length > 0 && <>
          <SectionHead title="Volume Trend" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4 mb-6 overflow-x-auto">
            <div className="flex items-end gap-1 min-w-max">
              {d.trend.map(t => {
                const max = Math.max(...d.trend.map(x => x.created), 1);
                const h = Math.round((t.created / max) * 48) + 4;
                const ha = Math.round(((t.approved||0) / max) * 48);
                return (
                  <div key={t.date} className="flex flex-col items-end gap-0 relative" title={`${t.date}: ${t.created} cases, ${t.approved||0} approved`}>
                    <div style={{ height: h - ha }} className="w-3 bg-indigo-800 rounded-t-sm" />
                    <div style={{ height: ha }} className="w-3 bg-purple-500 rounded-b-sm" />
                    <div className="text-[9px] text-gray-600 -rotate-45 origin-top-right w-4 overflow-visible whitespace-nowrap mt-1">
                      {t.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-800 inline-block" /> Total</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Approved</span>
            </div>
          </div>
        </>}

        {/* Doc type */}
        {d.by_doc_type && Object.keys(d.by_doc_type).length > 0 && <>
          <SectionHead title="Document Types" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4 mb-6">
            <MiniBar items={Object.entries(d.by_doc_type).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>({ label: k, value: v }))}
              colorFn={() => 'bg-teal-500'} />
          </div>
        </>}
      </>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TM TAB
// ────────────────────────────────────────────────────────────────────────────
function TmDash() {
  const [filters, setFilters] = useState({ date_from: dateFrom(30), date_to: TODAY });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters).toString();
      const res = await api.get(`/analytics/tm/metrics?${params}`);
      setData(res.data);
      setUpdatedAt(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); const t = setInterval(load, 5 * 60000); return () => clearInterval(t); }, [load]);

  const exportCSV = () => window.open(`/api/analytics/tm/export/csv?${new URLSearchParams(filters)}`, '_blank');
  const d = data;

  return (
    <div>
      <FilterBar filters={filters} setFilters={setFilters} extras={[
        <select key="sla" value={filters.sla_status || 'any'}
          onChange={e => setFilters(f => ({ ...f, sla_status: e.target.value }))}
          className="bg-[#111827] border border-[#1e2d45] text-gray-400 text-xs rounded-xl px-3 py-1.5">
          <option value="any">All SLA</option>
          <option value="on_track">On Track</option>
          <option value="at_risk">At Risk</option>
          <option value="overdue">Overdue</option>
        </select>,
        <button key="refresh" onClick={load}
          className="ml-auto px-3 py-1.5 bg-[#111827] border border-[#1e2d45] text-gray-400 hover:text-white text-xs rounded-xl transition-colors">
          {loading ? '↻ Loading…' : '↻ Refresh'}
        </button>,
        <button key="csv" onClick={exportCSV}
          className="px-3 py-1.5 bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 hover:text-white text-xs rounded-xl transition-colors">
          ↓ CSV
        </button>,
      ]} />

      {updatedAt && <div className="text-xs text-gray-600 mb-4">Updated {updatedAt.toLocaleTimeString()}</div>}
      {!d && loading && <div className="text-gray-500 text-sm py-12 text-center">Loading TM metrics…</div>}

      {d && <>
        <SectionHead title="Overview" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Total Cases" value={d.total_cases} />
          <Stat label="SLA Compliance"
            value={d.sla_pct != null ? `${d.sla_pct}%` : '—'}
            sub={`${d.sla_breached || 0} overdue of ${d.sla_total || 0}`}
            color={slaColor(d.sla_pct)} />
          <Stat label="False Positive Rate"
            value={d.false_positive_pct != null ? `${d.false_positive_pct}%` : '—'}
            sub="Closed as no suspicious activity"
            color={d.false_positive_pct > 90 ? 'text-red-400' : d.false_positive_pct > 70 ? 'text-yellow-400' : 'text-white'} />
          <Stat label="Avg Investigation"
            value={d.avg_investigation_days != null ? `${d.avg_investigation_days}d` : '—'}
            sub="SLA: 30 days" />
        </div>

        {/* Status breakdown */}
        {d.by_status && Object.keys(d.by_status).length > 0 && <>
          <SectionHead title="Status Breakdown" />
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(d.by_status).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
              <div key={k} className="bg-[#111827] border border-[#1e2d45] rounded-xl px-4 py-2 flex items-center gap-2">
                <span className="text-xs text-gray-400 capitalize">{k.replace(/_/g,' ')}</span>
                <span className="text-sm font-semibold text-white">{v}</span>
              </div>
            ))}
          </div>
        </>}

        {/* Rule / false positive table */}
        {d.by_rule?.length > 0 && <>
          <SectionHead title="Alert Rules — False Positive Analysis" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl overflow-hidden mb-6">
            <table className="w-full text-xs">
              <thead className="bg-[#0d1526]">
                <tr className="text-gray-500">
                  <th className="text-left px-4 py-3">Rule / Alert Type</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3">Closed</th>
                  <th className="text-right px-4 py-3">False Pos</th>
                  <th className="text-right px-4 py-3">False Pos %</th>
                </tr>
              </thead>
              <tbody>
                {d.by_rule.slice(0, 15).map((r, i) => (
                  <tr key={r.rule} className={`border-t border-[#1e2d45] ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="px-4 py-2.5 text-gray-300 font-mono">{r.rule}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{r.total}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{r.closed}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{r.false_pos}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${
                      r.false_pos_pct > 90 ? 'text-red-400' : r.false_pos_pct > 70 ? 'text-yellow-400' : 'text-gray-400'
                    }`}>
                      {r.false_pos_pct != null ? `${r.false_pos_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {/* Analyst performance */}
        {d.by_analyst?.length > 0 && <>
          <SectionHead title="Analyst Performance" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl overflow-hidden mb-6">
            <table className="w-full text-xs">
              <thead className="bg-[#0d1526]">
                <tr className="text-gray-500">
                  <th className="text-left px-4 py-3">Analyst</th>
                  <th className="text-right px-4 py-3">Assigned</th>
                  <th className="text-right px-4 py-3">Resolved</th>
                  <th className="text-right px-4 py-3">Avg Days</th>
                  <th className="text-right px-4 py-3">SLA %</th>
                  <th className="text-right px-4 py-3">False Pos</th>
                </tr>
              </thead>
              <tbody>
                {d.by_analyst.map((a, i) => (
                  <tr key={a.analyst} className={`border-t border-[#1e2d45] ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="px-4 py-2.5 text-gray-300 font-medium">{a.analyst || 'Unassigned'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{a.assigned}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{a.resolved}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{a.avg_days != null ? `${a.avg_days}d` : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${slaColor(a.sla_pct)}`}>
                      {a.sla_pct != null ? `${a.sla_pct}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{a.false_pos ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {/* Trend */}
        {d.trend?.length > 0 && <>
          <SectionHead title="Volume Trend" />
          <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4 mb-6 overflow-x-auto">
            <div className="flex items-end gap-1 min-w-max">
              {d.trend.map(t => {
                const max = Math.max(...d.trend.map(x => x.created), 1);
                const h = Math.round((t.created / max) * 48) + 4;
                const hc = Math.round(((t.closed||0) / max) * 48);
                return (
                  <div key={t.date} className="flex flex-col items-end" title={`${t.date}: ${t.created} cases, ${t.closed||0} closed`}>
                    <div style={{ height: h - hc }} className="w-3 bg-amber-800 rounded-t-sm" />
                    <div style={{ height: hc }} className="w-3 bg-emerald-600 rounded-b-sm" />
                    <div className="text-[9px] text-gray-600 -rotate-45 origin-top-right w-4 overflow-visible whitespace-nowrap mt-1">
                      {t.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-800 inline-block" /> Open</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" /> Closed</span>
            </div>
          </div>
        </>}
      </>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN ANALYTICS PAGE
// ────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'support', label: '🎧 Support',  desc: 'SLA, response times, agent performance' },
  { id: 'kyc',     label: '🪪 KYC',      desc: 'Case counts, approval rates, analyst performance' },
  { id: 'tm',      label: '📡 TM',       desc: 'Investigation SLA, false positive rates, rule analysis' },
];

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('support');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">📈 Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">Live compliance metrics for Support, KYC, and TM — updated every 5 minutes.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 bg-[#0d1526] rounded-2xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
              activeTab === t.id
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'support' && <SupportDash />}
        {activeTab === 'kyc'     && <KycDash />}
        {activeTab === 'tm'      && <TmDash />}
      </div>
    </div>
  );
}
