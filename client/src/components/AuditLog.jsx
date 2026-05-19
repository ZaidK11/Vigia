import React, { useEffect, useState } from 'react';
import axios from 'axios';

function decisionColor(decision) {
  if (!decision) return 'text-gray-400';
  const d = decision.toUpperCase();
  if (d.includes('SAR') || d.includes('ESCALATE') || d.includes('REJECT') || d.includes('BLOCK')) return 'text-red-400';
  if (d.includes('MONITOR') || d.includes('FLAG')) return 'text-amber-400';
  if (d.includes('APPROVE') || d.includes('CLOSE') || d.includes('CLEAN')) return 'text-emerald-400';
  return 'text-gray-300';
}

export default function AuditLog({ meOnly = true, limit = 10 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('vigia_token');
      const res = await axios.get(`/api/audit/log?limit=${limit}&me=${meOnly}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(res.data.logs || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  if (loading) return <div className="text-gray-500 text-sm py-4">Loading audit log...</div>;

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm">
          🔒 Audit Trail {meOnly ? '(Your Actions)' : '(All)'}
        </h3>
        <button onClick={fetchLogs} className="text-xs text-indigo-400 hover:text-indigo-300">
          Refresh
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="text-gray-500 text-sm">No actions recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-700 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 font-mono">{log.timestamp}</span>
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-mono">
                    {log.action}
                  </span>
                  {log.resource_id && (
                    <span className="text-xs text-indigo-400">{log.resource_id}</span>
                  )}
                </div>
                {log.decision && (
                  <p className={`text-xs font-semibold mt-0.5 ${decisionColor(log.decision)}`}>
                    → {log.decision}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
