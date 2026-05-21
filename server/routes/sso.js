const express = require('express');
const router = express.Router();
const passport = require('../lib/passport');

const FRONTEND_URL = process.env.FRONTEND_URL || '';

// GET /auth/google — kick off Google OAuth
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect('/login?error=sso_not_configured');
  }

  // Re-init if the strategy wasn't loaded at startup (env vars added after boot)
  try {
    passport.reinitGoogle();
  } catch (e) {
    console.warn('[SSO] reinitGoogle failed:', e.message);
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    hd: 'airtm.io'
  })(req, res, next);
});

// GET /auth/google/callback — Google redirects here
router.get('/google/callback',
  (req, res, next) => {
    // Re-init if needed
    try { passport.reinitGoogle(); } catch {}
    passport.authenticate('google', { failureRedirect: '/login?error=unauthorized' })(req, res, next);
  },
  (req, res) => {
    const user = req.user;
    if (!user) return res.redirect('/login?error=unauthorized');

    const SECRET = process.env.SESSION_SECRET || 'vigia-compliance-portal-2026';
    const token = Buffer.from(`${user.email}:${SECRET}:${Date.now()}`).toString('base64');

    // Redirect to SPA with token + user data
    res.redirect(`${FRONTEND_URL}/?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(user))}`);
  }
);

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect(`${FRONTEND_URL}/login`);
  });
});

// GET /auth/me
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

module.exports = router;
