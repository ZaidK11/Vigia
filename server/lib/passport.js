const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { EMPLOYEES, ROLE_PORTALS } = require('../employees');

const CALLBACK_URL = 'https://vigia-production-5a0a.up.railway.app/auth/google/callback';

function buildGoogleStrategy() {
  return new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    proxy: true  // trust x-forwarded-proto from Railway load balancer
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value?.toLowerCase();

    if (!email) {
      return done(null, false, { message: 'No email found in Google profile' });
    }

    if (!email.endsWith('@airtm.io')) {
      return done(null, false, { message: 'Access restricted to @airtm.io accounts' });
    }

    const employee = EMPLOYEES[email];
    if (!employee) {
      return done(null, false, { message: 'Account not on the Airtm compliance portal whitelist' });
    }

    return done(null, {
      email,
      name: employee.name,
      department: employee.department,
      title: employee.title,
      role: employee.role,
      portals: ROLE_PORTALS[employee.role] || ['support'],
      avatar: profile.photos?.[0]?.value || null
    });
  });
}

// Initialize at startup
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('[VIGÍA] Google SSO configured — callback:', CALLBACK_URL);
  passport.use('google', buildGoogleStrategy());
} else {
  console.warn('[VIGÍA] GOOGLE_CLIENT_ID/SECRET not set — SSO disabled, email login only');
}

// Lazy reinit (called from sso.js if startup init failed)
passport.reinitGoogle = function () {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    try {
      passport.use('google', buildGoogleStrategy());
      console.log('[VIGÍA] Google SSO re-initialized, callback:', CALLBACK_URL);
      return true;
    } catch (e) {
      console.error('[VIGÍA] reinitGoogle failed:', e.message);
      return false;
    }
  }
  return false;
};

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
