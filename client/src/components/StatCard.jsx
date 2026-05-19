import React from 'react';

const COLOR_MAP = {
  teal: 'bg-[#00C9A7]/10 text-[#00C9A7]',
  red: 'bg-red-900/30 text-red-400',
  amber: 'bg-amber-900/30 text-amber-400',
  blue: 'bg-blue-900/30 text-blue-400',
  green: 'bg-emerald-900/30 text-emerald-400',
  gray: 'bg-gray-800 text-gray-400',
};

export default function StatCard({ icon, label, value, sub, color = 'teal', loading }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${COLOR_MAP[color] || COLOR_MAP.teal}`}>{icon}</div>
      <div>
        {loading ? (
          <div className="skeleton h-7 w-16 mb-1" />
        ) : (
          <p className="stat-value">{value ?? '—'}</p>
        )}
        <p className="stat-label">{label}</p>
        {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
