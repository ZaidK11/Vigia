import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const PORTALS = [
  {
    path: '/support',
    icon: '🎧',
    title: 'Support Portal',
    desc: 'Search customers, handle tickets, escalate issues to compliance.',
    roles: ['SUPPORT_ANALYST', 'LEADERSHIP'],
    color: '#0066FF',
    bg: '#EFF6FF',
  },
  {
    path: '/fraud',
    icon: '🔍',
    title: 'Fraud Investigation',
    desc: 'Work cases, write SAR narratives, escalate decisions.',
    roles: ['FRAUD_INVESTIGATOR', 'LEADERSHIP'],
    color: '#DC2626',
    bg: '#FEF2F2',
  },
  {
    path: '/kyc',
    icon: '🪪',
    title: 'KYC Applications',
    desc: 'Review pending applications, approve or reject with reason codes.',
    roles: ['KYC_ANALYST', 'LEADERSHIP'],
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  {
    path: '/tm',
    icon: '📡',
    title: 'TM Alerts',
    desc: 'Investigate alerts, generate SAR narratives, track SAR deadlines.',
    roles: ['TM_ANALYST', 'LEADERSHIP'],
    color: '#D97706',
    bg: '#FFFBEB',
  },
  {
    path: '/dashboard',
    icon: '📊',
    title: 'Case Queue Dashboard',
    desc: 'All open cases with due dates, urgency sorting, and status filters.',
    roles: ['FRAUD_INVESTIGATOR', 'KYC_ANALYST', 'TM_ANALYST', 'LEADERSHIP'],
    color: '#059669',
    bg: '#ECFDF5',
  },
  {
    path: '/leadership',
    icon: '⚖️',
    title: 'Leadership Overview',
    desc: 'High-level compliance metrics, stats, and direct VIGÍA chat.',
    roles: ['LEADERSHIP'],
    color: '#0F172A',
    bg: '#F8FAFC',
  },
];

export default function PortalSelector() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const available = PORTALS.filter(p => p.roles.includes(user?.role));
  const first = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {first}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {user?.title} · {user?.department}
        </p>
      </div>

      <div className="grid gap-3">
        {available.map(p => (
          <button key={p.path} onClick={() => navigate(p.path)}
            className="w-full text-left group flex items-center gap-4 p-4 rounded-2xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all">
            {/* Icon */}
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: p.bg }}>
              {p.icon}
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.desc}</p>
            </div>
            {/* Arrow */}
            <svg className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>

      {available.length === 0 && (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🔒</p>
          <p className="font-semibold text-gray-700">No portals available</p>
          <p className="text-sm text-gray-400 mt-1">Contact Zaid to get access.</p>
        </div>
      )}
    </div>
  );
}
