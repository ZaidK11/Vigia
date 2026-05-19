import React from 'react';

function StatusBadge({ status }) {
  if (!status) return <span className="badge-gray">Unknown</span>;
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return <span className="badge-active">Active</span>;
  if (s.includes('BAN')) return <span className="badge-banned">Banned</span>;
  if (s.includes('LIMIT') || s.includes('RESTRICT')) return <span className="badge-limited">Limited</span>;
  if (s.includes('PARTIAL') || s.includes('PENDING')) return <span className="badge-pending">Pending</span>;
  return <span className="badge-gray">{status}</span>;
}

export default function UserCard({ user, risk, extra = {} }) {
  if (!user) return null;

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  const age = user.registered_at
    ? Math.floor((Date.now() - new Date(user.registered_at)) / 86400000)
    : null;
  const tier = user.tier_level != null ? `Tier ${user.tier_level}` : null;
  const uuid = user.id ? user.id.slice(0, 8) + '...' : null;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          {name && <p className="text-xs text-gray-500 mb-0.5">{name}</p>}
          <p className="font-semibold text-gray-900">{user.email || user.id}</p>
          {uuid && user.email && <p className="text-xs text-gray-400 font-mono mt-0.5">{uuid}</p>}
        </div>
        <StatusBadge status={user.status} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-gray-50 rounded-lg p-2.5">
          <p className="text-xs text-gray-500">KYC Tier</p>
          <p className="text-sm font-bold text-gray-800 mt-0.5">{tier || '—'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5">
          <p className="text-xs text-gray-500">Account Age</p>
          <p className="text-sm font-bold text-gray-800 mt-0.5">{age != null ? `${age}d` : '—'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5">
          <p className="text-xs text-gray-500">Txns (30d)</p>
          <p className="text-sm font-bold text-gray-800 mt-0.5">{extra.txnCount ?? '—'}</p>
        </div>
      </div>

      {(user.document_verified !== undefined) && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4">
          <span className="text-xs text-gray-500">
            ID {user.document_verified ? '✓' : '✗'}
          </span>
          <span className="text-xs text-gray-500">
            Facial {user.facial_verified ? '✓' : '✗'}
          </span>
          <span className="text-xs text-gray-500">
            Watchlist {user.watchlist_verified ? '✓' : '✗'}
          </span>
        </div>
      )}

      {risk?.risk_level && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
          <span className="text-xs text-gray-500">Risk:</span>
          <span className={`font-semibold text-sm ${
            risk.risk_level.toLowerCase() === 'high' ? 'text-red-600' :
            risk.risk_level.toLowerCase() === 'medium' ? 'text-amber-600' :
            'text-emerald-600'
          }`}>
            {risk.risk_level.toUpperCase()}
          </span>
          {risk.score != null && <span className="text-xs text-gray-400">({risk.score})</span>}
        </div>
      )}

      {user.note && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-amber-700 text-xs">{user.note}</p>
        </div>
      )}
    </div>
  );
}
