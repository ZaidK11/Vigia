const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { EMPLOYEES, ROLE_PORTALS } = require('../employees');

// Only initialize Google SSO if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
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
}));
} else {
  console.warn('[VIGÍA] Google SSO not configured — GOOGLE_CLIENT_ID/SECRET missing. Email login only.');
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
