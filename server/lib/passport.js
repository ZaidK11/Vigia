const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { EMPLOYEES, ROLE_PORTALS } = require('../employees');

function buildGoogleStrategy() {
  return new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://vigia-production-5a0a.up.railway.app/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value?.toLowerCase();

    if (!email) {
      return done(null, false, { message: 'No email found in Google profile' });
    }

    // Must be @airtm.io
    if (!email.endsWith('@airtm.io')) {
      return done(null, false, { message: 'Access restricted to @airtm.io accounts' });
    }

    // Must be on the employee whitelist
    const employee = EMPLOYEES[email];
    if (!employee) {
      return done(null, false, { message: 'Account not on the Airtm compliance portal whitelist' });
    }

    const user = {
      email,
      name: employee.name,
      department: employee.department,
      title: employee.title,
      role: employee.role,
      portals: ROLE_PORTALS[employee.role] || ['support'],
      avatar: profile.photos?.[0]?.value || null
    };

    return done(null, user);
  });
}

// Initialize at startup if available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('[VIGÍA] Google SSO configured — OAuth ready');
  passport.use('google', buildGoogleStrategy());
} else {
  console.warn('[VIGÍA] Google SSO not configured at startup — GOOGLE_CLIENT_ID/SECRET missing. Email login only.');
}

// Re-initialize function for lazy loading (called from sso.js if startup missed it)
passport.reinitGoogle = function () {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    try {
      passport.use('google', buildGoogleStrategy());
      console.log('[VIGÍA] Google SSO re-initialized successfully');
      return true;
    } catch (e) {
      console.error('[VIGÍA] Google SSO reinit failed:', e.message);
      return false;
    }
  }
  return false;
};

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
