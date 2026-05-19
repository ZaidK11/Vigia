import React, { useState } from 'react';

export default function CommandBox({ command, onDecisionLogged }) {
  const [copied, setCopied] = useState(false);

  if (!command) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-gray-900 border border-indigo-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-900/40 border-b border-indigo-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 font-bold text-sm">⚖️ VIGÍA Command</span>
          <span className="text-xs text-gray-400">Ready to send</span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            copied
              ? 'bg-emerald-700 text-emerald-100'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {copied ? '✅ Copied!' : '📋 Copy to Clipboard'}
        </button>
      </div>

      {/* Command body */}
      <pre className="px-4 py-4 text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
        {command}
      </pre>

      {/* Footer instruction */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-3">
        <p className="text-xs text-gray-400">
          📨 Paste in <span className="text-indigo-300 font-medium">#vigia-compliance</span> and tag{' '}
          <span className="text-indigo-300 font-medium">@vigia</span> — VIGÍA will analyze and respond with reasoning.
        </p>
        <p className="text-xs text-gray-500 mt-1">
          After receiving VIGÍA's response, log your decision using the buttons below. All decisions are immutably recorded.
        </p>
      </div>
    </div>
  );
}
