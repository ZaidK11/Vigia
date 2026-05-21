# June 1 Launch Checklist — VIGÍA Compliance Portal
**Target date:** June 1, 2026  
**Owner:** Zaid Khan (U087TL6CGNM)  
**Status:** 🟡 In progress

---

## Week of May 19–23 — Security & Infrastructure

### CRITICAL (must complete before launch)

- [ ] **API-level role enforcement**
  - Add `requireRole()` middleware to fraud, kyc, tm, audit routes
  - Fraud: FRAUD_INVESTIGATOR + LEADERSHIP only
  - KYC: KYC_ANALYST + LEADERSHIP only
  - TM: TM_ANALYST + LEADERSHIP only
  - Audit: LEADERSHIP only
  - Currently: frontend-only enforcement — anyone with a token can call any API
  - Effort: ~2 hours

- [ ] **Verify FRESHDESK_KEY in Railway is not truncated**
  - Railway → Variables → `FRESHDESK_KEY` — compare to full key from 1Password
  - If truncated: re-paste full key
  - Why: Dashboard Freshdesk count = 0; Support portal = 30 (key length mismatch)

- [ ] **Persistent audit trail**
  - Configure Railway Volume mounted at `/app/server/`
  - OR: migrate `audit.db` to Railway-hosted Postgres
  - Why: `audit.db` currently resets on every redeploy — compliance requirement to preserve

### HIGH (before launch, not blocking)

- [ ] **Set up UptimeRobot monitoring**
  - URL: `https://vigia-production-5a0a.up.railway.app/api/health`
  - Alert: email + Slack webhook → #vigia-compliance
  - Time: 15 minutes

- [ ] **Subscribe to Railway deployment failure notifications**
  - Railway → Project → Settings → Notifications

- [ ] **Confirm all support team emails in employees.js**
  - Get launch list from support lead → verify each email
  - Add missing → commit → push

---

## Week of May 26–30 — User Acceptance Testing

### Early User Tests (invite 2–3 agents before June 1)

| Tester | Date | Pass/Fail | Notes |
|---|---|---|---|
| _____________ | _____ | | |
| _____________ | _____ | | |
| _____________ | _____ | | |

### Test script

Each tester should:
1. Log in with `@airtm.io` email ✓/✗
2. Open Support portal ✓/✗
3. Click a ticket from the queue ✓/✗
4. Read VIGÍA analysis ✓/✗
5. Use "Send & Close" on a low-risk ticket ✓/✗
6. Use "Escalate" on a medium/high ticket ✓/✗
7. Search a known account in Account Search ✓/✗
8. Report anything confusing or broken

### Compliance team integration test

- [ ] **Zaid** — all 6 portals as LEADERSHIP, verify data accuracy
- [ ] **Paula / Erika** — KYC portal, try a real pending application
- [ ] **Omar** — Fraud portal, try a real AR case
- [ ] **Melanie** — TM portal, try a real alert

### Integration verification

- [ ] Freshdesk queue loading (>0 tickets in Support)
- [ ] Jira cases loading (>0 in Fraud)
- [ ] Persona applications loading (>0 in KYC)
- [ ] ClickHouse alerts loading (>0 in TM)
- [ ] VIGÍA analysis runs without error
- [ ] Send & Close resolves ticket in Freshdesk
- [ ] Escalate creates audit log entry

---

## May 31 — Final Go/No-Go

### Go criteria (all must be ✅ before launch)

- [ ] API-level role enforcement live
- [ ] FRESHDESK_KEY verified (Dashboard shows >0 tickets)
- [ ] Audit trail persisted (confirmed with test: deploy → check data still there)
- [ ] UptimeRobot alert active
- [ ] All support team emails in whitelist
- [ ] At least 2 early users confirmed it works
- [ ] Zaid has done a full portal walk-through
- [ ] `VIGIA_PRODUCTION_RUNBOOK.md` shared with team
- [ ] `SUPPORT_TEAM_TRAINING.md` shared with support lead
- [ ] `VIGIA_REFERENCE_CARD.md` pinned in #vigia-compliance

### Known non-blockers (not holding up launch)

- Google OAuth not configured — email login works fine
- KYC country shows "Unknown" — detail view works
- Fraud case shows UUID — cosmetic issue
- Kount integration pending — not in current portal scope

---

## June 1 — Launch Day

- [ ] Post in #vigia-compliance:
  ```
  🚀 VIGÍA Compliance Portal is live!
  
  URL: https://vigia-production-5a0a.up.railway.app
  Login: your @airtm.io email
  
  Support team: Training guide is pinned above.
  Compliance team: Your portals are active.
  
  Questions → tag @vigia or @Zaid
  ```
- [ ] Pin SUPPORT_TEAM_TRAINING.md link in #vigia-compliance
- [ ] Pin VIGIA_REFERENCE_CARD.md in support team channel
- [ ] Monitor #vigia-compliance all day for issues
- [ ] Check Railway logs every 2 hours on launch day

---

## Post-Launch (Week of June 1–7)

- [ ] First audit log review (Zaid — Friday June 6)
- [ ] Collect support team feedback (Slack poll or Google Form)
- [ ] Top ticket categories → improve VIGÍA suggestions
- [ ] Patch any week-1 issues
- [ ] Schedule Google OAuth setup

---

## Ongoing

| Source | Reviewer | Cadence |
|---|---|---|
| #vigia-compliance mentions | CKE | Daily |
| Audit log (escalation patterns) | Zaid | Weekly |
| Support team feedback | Zaid + support lead | Weekly |
| Railway logs / errors | CKE | On-demand |

---

*June 1 Launch Checklist v1.0 | CKE — Compliance Kinetic Extension*  
*Authorized: Zaid Khan (U087TL6CGNM) | Created: 2026-05-19*
