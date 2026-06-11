// ============================================================
// VIGÍA — Alert Triage Queue Component
// Feature: PEP / Watchlist / Adverse Media AI-Assisted Review
// Author: Vigía Agent (Zaid Khan, Jun 2026)
// Portal: KYC tab — for Estefanía and KYC analysts
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

const getToken = () => localStorage.getItem('vigia_token');
const authHdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

const TYPE_LABELS = {
  politically_exposed_person: { short: 'PEP',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  watchlist:                   { short: 'WL',   color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  adverse_media:               { short: 'AM',   color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
};

const DECISION_CONFIG = {
  CLEAR:                { label: 'Clear',               color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅' },
  EDD_REQUIRED:         { label: 'Request EDD',         color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '📋' },
  ESCALATE_TO_BSA_OFFICER: { label: 'Escalate to BSA', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🚨' },
};

// ── Risk badge ──────────────────────────────────────────────────
function RiskBadge({ level }) {
  const cfg = { HIGH: ['#dc2626','#fef2f2'], MEDIUM: ['#d97706','#fffbeb'], LOW: ['#16a34a','#f0fdf4'] };
  const [c, bg] = cfg[level] || ['#6b7280','#f9fafb'];
  return (
    <span style={{ background: bg, color: c, border: `1px solid ${c}33`, borderRadius: 6,
      fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
      {level}
    </span>
  );
}

// ── Alert type chips ────────────────────────────────────────────
function AlertChips({ types }) {
  return (
    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {(types || []).map(t => {
        const cfg = TYPE_LABELS[t] || { short: t.slice(0,3).toUpperCase(), color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
        return (
          <span key={t} style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            borderRadius: 5, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
            {cfg.short}
          </span>
        );
      })}
    </span>
  );
}

// ── VIGÍA streaming analysis box ───────────────────────────────
function TriageAnalysis({ userId, alertDetail, onRecommendation }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [copied, setCopied]   = useState(false);
  const hasRun = useRef(false);

  // Auto-run on mount
  useEffect(() => {
    if (hasRun.current || !alertDetail) return;
    hasRun.current = true;
    run();
  }, [alertDetail]);

  const run = async () => {
    if (!alertDetail) return;
    setLoading(true);
    setText('');
    setDone(false);

    try {
      const res = await fetch('/api/kyc/alert-triage', {
        method:  'POST',
        headers: authHdr(),
        body:    JSON.stringify({
          userId:   alertDetail.userId,
          name:     alertDetail.name,
          email:    alertDetail.email,
          country:  alertDetail.country,
          alerts:   alertDetail.alerts,
          txStats:  alertDetail.txStats
        })
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full   = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.text) { full += d.text; setText(full); }
            if (d.done) {
              setDone(true);
              // Extract recommendation
              const m = full.match(/RECOMMENDATION:\s*(CLEAR|EDD_REQUIRED|ESCALATE_TO_BSA_OFFICER)/i);
              if (m && onRecommendation) onRecommendation(m[1].toUpperCase());
            }
          } catch {}
        }
      }
    } catch (err) {
      setText('Analysis failed — ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  // Format text: bold lines that match key headings
  const formattedLines = text.split('\n').map((line, i) => {
    const isHeading = /^(RISK LEVEL|ALERT SUMMARY|TRANSACTION RISK|COUNTRY RISK|RECOMMENDATION|REASONING|NEXT STEP)/i.test(line.trim());
    return (
      <div key={i} style={{ lineHeight: 1.6 }}>
        {isHeading
          ? <span style={{ fontWeight: 700, color: '#1e40af' }}>{line}</span>
          : <span>{line}</span>}
      </div>
    );
  });

  return (
    <div style={{ borderRadius: 12, border: '1px solid #bfdbfe', overflow: 'hidden', marginTop: 12 }}>
      {/* Header */}
      <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: '#2563eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>V</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>VIGÍA Risk Brief</span>
          {loading && <div style={{ width: 12, height: 12, border: '2px solid #93c5fd',
            borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
          {done && !loading && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Complete</span>}
        </div>
        {done && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={copy} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6,
              border: '1px solid #bfdbfe', background: '#fff', color: '#2563eb', cursor: 'pointer' }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button onClick={run} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6,
              border: '1px solid #bfdbfe', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
              ↺
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ background: '#eff6ff', padding: '12px 14px', fontSize: 13, color: '#1e3a8a', fontFamily: 'ui-monospace, monospace' }}>
        {text ? formattedLines : (
          loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3b82f6' }}>
              <div style={{ width: 14, height: 14, border: '2px solid #93c5fd',
                borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Analyzing alert profile…
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Alert Detail Drawer ─────────────────────────────────────────
function AlertDetailDrawer({ item, onClose, onDecision }) {
  const [detail, setDetail]             = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [recommendation, setRecommendation] = useState(null);
  const [deciding, setDeciding]         = useState(false);
  const [notes, setNotes]               = useState('');
  const [decided, setDecided]           = useState(false);

  useEffect(() => {
    setLoadingDetail(true);
    setDetail(null);
    setRecommendation(null);
    setDecided(false);
    setNotes('');

    fetch(`/api/kyc/alert-detail/${item.user_id}`, { headers: authHdr() })
      .then(r => r.json())
      .then(setDetail)
      .catch(() => setDetail({ userId: item.user_id, name: 'Unknown', alerts: [], txStats: {} }))
      .finally(() => setLoadingDetail(false));
  }, [item.user_id]);

  const submitDecision = async (decision) => {
    setDeciding(true);
    try {
      await fetch('/api/kyc/alert-decision', {
        method: 'POST',
        headers: authHdr(),
        body: JSON.stringify({ userId: item.user_id, decision, notes })
      });
      setDecided(true);
      if (onDecision) onDecision(item.user_id, decision);
    } catch {}
    setDeciding(false);
  };

  const vol  = parseFloat(item.vol_12m_usd || 0);
  const risk = item.riskScore || 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50,
      display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div style={{ width: '100%', maxWidth: 560, height: '100vh', overflowY: 'auto',
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>

        {/* Drawer header */}
        <div style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10,
          borderBottom: '1px solid #e5e7eb', padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                {detail?.name || item.email || item.user_id.slice(0,8) + '…'}
              </span>
              <AlertChips types={item.alert_types} />
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              {item.user_id} · {item.country} · Risk score: {risk}
            </p>
          </div>
          <button onClick={onClose}
            style={{ fontSize: 20, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
            ×
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>

          {/* Account & volume stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              ['12M Volume', `$${vol.toLocaleString('en-US', { maximumFractionDigits: 0 })}`],
              ['12M Txns',   item.trx_count_12m || 0],
              ['Country',    item.country || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px',
                border: '1px solid #e5e7eb' }}>
                <p style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase',
                  letterSpacing: 0.4, marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Alerts list */}
          {detail && detail.alerts?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
                letterSpacing: 0.5, marginBottom: 8 }}>Dodrio Alert Flags</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.alerts.map((a, i) => {
                  const cfg = TYPE_LABELS[a.name] || { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };
                  return (
                    <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`,
                      borderRadius: 8, padding: '8px 12px', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
                          {a.name?.replace(/_/g,' ').toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
                          result: <b>{a.result}</b>
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>
                        {a.created_at?.slice(0,10)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIGÍA AI brief — auto-runs */}
          {!loadingDetail && detail && (
            <TriageAnalysis
              userId={item.user_id}
              alertDetail={detail}
              onRecommendation={setRecommendation}
            />
          )}
          {loadingDetail && (
            <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Loading alert data…
            </div>
          )}

          {/* Decision panel */}
          {!decided && (
            <div style={{ marginTop: 16, borderRadius: 12, border: '1px solid #e5e7eb',
              background: '#fff', padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
                letterSpacing: 0.5, marginBottom: 12 }}>Log Decision</p>

              {recommendation && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8,
                  background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af' }}>
                  💡 VIGÍA recommends: <strong>{recommendation.replace(/_/g,' ')}</strong>
                </div>
              )}

              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes (will be saved to audit trail)…"
                rows={2}
                style={{ width: '100%', resize: 'vertical', borderRadius: 8, border: '1px solid #e5e7eb',
                  padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', marginBottom: 10,
                  outline: 'none', boxSizing: 'border-box' }}
              />

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(DECISION_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => submitDecision(key)}
                    disabled={deciding}
                    style={{
                      flex: 1, minWidth: 120, padding: '9px 14px', borderRadius: 8,
                      border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.color,
                      fontSize: 12, fontWeight: 700, cursor: deciding ? 'wait' : 'pointer',
                      opacity: deciding ? 0.7 : 1, transition: 'all 0.15s'
                    }}>
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Decision confirmed */}
          {decided && (
            <div style={{ marginTop: 16, borderRadius: 12, background: '#f0fdf4',
              border: '1px solid #bbf7d0', padding: '14px 16px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                ✓ Decision logged to audit trail
              </p>
              <p style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
                This alert is now removed from the queue. Move to the next one.
              </p>
              <button onClick={onClose} style={{ marginTop: 10, padding: '7px 14px', borderRadius: 8,
                background: '#16a34a', color: '#fff', border: 'none', fontSize: 12,
                fontWeight: 600, cursor: 'pointer' }}>
                Next Alert →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Queue stats bar ─────────────────────────────────────────────
function QueueStats({ total, triaged, loading }) {
  const pct = total + triaged > 0 ? Math.round((triaged / (total + triaged)) * 100) : 0;
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
      padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
          Alert Queue
        </span>
        {loading
          ? <span style={{ fontSize: 11, color: '#9ca3af' }}>Loading…</span>
          : <span style={{ fontSize: 12, color: '#6b7280' }}>
              <b style={{ color: '#dc2626' }}>{total}</b> pending · {triaged} triaged today
            </span>
        }
      </div>
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: '#16a34a', borderRadius: 3,
          width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
      {!loading && <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{pct}% of total queue cleared</p>}
    </div>
  );
}

// ── Main AlertTriageSection ─────────────────────────────────────
export default function AlertTriageSection() {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [total, setTotal]             = useState(0);
  const [triaged, setTriaged]         = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter]           = useState('all');
  const [sort, setSort]               = useState('risk');
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const PAGE_SIZE = 20;

  const loadQueue = useCallback(async (reset = false) => {
    setLoading(true);
    const p = reset ? 1 : page;
    try {
      const res = await fetch(
        `/api/kyc/alert-queue?page=${p}&limit=${PAGE_SIZE}&filter=${filter}&sort=${sort}`,
        { headers: authHdr() }
      );
      const data = await res.json();
      setTotal(data.total || 0);
      setTriaged(data.triaged || 0);
      if (reset) {
        setItems(data.items || []);
        setPage(1);
      } else {
        setItems(prev => [...prev, ...(data.items || [])]);
      }
      setHasMore((data.items || []).length === PAGE_SIZE);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [filter, sort, page]);

  useEffect(() => { loadQueue(true); }, [filter, sort]);

  const handleDecision = (userId) => {
    setItems(prev => prev.filter(i => i.user_id !== userId));
    setTotal(prev => Math.max(0, prev - 1));
    setTriaged(prev => prev + 1);
    setSelectedItem(null);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>

      {/* Section header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
          🚨 Alert Triage Queue
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          PEP, Watchlist &amp; Adverse Media flags — VIGÍA pre-screens each case so you can decide faster.
        </p>
      </div>

      {/* Stats bar */}
      <QueueStats total={total} triaged={triaged} loading={loading && items.length === 0} />

      {/* Filter + sort bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Filter */}
        <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
          {[
            ['all',                    'All'],
            ['politically_exposed_person', 'PEP'],
            ['watchlist',              'Watchlist'],
            ['adverse_media',          'Adverse Media'],
          ].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{
                padding: '5px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none',
                cursor: 'pointer', transition: 'all 0.15s',
                background: filter === val ? '#fff' : 'transparent',
                color:      filter === val ? '#111827' : '#6b7280',
                boxShadow:  filter === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Sort:</span>
          {[['risk','Risk Score'],['volume','Volume'],['country','Country']].map(([val, label]) => (
            <button key={val} onClick={() => setSort(val)}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none',
                cursor: 'pointer',
                background: sort === val ? '#2563eb' : '#f3f4f6',
                color:      sort === val ? '#fff'    : '#6b7280',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Queue list */}
      {items.length === 0 && !loading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14,
          border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          🎉 No pending alerts in this filter. Estefanía is all caught up!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => {
            const vol    = parseFloat(item.vol_12m_usd || 0);
            const riskLv = item.riskScore > 250 ? 'HIGH' : item.riskScore > 80 ? 'MEDIUM' : 'LOW';

            return (
              <button key={item.user_id}
                onClick={() => setSelectedItem(item)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                  padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <AlertChips types={item.alert_types} />
                      <RiskBadge level={riskLv} />
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{item.country}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#374151', fontFamily: 'ui-monospace, monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {item.user_id}
                    </p>
                    <p style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.email}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: vol > 10000 ? '#dc2626' : '#111827' }}>
                      ${vol.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                    <p style={{ fontSize: 10, color: '#9ca3af' }}>{item.trx_count_12m || 0} txns / yr</p>
                  </div>

                  <svg style={{ width: 16, height: 16, color: '#d1d5db', flexShrink: 0 }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <button onClick={() => { setPage(p => p + 1); loadQueue(false); }}
              disabled={loading}
              style={{ padding: '10px', borderRadius: 10, border: '1px solid #e5e7eb',
                background: '#f9fafb', color: '#6b7280', fontSize: 12, cursor: 'pointer',
                fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Loading…' : 'Load more alerts'}
            </button>
          )}
        </div>
      )}

      {/* Drawer */}
      {selectedItem && (
        <AlertDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDecision={handleDecision}
        />
      )}

      {/* CSS for spinner */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
