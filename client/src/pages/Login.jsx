import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { api } from '../lib/api.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'unauthorized') {
      setError('Access denied. Only @airtm.io Google accounts are permitted.');
      window.history.replaceState({}, '', '/login');
    } else if (params.get('error') === 'sso_not_configured') {
      setShowEmail(true);
    }
  }, []);

  const handleEmail = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.auth.login(email.trim().toLowerCase());
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00C9A7] mb-4">
            <span className="text-white text-2xl font-bold">V</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">VIGÍA</h1>
          <p className="text-gray-500 text-sm mt-1">Compliance Portal · Airtm</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Sign in to your account</h2>
          <p className="text-sm text-gray-500 mb-5">
            Restricted to <span className="text-[#00C9A7] font-medium">@airtm.io</span> accounts only.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Google SSO primary */}
          <button
            onClick={() => window.location.href = '/auth/google'}
            className="w-full flex items-center justify-center gap-3 bg-white font-semibold py-3 px-4 mb-4 transition-all"
            style={{border:'2px solid #0066FF', color:'#0066FF', borderRadius:'24px'}}
            onMouseEnter={e=>{e.currentTarget.style.background='#F0F7FF'}}
            onMouseLeave={e=>{e.currentTarget.style.background='#FFFFFF'}}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google (Airtm SSO)
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {!showEmail ? (
            <button onClick={() => setShowEmail(true)} className="w-full text-sm text-gray-400 hover:text-gray-600 py-1.5 transition-colors">
              Sign in with email →
            </button>
          ) : (
            <form onSubmit={handleEmail} className="space-y-3">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="yourname@airtm.io" required className="input" />
              <button type="submit" disabled={loading || !email} className="btn-primary w-full justify-center py-2.5">
                {loading ? 'Signing in...' : 'Sign in →'}
              </button>
            </form>
          )}

          <p className="text-[10px] text-gray-400 text-center mt-5 leading-relaxed">
            All actions logged and audited. Unauthorized access is recorded.
          </p>
        </div>
      </div>
    </div>
  );
}
