import React, { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function VigiaChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Ready. Ask me anything about compliance, cases, risk patterns, or strategy.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    const idx = history.length;
    try {
      let full = '';
      const sendHistory = history.filter(m => m.content);
      for await (const chunk of api.vigia.chatStream(sendHistory)) {
        if (chunk.text) { full += chunk.text; setMessages(m => m.map((msg, i) => i === idx ? { ...msg, content: full } : msg)); }
        if (chunk.done || chunk.error) break;
      }
    } catch (err) {
      setMessages(m => m.map((msg, i) => i === idx ? { ...msg, content: `Error: ${err.message}` } : msg));
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#00C9A7] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">V</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">VIGÍA Chat</span>
          <span className="badge-teal text-[10px]">Leadership</span>
        </div>
        <button onClick={() => setMessages([{ role: 'assistant', content: 'Ready.' }])}
          className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0 bg-gray-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-[#00C9A7] flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                <span className="text-white text-[9px] font-bold">V</span>
              </div>
            )}
            <div className={msg.role === 'user' ? 'chat-user' : 'chat-vigia'}>
              {msg.content
                ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                : <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <div className="w-3 h-3 border-2 border-[#00C9A7]/30 border-t-[#00C9A7] rounded-full animate-spin" />
                    Analyzing...
                  </div>
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 py-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2} placeholder="Ask anything — investigations, risk analysis, SAR guidance..."
            className="textarea flex-1 resize-none" disabled={loading} />
          <button onClick={send} disabled={loading || !input.trim()} className="btn-teal self-end px-4">
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            }
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
