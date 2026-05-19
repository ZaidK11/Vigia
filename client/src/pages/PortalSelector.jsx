import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const PORTALS = [
  { path: '/support', title: 'Support Portal', desc: 'Search customers, generate responses, escalate issues.', roles: ['SUPPORT_ANALYST','FRAUD_INVESTIGATOR','KYC_ANALYST','TM_ANALYST','LEADERSHIP'] },
  { path: '/fraud', title: 'Fraud Investigation', desc: 'Work from case queue, write narratives, escalate decisions.', roles: ['FRAUD_INVESTIGATOR','LEADERSHIP'] },
  { path: '/kyc', title: 'KYC Applications', desc: 'Review pending applications, approve or reject with reason codes.', roles: ['KYC_ANALYST','LEADERSHIP'] },
  { path: '/tm', title: 'TM Alerts', desc: 'Investigate alerts, generate SAR narratives, track deadlines.', roles: ['TM_ANALYST','LEADERSHIP'] },
  { path: '/leadership', title: 'Leadership Overview', desc: 'Overview of all open cases, stats, and direct VIGÍA chat.', roles: ['LEADERSHIP'] },
  { path: '/dashboard', title: '⚖️ Case Queue Dashboard', desc: 'All open cases: Support, KYC, TM, Fraud — due dates, urgency, sorted queue.', roles: ['LEADERSHIP', 'TM_ANALYST', 'FRAUD_INVESTIGATOR', 'KYC_ANALYST', 'SUPPORT_ANALYST'] },
];

export default function PortalSelector() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const available = PORTALS.filter(p => p.roles.includes(user?.role));
  const first = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {first}</h1>
        <p className="text-gray-500 text-sm mt-1">{user?.title} · {user?.department}</p>
      </div>

      <div className="space-y-3">
        {available.map(p => (
          <button key={p.path} onClick={() => navigate(p.path)}
            className="w-full card hover:border-[#00C9A7] hover:shadow-md transition-all text-left group">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{p.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{p.desc}</p>
              </div>
              <svg className="w-5 h-5 text-gray-300 group-hover:text-[#00C9A7] transition-colors flex-shrink-0 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
