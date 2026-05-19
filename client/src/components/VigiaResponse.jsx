import React, { useState } from 'react';
import { api } from '../lib/api.js';

const SUPPORTED_LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
];

export default function VigiaResponse({ command, portalType, resourceId, label, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [responses, setResponses] = useState({}); // { en: '...', es: '...' }
  const [activeLang, setActiveLang] = useState('en');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const isSupport = portalType === 'support';

  const analyze = async (lang = 'en') => {
    if (!command) return;
    setLoading(true);
    setError('');
    setActiveLang(lang);
    if (lang === 'en') setDone(false);

    try {
      let full = '';
      for await (const chunk of api.vigia.analyzeStream(
        command,
        portalType,
        resourceId,
        lang === 'en' ? undefined : lang
      )) {
        if (chunk.text) {
          full += chunk.text;
          setResponses(prev => ({ ...prev, [lang]: full }));
        }
        if (chunk.done) {
          setDone(true);
          setHasRun(true);
          if (lang === 'en' && onComplete) onComplete(full);
        }
        if (chunk.error) throw new Error(chunk.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchLang = async (lang) => {
    setActiveLang(lang);
    if (!responses[lang]) {
      // Haven't fetched this language yet — run it
      await analyze(lang);
    }
  };

  const copy = () => {
    const text = responses[activeLang] || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const currentText = responses[activeLang] || '';
  const isLoadingCurrent = loading && activeLang === (Object.keys(responses).length === 0 ? 'en' : activeLang);

  if (!command) return null;

  // ── Not yet run ────────────────────────────────────────────────
  if (!hasRun && !loading) {
    return (
      <button onClick={() => analyze('en')}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ background: '#0066FF' }}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {label || 'Get Analysis from VIGÍA'}
      </button>
    );
  }

  // ── Loading (first run) ─────────────────────────────────────────
  if (loading && !currentText) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-100 bg-blue-50">
        <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
        <span className="text-sm text-blue-700">VIGÍA is analyzing...</span>
      </div>
    );
  }

  // ── Response display ────────────────────────────────────────────
  return (
    <div className="rounded-xl overflow-hidden border border-blue-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#0066FF' }}>
            <span className="text-white text-[10px] font-bold">V</span>
          </div>
          <span className="text-sm font-semibold text-blue-800">VIGÍA Analysis</span>
          {loading && (
            <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          )}
          {done && !loading && (
            <span className="text-xs font-medium text-green-600">Complete</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Language toggle — only show once analysis is done */}
          {done && !loading && (
            <div className="flex items-center gap-0.5 bg-white rounded-lg border border-blue-200 p-0.5">
              {SUPPORTED_LANGS.map(l => (
                <button key={l.code}
                  onClick={() => switchLang(l.code)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                    activeLang === l.code
                      ? 'bg-blue-600 text-white'
                      : 'text-blue-600 hover:bg-blue-50'
                  }`}>
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {done && (
            <button onClick={copy}
              className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-100 transition-all">
              {copied ? '✓' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {/* Response body */}
      <div className="px-4 py-4 bg-blue-50">
        {currentText ? (
          isSupport ? (
            // Support: plain text, larger line height, no pre
            <div className="text-sm text-blue-900 leading-relaxed whitespace-pre-line">
              {currentText}
              {loading && <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />}
            </div>
          ) : (
            // Compliance: pre-formatted, respects markdown whitespace
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-blue-900">
              {currentText}
              {loading && <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />}
            </pre>
          )
        ) : (
          loading && (
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              Translating...
            </div>
          )
        )}
      </div>

      {/* Footer actions */}
      {done && !loading && (
        <div className="px-4 py-2.5 bg-white border-t border-blue-100 flex items-center justify-between">
          <button onClick={() => analyze(activeLang)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ↺ Re-analyze
          </button>
          {isSupport && (
            <span className="text-[10px] text-gray-400">Simplified for support team</span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200">
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={() => analyze(activeLang)}
            className="mt-2 text-xs text-red-500 hover:text-red-700">Retry</button>
        </div>
      )}
    </div>
  );
}
