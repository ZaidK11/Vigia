import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const TABS = [
  { path: '/support',    label: 'Support',    roles: ['SUPPORT_ANALYST','FRAUD_INVESTIGATOR','KYC_ANALYST','TM_ANALYST','LEADERSHIP'] },
  { path: '/fraud',      label: 'Fraud',      roles: ['FRAUD_INVESTIGATOR','LEADERSHIP'] },
  { path: '/kyc',        label: 'KYC',        roles: ['KYC_ANALYST','LEADERSHIP'] },
  { path: '/tm',         label: 'TM Alerts',  roles: ['TM_ANALYST','LEADERSHIP'] },
  { path: '/leadership', label: 'Dashboard',  roles: ['LEADERSHIP'] },
];

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const visibleTabs = TABS.filter(t => t.roles.includes(user?.role));
  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'V';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-white h-16 flex items-center px-6"
      style={{ borderBottom: '1px solid #EEEEEE' }}
    >
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2.5 mr-8 hover:opacity-75 transition-opacity"
        style={{ transition: 'opacity 200ms' }}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#00C9A7' }}>
          <span className="text-white text-sm font-bold">V</span>
        </div>
        <div>
          <span className="font-bold text-sm" style={{ color: '#1A1A1A' }}>VIGÍA</span>
          <span className="text-xs ml-1" style={{ color: '#999999' }}>Compliance</span>
        </div>
      </button>

      {/* Nav tabs */}
      <nav className="flex items-center gap-1 flex-1">
        {visibleTabs.map(tab => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? '#F0F7FF' : 'transparent',
                color: active ? '#0066FF' : '#666666',
                border: active ? '1px solid #BFDBFE' : '1px solid transparent',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* User info */}
      <div className="flex items-center gap-3">
        <div className="hidden md:block text-right">
          <p className="text-xs font-semibold leading-none" style={{ color: '#1A1A1A' }}>
            {user?.name?.split(' ')[0]}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#999999' }}>
            {user?.role?.replace('_', ' ')}
          </p>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: '#0066FF' }}
        >
          {initials}
        </div>
        <button
          onClick={logout}
          className="text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{ color: '#666666', border: '1px solid #EEEEEE' }}
          onMouseEnter={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.color = '#1A1A1A'; }}
          onMouseLeave={e => { e.target.style.borderColor = '#EEEEEE'; e.target.style.color = '#666666'; }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
