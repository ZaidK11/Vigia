// ============================================================
// VIGÍA BSA DECISION ENGINE — BUILD HEADER
// ============================================================
// Tool Name:        VIGÍA Compliance Portal — Express Server
// Build Date:       2026-05-14
// Authorized by:    Zaid Khan (U087TL6CGNM)
// POLICY COMPLIANCE: POL-BSA-001-v4.2
// EWRA RISK MITIGATION: Risk ID(s): EWRA-01, EWRA-20 | Residual: LOW
// HISTORICAL AUDIT GAP: Crowe Finding ##6, ##7 (2025)
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passportLib = require('./lib/passport');
const { router: authRouter, validateToken } = require('./routes/auth');
const ssoRouter = require('./routes/sso');
const supportRouter = require('./routes/support');
const fraudRouter = require('./routes/fraud');
const kycRouter = require('./routes/kyc');
const tmRouter = require('./routes/tm');
const auditRouter = require('./routes/auditRoute');
const vigiaApiRouter = require('./routes/vigia-api');
const searchRouter = require('./routes/search');
const feedbackRouter = require('./routes/feedback');
const dashboardRouter = require('./routes/dashboard');
const { startScheduler } = require('./jobs/updateDashboard');

const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Session (required for passport OAuth flow)
app.use(session({
  secret: process.env.SESSION_SECRET || 'vigia-compliance-portal-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } // 8hr
}));
app.use(passportLib.initialize());
app.use(passportLib.session());

// Auth middleware — inject req.user on authenticated routes
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = auth.slice(7);
  const user = validateToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = user;
  next();
}

// Role guard factory
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires: ${roles.join(' or ')}` });
    }
    next();
  };
}

// Routes
app.use('/auth', ssoRouter);  // Google SSO
app.use('/api/auth', authRouter);  // Token auth (fallback)
app.use('/api/support', requireAuth, supportRouter);
app.use('/api/fraud', requireAuth, fraudRouter);
app.use('/api/kyc', requireAuth, kycRouter);
app.use('/api/tm', requireAuth, tmRouter);
app.use('/api/audit', requireAuth, auditRouter);
app.use('/api/vigia', requireAuth, vigiaApiRouter);
app.use('/api/search', requireAuth, searchRouter);    // unified search — 4 protocols
app.use('/api/feedback', requireAuth, feedbackRouter); // verdict feedback loop
app.use('/api/dashboard', requireAuth, dashboardRouter); // compliance leadership dashboard

// Serve React static build
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Leadership stats
app.get('/api/leadership/stats', requireAuth, async (req, res) => {
  if (req.user.role !== 'LEADERSHIP') return res.status(403).json({ error: 'Leadership only' });
  try {
    const chLib = require('./lib/clickhouse');
    const { getRecentLogs } = require('./lib/audit');
    const [statusRows, recentLogs] = await Promise.all([
      chLib.query(`SELECT current_status, COUNT(*) as count FROM analytics_compliance.fact_ar_issues WHERE is_closed = 0 GROUP BY current_status FORMAT JSONEachRow`),
      getRecentLogs(15)
    ]);
    const counts = {};
    statusRows.forEach(r => { counts[r.current_status] = parseInt(r.count || 0); });
    const openAlerts = Object.values(counts).reduce((s, v) => s + v, 0);
    const highRisk = counts['Ready to escalate'] || 0;
    const underInvestigation = (counts['New Investigation'] || 0) + (counts['New'] || 0);
    res.json({ openAlerts, highRisk, underInvestigation, statusBreakdown: counts, recentLogs });
  } catch (err) {
    console.error('[Leadership stats]', err.message);
    res.json({ openAlerts: 0, highRisk: 0, underInvestigation: 0, statusBreakdown: {}, recentLogs: [] });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VIGÍA Compliance Portal',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Start compliance dashboard cron job
startScheduler();

app.listen(PORT, () => {
  console.log(`\n⚖️  VIGÍA Compliance Portal running on http://localhost:${PORT}`);
  console.log(`   Authorized by: Zaid Khan (U087TL6CGNM)`);
  console.log(`   Policy: POL-BSA-001-v4.2\n`);
});

module.exports = app;
