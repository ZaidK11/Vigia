import React, { useState } from 'react';
import { api } from '../lib/api.js';

export default function VigiaResponse({ command, portalType, resourceId, label, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const analyze = async () => {
    if (!command) return;
    setLoading(true);
    setText('');
    setDone(false);
    setError('');

    try {
      let full = '';
      for await (const chunk of api.vigia.analyzeStream(command, portalType, resourceId)) {
        if (chunk.text) { full += chunk.text; setText(full); }
        if (chunk.done) { setDone(true); if (onComplete) onComplete(full); }
        if (chunk.error) throw new Error(chunk.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!command) return null;

  return (
    <div className="mt-4">
      {!loading && !text && !error && (
        <button onClick={analyze} className="btn-primary w-full justify-center py-2.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          {label || 'Get Analysis from VIGÍA'}
        </button>
      )}

      {loading && !text && (
        <div className="card flex items-center gap-3 py-4 border-[#00C9A7]/30">
          <div className="w-4 h-4 border-2 border-[#00C9A7]/30 border-t-[#00C9A7] rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-gray-600">VIGÍA is analyzing...</span>
        </div>
      )}

      {(text || (loading && text)) && (
        <div style={{background:'#F0F7FF', borderLeft:'4px solid #0066FF', borderRadius:'12px', overflow:'hidden'}}>
          <div className="flex items-center justify-between px-4 py-3" style={{background:'#EFF6FF', borderBottom:'1px solid #BFDBFE'}}>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded flex items-center justify-center" style={{background:'#0066FF'}}>
                <span className="text-white text-[10px] font-bold">V</span>
              </div>
              <span className="text-sm font-semibold" style={{color:'#1E40AF'}}>VIGÍA Analysis</span>
              {loading && <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{borderColor:'#BFDBFE', borderTopColor:'#0066FF'}} />}
              {done && <span className="text-xs font-medium" style={{color:'#059669'}}>Complete</span>}
            </div>
            {done && (
              <button onClick={copy} className="btn-outline btn-xs">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          <div className="px-4 py-4">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed" style={{color:'#1E40AF'}}>
              {text}
              {loading && <span className="cursor-blink" />}
            </pre>
          </div>
          {done && (
            <button onClick={analyze} className="mt-3 text-xs text-gray-400 hover:text-gray-600">
              Re-analyze
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={analyze} className="btn-outline btn-sm mt-2">Retry</button>
        </div>
      )}
    </div>
  );
}
