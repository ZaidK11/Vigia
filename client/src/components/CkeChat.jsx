import React, { useState, useRef, useEffect } from 'react';

function getToken() { return localStorage.getItem('vigia_token'); }

export default function CkeChat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Ready. I'm VIGÍA with full data access — ClickHouse, Freshdesk, Jira, Persona. Ask me anything: ticket trends, case analysis, risk patterns, compliance stats. I'll query the data and answer directly.",
      tools: []
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTools, setActiveTools] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const history = messages
      .filter(m => m.role && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    const userMsg = { role: 'user', content: text, tools: [] };
    const assistantMsg = { role: 'assistant', content: '', tools: [] };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);
    setActiveTools([]);

    const idx = messages.length + 1; // index of assistantMsg in new array

    try {
      const resp = await fetch('/api/cke/ask', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: text,
          conversationHistory: history
        })
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let toolsUsed = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const chunk = JSON.parse(line.slice(6));

            if (chunk.text) {
              fullText += chunk.text;
              setMessages(prev => prev.map((m, i) =>
                i === idx ? { ...m, content: fullText } : m
              ));
            }

            if (chunk.tool) {
              if (chunk.status === 'running') {
                setActiveTools(prev => [...prev, chunk.tool]);
              } else if (chunk.status === 'done') {
                toolsUsed.push(`${chunk.tool} (${chunk.rows} rows)`);
                setActiveTools(prev => prev.filter(t => t !== chunk.tool));
              }
            }

            if (chunk.done) {
              const finalTools = chunk.toolsUsed || toolsUsed;
              setMessages(prev => prev.map((m, i) =>
                i === idx ? { ...m, tools: finalTools, done: true } : m
              ));
              setActiveTools([]);
            }

            if (chunk.error) {
              setMessages(prev => prev.map((m, i) =>
                i === idx ? { ...m, content: `Error: ${chunk.error}`, done: true } : m
              ));
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => prev.map((m, i) =>
        i === idx ? { ...m, content: `Connection error: ${err.message}`, done: true } : m
      ));
    } finally {
      setLoading(false);
      setActiveTools([]);
    }
  };

  const copy = (text) => navigator.clipboard.writeText(text);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#0066FF' }}>
            <span className="text-white text-[10px] font-bold">V</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">VIGÍA Intelligence</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Live Data</span>
        </div>
        <button onClick={() => setMessages([{
          role: 'assistant',
          content: 'Conversation cleared. Ask me anything.',
          tools: []
        }])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0 bg-gray-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded flex items-center justify-center mr-2 mt-1 flex-shrink-0"
                style={{ background: '#0066FF' }}>
                <span className="text-white text-[9px] font-bold">V</span>
              </div>
            )}
            <div className={`max-w-[85%] ${msg.role === 'user'
              ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm'
              : 'bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm border border-gray-200'
            }`}>
              {msg.content ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: msg.role === 'user' ? 'white' : '#111827' }}>
                  {msg.content}
                  {loading && i === messages.length - 1 && msg.role === 'assistant' && !msg.done && (
                    <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </p>
              ) : (
                msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    Querying data...
                  </div>
                )
              )}

              {/* Tool usage indicators */}
              {msg.role === 'assistant' && msg.tools?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.tools.map((t, ti) => (
                    <span key={ti} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                      📊 {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Copy button for assistant messages */}
              {msg.role === 'assistant' && msg.done && msg.content && (
                <button onClick={() => copy(msg.content)}
                  className="mt-2 text-[10px] text-gray-400 hover:text-gray-600">
                  Copy
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Active tool indicators */}
        {activeTools.length > 0 && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded flex items-center justify-center mr-2 mt-1 flex-shrink-0" style={{ background: '#0066FF' }}>
              <span className="text-white text-[9px] font-bold">V</span>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl rounded-tl-sm px-4 py-3">
              {activeTools.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-blue-700">
                  <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                  Running {t}...
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-gray-200 bg-white flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder="Ask anything — e.g. 'What are the top 3 ticket reasons in the last 12 months?' or 'How many KYC applications are pending?'"
            className="flex-1 rounded-xl border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
            style={{ color: '#111827' }}
            disabled={loading}
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="self-end px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: '#0066FF' }}>
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
              : '→'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">
          Queries live ClickHouse + Freshdesk data. All questions logged to audit trail.
        </p>
      </div>
    </div>
  );
}
