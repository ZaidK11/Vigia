import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const TABS = [
  { path: '/support',    label: 'Support',    roles: ['SUPPORT_ANALYST','FRAUD_INVESTIGATOR','KYC_ANALYST','TM_ANALYST','LEADERSHIP'] },
  { path: '/fraud',      label: 'Fraud',      roles: ['FRAUD_INVESTIGATOR','LEADERSHIP'] },
  { path: '/kyc',        label: 'KYC',        roles: ['KYC_ANALYST','LEADERSHIP'] },
  { path: '/tm',         label: 'TM Alerts',  roles: ['TM_ANALYST','LEADERSHIP'] },
  { path: '/dashboard',  label: 'Dashboard',  roles: ['SUPPORT_ANALYST','FRAUD_INVESTIGATOR','KYC_ANALYST','TM_ANALYST','LEADERSHIP'] },
  { path: '/leadership', label: 'Overview',   roles: ['LEADERSHIP'] },
];

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleTabs = TABS.filter(t => t.roles.includes(user?.role));
  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'V';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-white h-14 flex items-center px-4 md:px-6"
      style={{ borderBottom: '1px solid #EEEEEE' }}
    >
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 mr-4 md:mr-8 hover:opacity-75 transition-opacity flex-shrink-0"
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#00C9A7' }}>
          <span className="text-white text-sm font-bold">V</span>
        </div>
        <div className="hidden sm:block">
          <span className="font-bold text-sm" style={{ color: '#1A1A1A' }}>VIGÍA</span>
          <span className="text-xs ml-1" style={{ color: '#999999' }}>Compliance</span>
        </div>
      </button>

      {/* Desktop nav tabs */}
      <nav className="hidden md:flex items-center gap-1 flex-1">
        {visibleTabs.map(tab => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
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

      {/* Mobile nav — hamburger */}
      <div className="flex md:hidden flex-1 items-center">
        <span className="text-sm font-semibold text-gray-700">
          {visibleTabs.find(t => t.path === location.pathname)?.label || 'Portal'}
        </span>
      </div>

      {/* User info + mobile menu */}
      <div className="flex items-center gap-2">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex md:hidden items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>

        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold leading-none" style={{ color: '#1A1A1A' }}>
              {user?.name?.split(' ')[0]}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#999999' }}>
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: '#0066FF' }}
          >
            {initials}
          </div>
          <button
            onClick={logout}
            className="text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
            style={{ color: '#666666', border: '1px solid #EEEEEE' }}
          >
            Sign out
          </button>
        </div>

        {/* Mobile: just avatar */}
        <div
          className="flex md:hidden w-8 h-8 rounded-full items-center justify-center text-white text-xs font-bold"
          style={{ background: '#0066FF' }}
        >
          {initials}
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div
          className="absolute top-14 left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50 md:hidden"
          style={{ borderTop: '1px solid #EEEEEE' }}
        >
          {visibleTabs.map(tab => {
            const active = location.pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => { navigate(tab.path); setMenuOpen(false); }}
                className="w-full text-left px-6 py-3 text-sm font-medium border-b border-gray-100 last:border-0 transition-colors"
                style={{
                  background: active ? '#F0F7FF' : 'white',
                  color: active ? '#0066FF' : '#333333',
                }}
              >
                {tab.label}
              </button>
            );
          })}
          <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-800">{user?.name?.split(' ')[0]}</p>
              <p className="text-[10px] text-gray-400">{user?.role?.replace(/_/g, ' ')}</p>
            </div>
            <button onClick={logout} className="text-xs text-red-500 font-medium">Sign out</button>
          </div>
        </div>
      )}
    </header>
  );
}
