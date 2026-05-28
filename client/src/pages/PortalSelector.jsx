import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import CkeChat from '../components/CkeChat.jsx';

const PORTALS = [
  {
    path: '/support',
    icon: '🎧',
    title: 'Support Portal',
    desc: 'Search customers, handle tickets, escalate issues.',
    roles: ['SUPPORT_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#0066FF',
    bg: '#EFF6FF',
  },
  {
    path: '/fraud',
    icon: '🔍',
    title: 'Fraud Investigation',
    desc: 'Work cases, write SAR narratives, escalate decisions.',
    roles: ['FRAUD_INVESTIGATOR', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#DC2626',
    bg: '#FEF2F2',
  },
  {
    path: '/kyc',
    icon: '🪪',
    title: 'KYC Applications',
    desc: 'Review pending applications, approve or reject.',
    roles: ['KYC_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  {
    path: '/tm',
    icon: '📡',
    title: 'TM Alerts',
    desc: 'Investigate alerts, generate SAR narratives, track deadlines.',
    roles: ['TM_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#D97706',
    bg: '#FFFBEB',
  },
  {
    path: '/dashboard',
    icon: '📊',
    title: 'Case Queue Dashboard',
    desc: 'All open cases with due dates, urgency sorting.',
    roles: ['FRAUD_INVESTIGATOR', 'KYC_ANALYST', 'TM_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#059669',
    bg: '#ECFDF5',
  },
  {
    path: '/analytics',
    icon: '📈',
    title: 'Analytics',
    desc: 'Live SLA metrics, agent performance, approval rates, false positive analysis.',
    roles: ['SUPPORT_ANALYST', 'FRAUD_INVESTIGATOR', 'KYC_ANALYST', 'TM_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    path: '/leadership',
    icon: '⚖️',
    title: 'Compliance Overview',
    desc: 'High-level compliance metrics, stats, and risk summary.',
    roles: ['LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#0F172A',
    bg: '#F8FAFC',
  },
  {
    path: '/regulatory',
    icon: '🌐',
    title: 'Regulatory Intel',
    desc: 'Daily OFAC, FinCEN, and FATF briefings — know what changed before the market opens.',
    roles: ['SUPPORT_ANALYST', 'FRAUD_INVESTIGATOR', 'KYC_ANALYST', 'TM_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
    color: '#0891B2',
    bg: '#ECFEFF',
  },
];

export default function PortalSelector() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showChat, setShowChat] = useState(false);
  const available = PORTALS.filter(p => p.roles.includes(user?.role));
  const isLeadership = user?.role === 'LEADERSHIP';
  const first = user?.name?.split(' ')[0] || 'there';

  if (showChat) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <button onClick={() => setShowChat(false)}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none">←</button>
          <div>
            <p className="text-sm font-semibold text-gray-800">VIGÍA Intelligence</p>
            <p className="text-xs text-gray-400">Live data access · Questions logged to audit trail</p>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <CkeChat />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {first}</h1>
        <p className="text-gray-500 text-sm mt-1">{user?.title} · {user?.department}</p>
      </div>

      {/* Ask VIGÍA — Leadership only, prominent on main page */}
      {isLeadership && (
        <button onClick={() => setShowChat(true)}
          className="w-full mb-5 flex items-center gap-4 p-5 rounded-2xl border-2 text-left group transition-all hover:shadow-md"
          style={{ background: '#EFF6FF', borderColor: '#0066FF' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#0066FF' }}>
            <span className="text-white text-xl">💬</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: '#0066FF' }}>Ask VIGÍA</p>
            <p className="text-xs text-gray-600 mt-0.5">
              <span className="font-medium text-gray-800">What's your compliance question?</span>
              {' '}Query live ClickHouse, Freshdesk, Jira data — ask anything.
            </p>
            <p className="text-[10px] text-gray-400 mt-1">e.g. "Top 3 ticket reasons this month" · "How many KYC pending?" · "Open fraud cases by analyst"</p>
          </div>
          <div className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: '#0066FF' }}>
            Ask →
          </div>
        </button>
      )}

      {/* Portal grid */}
      <div className="grid gap-3">
        {available.map(p => (
          <button key={p.path} onClick={() => navigate(p.path)}
            className="w-full text-left group flex items-center gap-4 p-4 rounded-2xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: p.bg }}>
              {p.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.desc}</p>
            </div>
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
