import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api } from './lib/api.js';
import Login from './pages/Login.jsx';
import PortalSelector from './pages/PortalSelector.jsx';
import Support from './pages/Support.jsx';
import Fraud from './pages/Fraud.jsx';
import KYC from './pages/KYC.jsx';
import TM from './pages/TM.jsx';
import Leadership from './pages/Leadership.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Header from './components/Header.jsx';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const PORTAL_ROLES = {
  // Support: Support team + Leadership + Compliance Managers
  support: ['SUPPORT_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
  // Fraud / KYC / TM: Compliance team + Leadership + Compliance Managers
  fraud: ['FRAUD_INVESTIGATOR', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
  kyc: ['KYC_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
  tm: ['TM_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
  // Dashboard: All compliance roles + Leadership + Compliance Managers
  dashboard: ['FRAUD_INVESTIGATOR', 'KYC_ANALYST', 'TM_ANALYST', 'LEADERSHIP', 'COMPLIANCE_MANAGER'],
  // Leadership Overview: Leadership + Compliance Managers (Ask Vigía chat remains LEADERSHIP-only)
  leadership: ['LEADERSHIP', 'COMPLIANCE_MANAGER']
};

function ProtectedRoute({ children, portal }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (portal && !PORTAL_ROLES[portal]?.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card text-center max-w-sm">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-white font-semibold">Access Denied</p>
          <p className="text-gray-400 text-sm mt-1">Your role ({user.role}) doesn't have access to this portal.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userStr = params.get('user');
    if (token && userStr) {
      try {
        const u = JSON.parse(decodeURIComponent(userStr));
        localStorage.setItem('vigia_token', token);
        localStorage.setItem('vigia_user', JSON.stringify(u));
        setUser(u);
        window.history.replaceState({}, '', '/');
      } catch {}
    } else {
      const saved = localStorage.getItem('vigia_user');
      if (saved) {
        try { setUser(JSON.parse(saved)); } catch {}
      }
    }
    setLoading(false);
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('vigia_token', token);
    localStorage.setItem('vigia_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('vigia_token');
    localStorage.removeItem('vigia_user');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0E1A]">
        <div className="text-center">
          <div className="text-5xl mb-4">⚖️</div>
          <div className="text-[#00C9A7] font-semibold">Loading VIGÍA...</div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <div className="min-h-screen bg-[#0A0E1A]">
        {user && <Header />}
        <div className={user ? 'pt-14' : ''}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/" element={<ProtectedRoute><PortalSelector /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute portal="support"><Support /></ProtectedRoute>} />
            <Route path="/fraud" element={<ProtectedRoute portal="fraud"><Fraud /></ProtectedRoute>} />
            <Route path="/kyc" element={<ProtectedRoute portal="kyc"><KYC /></ProtectedRoute>} />
            <Route path="/tm" element={<ProtectedRoute portal="tm"><TM /></ProtectedRoute>} />
            <Route path="/leadership" element={<ProtectedRoute portal="leadership"><Leadership /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute portal="dashboard"><Dashboard /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
