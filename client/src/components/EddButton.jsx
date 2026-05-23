// ── EDD Search Button + Modal ─────────────────────────────────────
// Shows up as a side button in KYC, Fraud, TM, Support portals.
// Triggers EDD Bot search, polls progress, shows Drive link + download.
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

const EDD_BOT_URL = import.meta.env.VITE_EDD_BOT_URL || '';
const EDD_API_KEY = import.meta.env.VITE_EDD_API_KEY || 'vigia-edd-2026';

function eddFetch(path, opts = {}) {
  const base = EDD_BOT_URL || window.location.origin; // fallback: same origin proxy
  return fetch(`${base}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-EDD-Key': EDD_API_KEY, ...(opts.headers || {}) },
  }).then(r => r.json());
}

const STATUS_LABELS = {
  queued: 'Queued…',
  running: 'Searching…',
  uploading: 'Uploading to Drive…',
  completed: 'Complete',
  error: 'Error',
};

const STATUS_COLORS = {
  queued: 'text-yellow-400',
  running: 'text-blue-400',
  uploading: 'text-indigo-400',
  completed: 'text-emerald-400',
  error: 'text-red-400',
};

function ProgressBar({ pct }) {
  return (
    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
      <div
        className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export default function EddButton({ subject, caseId, analystId, analystName }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: subject?.firstName || '',
    lastName: subject?.lastName || '',
    country: subject?.country || '',
    alternateNames: '',
    sources: ['Google', 'GoogleNews', 'Facebook', 'LinkedIn', 'Twitter', 'Instagram'],
  });
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  // Update form when subject prop changes
  useEffect(() => {
    if (subject) {
      setForm(f => ({
        ...f,
        firstName: subject.firstName || f.firstName,
        lastName: subject.lastName || f.lastName,
        country: subject.country || f.country,
      }));
    }
  }, [subject?.firstName, subject?.lastName]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling(jid) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const prog = await eddFetch(`/api/edd/progress/${jid}`);
        setProgress(prog);
        if (prog.status === 'completed') {
          stopPolling();
          const res = await eddFetch(`/api/edd/results/${jid}`);
          setResult(res);
        }
        if (prog.status === 'error') {
          stopPolling();
          setError(prog.error || 'Search failed');
        }
      } catch (e) { console.error('[EDD poll]', e); }
    }, 3000);
  }

  async function startSearch() {
    setStarting(true); setError(null); setResult(null); setJobId(null); setProgress(null);
    try {
      const res = await eddFetch('/api/edd/search', {
        method: 'POST',
        body: JSON.stringify({
          subject: {
            firstName: form.firstName,
            lastName: form.lastName,
            country: form.country,
            alternateNames: form.alternateNames ? form.alternateNames.split(',').map(s => s.trim()) : [],
          },
          case_id: caseId || null,
          analyst_id: analystId || 'unknown',
          analyst_name: analystName || 'Analyst',
          sources: form.sources,
        }),
      });
      if (res.error) throw new Error(res.error);
      setJobId(res.job_id);
      setProgress({ status: 'queued', progress: 0 });
      startPolling(res.job_id);
    } catch (e) {
      setError(e.message);
    }
    setStarting(false);
  }

  function toggleSource(src) {
    setForm(f => ({
      ...f,
      sources: f.sources.includes(src) ? f.sources.filter(s => s !== src) : [...f.sources, src],
    }));
  }

  function reset() {
    stopPolling();
    setJobId(null); setProgress(null); setResult(null); setError(null);
  }

  const isRunning = progress && ['queued','running','uploading'].includes(progress.status);
  const SOURCES = ['Google', 'GoogleNews', 'Facebook', 'LinkedIn', 'Twitter', 'Instagram'];

  return (
    <>
      {/* Side button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-indigo-700/50 bg-indigo-900/30 text-indigo-300 hover:bg-indigo-800/40 hover:text-white transition-all"
      >
        🔍 EDD Search
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0d1526] border border-[#1e2d45] rounded-2xl w-full max-w-lg shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2d45]">
              <div>
                <div className="font-bold text-white">🔍 EDD Search & Archive</div>
                <div className="text-xs text-gray-400 mt-0.5">Web search → Full-page PDFs → Google Drive + Jira</div>
              </div>
              <button onClick={() => { setOpen(false); if (!isRunning) reset(); }}
                className="text-gray-500 hover:text-white text-lg">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Subject form */}
              {!jobId && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">First Name *</label>
                      <input value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        className="w-full bg-[#111827] border border-[#1e2d45] rounded-xl px-3 py-2 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Last Name *</label>
                      <input value={form.lastName}
                        onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                        className="w-full bg-[#111827] border border-[#1e2d45] rounded-xl px-3 py-2 text-sm text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Country</label>
                      <input value={form.country}
                        onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                        placeholder="e.g. Argentina"
                        className="w-full bg-[#111827] border border-[#1e2d45] rounded-xl px-3 py-2 text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Alternate Names (comma separated)</label>
                      <input value={form.alternateNames}
                        onChange={e => setForm(f => ({ ...f, alternateNames: e.target.value }))}
                        placeholder="e.g. J. Garcia, Juan M Garcia"
                        className="w-full bg-[#111827] border border-[#1e2d45] rounded-xl px-3 py-2 text-sm text-white" />
                    </div>
                  </div>

                  {/* Sources */}
                  <div>
                    <label className="text-xs text-gray-400 mb-2 block">Sources</label>
                    <div className="flex flex-wrap gap-2">
                      {SOURCES.map(src => (
                        <button key={src} onClick={() => toggleSource(src)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                            form.sources.includes(src)
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-[#111827] border-[#1e2d45] text-gray-400'
                          }`}>
                          {src}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      ⚠️ Social platforms may be blocked — Google + GoogleNews are most reliable
                    </div>
                  </div>

                  {caseId && (
                    <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl px-3 py-2 text-xs text-blue-300">
                      📎 Results will be attached to Jira case <strong>{caseId}</strong> and uploaded to Drive
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-xs text-red-300">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    onClick={startSearch}
                    disabled={starting || !form.firstName || !form.lastName}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors"
                  >
                    {starting ? 'Starting…' : '🔍 Start EDD Search'}
                  </button>
                </>
              )}

              {/* Progress */}
              {jobId && progress && progress.status !== 'completed' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${STATUS_COLORS[progress.status] || 'text-gray-400'}`}>
                      {STATUS_LABELS[progress.status] || progress.status}
                    </span>
                    <span className="text-xs text-gray-500">{progress.progress || 0}%</span>
                  </div>
                  <ProgressBar pct={progress.progress || 0} />
                  {progress.current_source && (
                    <div className="text-xs text-gray-400">
                      Searching <span className="text-white font-medium">{progress.current_source}</span>…
                    </div>
                  )}
                  {progress.status === 'error' && (
                    <div className="bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2 text-xs text-red-300">
                      ⚠️ {progress.error}
                    </div>
                  )}
                </div>
              )}

              {/* Results */}
              {result && result.status === 'completed' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-lg">✅</span>
                    <span className="text-white font-semibold">Search Complete — {result.total_pdfs} PDFs captured</span>
                  </div>

                  {/* Source breakdown */}
                  <div className="space-y-1">
                    {result.source_results && Object.entries(result.source_results).map(([src, r]) => (
                      <div key={src} className="flex items-center gap-2 text-xs">
                        <span>{r.found ? '✅' : r.blocked ? '🚫' : '—'}</span>
                        <span className="text-gray-400 w-24">{src}</span>
                        <span className="text-gray-300">{r.count} PDF{r.count !== 1 ? 's' : ''}</span>
                        {r.blocked && <span className="text-yellow-500">blocked</span>}
                      </div>
                    ))}
                  </div>

                  {/* Drive link */}
                  {result.drive?.folder_url && (
                    <a href={result.drive.folder_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-900/30 border border-emerald-700/40 rounded-xl text-emerald-300 text-sm hover:text-white transition-colors">
                      📁 View in Google Drive →
                      <span className="text-xs text-gray-500 ml-auto">{result.drive.total_pdfs} files</span>
                    </a>
                  )}

                  {/* Jira status */}
                  {result.jira?.ok && (
                    <div className="text-xs text-gray-400">
                      📎 ZIP attached to Jira {result.case_id} ✅
                    </div>
                  )}

                  <button onClick={reset}
                    className="w-full py-2 bg-[#111827] border border-[#1e2d45] text-gray-400 hover:text-white rounded-xl text-sm transition-colors">
                    New Search
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
