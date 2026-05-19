import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const PORTALS = [
  {
    id: 'support',
    icon: '🎟️',
    title: 'Support Portal',
    description: 'Look up users, check KYC status, investigate flagged accounts',
    color: 'border-blue-600 hover:bg-blue-900/20',
    badge: 'badge-blue',
    badgeText: 'SUPPORT'
  },
  {
    id: 'fraud',
    icon: '🔍',
    title: 'Fraud Investigation',
    description: 'Analyze fraud cases, review transaction patterns, SAR assessments',
    color: 'border-red-600 hover:bg-red-900/20',
    badge: 'badge-red',
    badgeText: 'FRAUD'
  },
  {
    id: 'kyc',
    icon: '🪪',
    title: 'KYC Review',
    description: 'Review identity documents, sanctions screening, approve/reject applications',
    color: 'border-emerald-600 hover:bg-emerald-900/20',
    badge: 'badge-green',
    badgeText: 'KYC'
  },
  {
    id: 'tm',
    icon: '📡',
    title: 'Transaction Monitoring',
    description: 'Investigate TM alerts, write SAR narratives, track investigation clock',
    color: 'border-amber-600 hover:bg-amber-900/20',
    badge: 'badge-yellow',
    badgeText: 'TM'
  }
];

export default function PortalSelector() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const available = PORTALS.filter(p => user?.portals?.includes(p.id));

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-gray-400 mt-1">Select a portal to begin your investigation session.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {available.map(portal => (
          <button
            key={portal.id}
            onClick={() => navigate(`/${portal.id}`)}
            className={`card border-l-4 ${portal.color} text-left transition-all duration-150 hover:scale-[1.01] cursor-pointer`}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-3xl">{portal.icon}</span>
              <span className={portal.badge}>{portal.badgeText}</span>
            </div>
            <h3 className="font-semibold text-white text-lg mb-1">{portal.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{portal.description}</p>
          </button>
        ))}
      </div>

      {/* VIGÍA tag */}
      <div className="mt-12 pt-6 border-t border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">V</div>
          <div>
            <p className="text-sm text-gray-300 font-medium">VIGÍA is ready</p>
            <p className="text-xs text-gray-500">
              Copy commands from any portal → paste in <strong>#vigia-compliance</strong> → tag <strong>@vigia</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
