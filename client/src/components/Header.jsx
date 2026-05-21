import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const TABS = [
  { path: '/support',    label: '🎧 Support',    icon: '🎧', roles: ['SUPPORT_ANALYST', 'LEADERSHIP'] },
  { path: '/fraud',      label: '🔍 Fraud',      icon: '🔍', roles: ['FRAUD_INVESTIGATOR', 'LEADERSHIP'] },
  { path: '/kyc',        label: '🪪 KYC',         icon: '🪪', roles: ['KYC_ANALYST', 'LEADERSHIP'] },
  { path: '/tm',         label: '📡 TM Alerts',  icon: '📡', roles: ['TM_ANALYST', 'LEADERSHIP'] },
  { path: '/dashboard',  label: '📊 Dashboard',  icon: '📊', roles: ['FRAUD_INVESTIGATOR', 'KYC_ANALYST', 'TM_ANALYST', 'LEADERSHIP'] },
  { path: '/leadership', label: '⚖️ Overview',   icon: '⚖️', roles: ['LEADERSHIP'] },
];

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleTabs = TABS.filter(t => t.roles.includes(user?.role));
  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'V';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-4 md:px-6"
      style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>

      {/* Logo */}
      <button onClick={() => navigate('/')}
        className="flex items-center gap-2.5 mr-6 hover:opacity-80 transition-opacity flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Logomark: shield + V */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="7" fill="#0066FF"/>
            <path d="M7 8.5L14 19.5L21 8.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10.5 8.5L14 14.5L17.5 8.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
          </svg>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight" style={{ color: '#111827' }}>VIGÍA</span>
            <span className="text-[9px] font-medium tracking-widest uppercase" style={{ color: '#6B7280' }}>Compliance</span>
          </div>
        </div>
      </button>

      {/* Desktop nav tabs */}
      <nav className="hidden md:flex items-center gap-0.5 flex-1">
        {visibleTabs.map(tab => {
          const active = location.pathname === tab.path;
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              className="px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
              style={{
                background: active ? '#EFF6FF' : 'transparent',
                color: active ? '#0066FF' : '#4B5563',
                borderBottom: active ? '2px solid #0066FF' : '2px solid transparent',
              }}>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile current page label */}
      <div className="flex md:hidden flex-1 items-center">
        <span className="text-sm font-semibold text-gray-700">
          {visibleTabs.find(t => t.path === location.pathname)?.label || 'Portal'}
        </span>
      </div>

      {/* Right: user + actions */}
      <div className="flex items-center gap-2">
        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(!menuOpen)}
          className="flex md:hidden items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>

        {/* Desktop user info */}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold leading-none text-gray-900">{user?.name?.split(' ')[0]}</p>
            <p className="text-[10px] mt-0.5 text-gray-400">{user?.role?.replace(/_/g, ' ')}</p>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: '#0066FF' }}>
            {initials}
          </div>
          <button onClick={logout}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all">
            Sign out
          </button>
        </div>

        {/* Mobile avatar */}
        <div className="flex md:hidden w-8 h-8 rounded-full items-center justify-center text-white text-xs font-bold"
          style={{ background: '#0066FF' }}>
          {initials}
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="absolute top-14 left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50 md:hidden">
          {visibleTabs.map(tab => {
            const active = location.pathname === tab.path;
            return (
              <button key={tab.path}
                onClick={() => { navigate(tab.path); setMenuOpen(false); }}
                className="w-full text-left px-6 py-3.5 text-sm font-medium border-b border-gray-100 last:border-0 transition-colors"
                style={{ background: active ? '#EFF6FF' : 'white', color: active ? '#0066FF' : '#374151' }}>
                {tab.label}
              </button>
            );
          })}
          <div className="px-6 py-3.5 border-t border-gray-200 flex items-center justify-between">
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
