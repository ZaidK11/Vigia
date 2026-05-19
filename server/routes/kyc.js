const express = require('express');
const router = express.Router();
const ch = require('../lib/clickhouse');
const { logAction } = require('../lib/audit');

function buildKycCommand(app) {
  const docs = app.documents || {};
  return `Review KYC application ${app.id}:

Applicant: ${app.name || 'Unknown'}
Country: ${app.country || 'Unknown'}
Inquiry status: ${app.inquiryStatus || 'Unknown'}

Documents:
├─ National ID: ${docs.idStatus || 'Unknown'}
├─ Selfie / Liveness: ${docs.selfieStatus || 'Unknown'}
└─ Proof of address: ${docs.addressStatus || 'Unknown'}

Document verified: ${app.documentVerified ? '✅' : '❌'}
Facial verified: ${app.facialVerified ? '✅' : '❌'}
Watchlist verified: ${app.watchlistVerified ? '✅' : '❌'}

Persona case status: ${app.personaStatus || 'Unknown'}

Provide:
1. Recommendation (APPROVE / REJECT / REQUEST_DOCS / EDD_REQUIRED)
2. Any EDD flags or concerns
3. If rejecting, reason code
4. Confidence (HIGH / MEDIUM / LOW)`;
}

// GET /api/kyc/applications
router.get('/applications', async (req, res) => {
  const rows = await ch.query(`
    SELECT inquiry_id, user_id, inquiry_status, country_code, document_type, created_at
    FROM analytics_compliance.stg_dodrio_persona_inquiries
    WHERE inquiry_status IN ('pending', 'needs_review', 'created', 'failed', 'waiting')
    ORDER BY created_at ASC
    LIMIT 50
  `);

  const applications = rows.map(r => ({
    id: r.inquiry_id,
    userId: r.user_id,
    status: r.inquiry_status,
    country: r.country_code,
    docType: r.document_type,
    created: r.created_at
  }));

  res.json({ applications });
});

// GET /api/kyc/application/:id
router.get('/application/:id', async (req, res) => {
  const { id } = req.params;

  const [inquiryRows, personaCaseRows] = await Promise.all([
    ch.query(`
      SELECT inquiry_id, user_id, inquiry_status, country_code, document_type,
             first_name, last_name, birthdate, created_at, updated_at
      FROM analytics_compliance.stg_dodrio_persona_inquiries
      WHERE inquiry_id = '${id}'
      LIMIT 1
    `),
    ch.query(`
      SELECT inquiry_id, status, decision, created_at
      FROM data_lake.persona_cases
      WHERE inquiry_id = '${id}'
      LIMIT 1
    `).catch(() => [])
  ]);

  const inquiry = inquiryRows[0] || null;
  const personaCase = personaCaseRows[0] || null;

  let dodrioUser = null;
  if (inquiry?.user_id) {
    const uRows = await ch.query(`
      SELECT id, tier_level, status, document_verified, facial_verified, watchlist_verified,
             email, first_name, last_name
      FROM data_lake.security_hub_dodrio_users
      WHERE id = '${inquiry.user_id}' AND _peerdb_is_deleted = 0
      LIMIT 1
    `);
    dodrioUser = uRows[0] || null;
  }

  const name = inquiry
    ? `${inquiry.first_name || ''} ${inquiry.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';

  const app = {
    id,
    name,
    userId: inquiry?.user_id,
    email: dodrioUser?.email,
    country: inquiry?.country_code,
    inquiryStatus: inquiry?.inquiry_status,
    personaStatus: personaCase?.status,
    documentVerified: !!dodrioUser?.document_verified,
    facialVerified: !!dodrioUser?.facial_verified,
    watchlistVerified: !!dodrioUser?.watchlist_verified,
    kycTier: dodrioUser?.tier_level,
    documents: {
      idStatus: dodrioUser?.document_verified ? '✅ Verified' : '❓ Pending',
      selfieStatus: dodrioUser?.facial_verified ? '✅ Verified' : '❓ Pending',
      addressStatus: 'Not tracked separately'
    }
  };

  const command = buildKycCommand(app);

  if (req.user) {
    logAction({
      userEmail: req.user.email,
      action: 'KYC_APPLICATION_VIEW',
      resourceId: id,
      details: { userId: inquiry?.user_id }
    });
  }

  res.json({ application: app, command });
});

// POST /api/kyc/decision
router.post('/decision', (req, res) => {
  const { applicationId, decision, notes } = req.body;
  if (!applicationId || !decision) return res.status(400).json({ error: 'applicationId and decision required' });
  logAction({
    userEmail: req.user?.email || 'unknown',
    action: 'KYC_DECISION',
    resourceId: applicationId,
    decision,
    details: { notes }
  });
  res.json({ success: true, logged: true });
});

module.exports = router;
