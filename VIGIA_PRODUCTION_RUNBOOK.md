# ⚖️ VIGÍA Compliance Portal — Production Runbook

**Version:** 1.0 | **Last updated:** 2026-05-19  
**Authorized by:** Zaid Khan (U087TL6CGNM)  
**Portal URL:** https://vigia-production-5a0a.up.railway.app  
**Policy:** POL-BSA-001-v4.2 | EWRA-06A/B, EWRA-20, EWRA-23

---

## 1. What VIGÍA Is

VIGÍA is Airtm's internal compliance portal. It bridges raw data from ClickHouse, Jira, Freshdesk, and Persona with the compliance team's daily workflows. It is not an autonomous system — it surfaces data, generates analysis, and logs decisions. Every decision belongs to a human analyst.

**6 portals:**

| Portal | URL path | Who uses it |
|---|---|---|
| Support | `/support` | All roles |
| Fraud | `/fraud` | FRAUD_INVESTIGATOR + LEADERSHIP |
| KYC | `/kyc` | KYC_ANALYST + LEADERSHIP |
| TM Alerts | `/tm` | TM_ANALYST + LEADERSHIP |
| Leadership Overview | `/leadership` | LEADERSHIP only |
| Case Queue Dashboard | `/dashboard` | All roles |

---

## 2. Production Architecture

```
Railway App: vigia-production-5a0a.up.railway.app
│
├── server/            Express.js (Node 18, port 3000)
│   ├── index.js       Entry point — auth middleware + routes
│   ├── employees.js   136-employee whitelist + role mapping
│   ├── routes/        support, fraud, kyc, tm, dashboard, audit
│   └── jobs/          updateDashboard.js (cron: :00 + :30 every hour)
│
└── client/            React + Vite + Tailwind (served as static from server/public/)
```

**Deployment:** Auto-deploys from `ZaidK11/Vigia` `main` branch via Railway GitHub integration.

**Data sources:**

| Source | What it feeds | Timeout |
|---|---|---|
| ClickHouse (`data-lake.galar.data.airtm.com`) | TM alerts, user risk, transaction data | 30s |
| Jira (`airtech.atlassian.net`) | Fraud cases (AR), KYC cases (KS), compliance cases (COM) | 15s |
| Freshdesk (`airtm.freshdesk.com`) | Support ticket queue + history | 15s |
| Persona | KYC applications, document status, PEP/sanctions screening | 15s |
| Anthropic Claude | VIGÍA analysis, SAR narratives, suggested responses | 60s |
| Elliptic | Blockchain risk (wired, not yet surfaced in UI) | 15s |

---

## 3. Environment Variables

All secrets live in 1Password vault `sophia-agent-zaid`. Set in Railway Variables tab.

| Variable | Description |
|---|---|
| `CLICKHOUSE_PASSWORD` | ClickHouse DB password |
| `JIRA_TOKEN` | Jira API token (Zaid's account) |
| `FRESHDESK_KEY` | Freshdesk API key ⚠️ verify full key, no truncation |
| `ANTHROPIC_API_KEY` | Claude API key |
| `PERSONA_API_KEY` | Persona production API key |
| `ELLIPTIC_API_KEY` | Elliptic blockchain risk API |
| `SESSION_SECRET` | JWT/session signing secret — do not change in prod |
| `GOOGLE_CLIENT_ID` | Google OAuth (not yet configured) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth (not yet configured) |
| `PORT` | Set to `3000` by Railway automatically |

**To read a secret locally (never print to Slack/terminal in shared sessions):**
```bash
op read "op://sophia-agent-zaid/vigia-freshdesk-api-key/password"
```

**To verify env vars are set in Railway:** railway.app → Vigia project → Variables tab.

---

## 4. Health Check

```bash
curl https://vigia-production-5a0a.up.railway.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-05-19T...",
  "services": {
    "clickhouse": "ok",
    "jira": "ok",
    "freshdesk": "ok",
    "persona": "ok"
  }
}
```

A non-`"ok"` service means that data source is unreachable. Portal degrades gracefully (empty list) rather than error.

---

## 5. Login & Role Assignment

| Who | Role | Portals |
|---|---|---|
| `zaid@airtm.io`, `laura@airtm.io` | LEADERSHIP | All 6 |
| `omar@airtm.io` | FRAUD_INVESTIGATOR | Fraud + Support + Dashboard |
| `paula@airtm.io`, `erika@airtm.io` | KYC_ANALYST | KYC + Support + Dashboard |
| `melanie@airtm.io` | TM_ANALYST | TM + Support + Dashboard |
| All other `@airtm.io` | SUPPORT_ANALYST | Support + Dashboard |
| Non-`@airtm.io` | BLOCKED | None |

Role whitelist is in `server/employees.js`. To add a user: edit the file, commit to `main`, Railway auto-deploys.

**To add a user:**
```javascript
// In server/employees.js, add to EMPLOYEES array:
{ email: 'newperson@airtm.io', name: 'New Person', role: 'SUPPORT_ANALYST' }
```
Commit + push → production updates in ~2 minutes.

---

## 6. Dashboard Cron (Case Queue)

The Case Queue Dashboard (`/dashboard`) runs on an in-memory cache refreshed by a cron job:

- **Schedule:** Every hour at :00 and :30
- **Sources:** Freshdesk (support), Jira KS (KYC), Jira AR (TM/Fraud)
- **Cache TTL:** 35 minutes (serves stale while refresh runs)
- **Manual refresh:** Click "↻ Refresh" in the Dashboard UI, or:
  ```bash
  curl -X POST https://vigia-production-5a0a.up.railway.app/api/dashboard/refresh \
    -H "Authorization: Bearer <token>"
  ```

If Dashboard shows stale data >40 min, restart the Railway service (Deploy tab → Restart).

---

## 7. Audit Trail

Every portal action is logged to SQLite:

- **Location:** `server/audit.db`
- **Schema:** `timestamp | user_email | role | portal | action | case_id | decision | detail`
- **Immutable:** INSERT-only — no updates, no deletes
- **Access:** `/audit` tab (LEADERSHIP role)

⚠️ **Railway does not persist files between deploys by default.** Configure a Railway Volume mounted at `/app/server/` to persist `audit.db` across deployments. This is the top infrastructure item for the post-launch sprint.

---

## 8. Deploying Code Changes

1. Make changes in `vigia-portal/`
2. Build frontend: `cd vigia-portal/client && npm run build` (output → `server/public/`)
3. Commit and push:
   ```bash
   cd /Users/clawbot/.openclaw-state-vigia/workspace
   GH_TOKEN=$(op read "op://sophia-agent-zaid/igudehxtzgpr7sybmginfmpdby/token")
   git add vigia-portal/
   git commit -m "feat: <description>"
   git push https://ZaidK11:$GH_TOKEN@github.com/ZaidK11/Vigia.git main
   ```
4. Railway auto-deploys in ~90 seconds
5. Verify: `curl https://vigia-production-5a0a.up.railway.app/api/health`

---

## 9. Troubleshooting

### Portal shows blank / white screen
- Check Railway logs: railway.app → Vigia → Deployments → View Logs
- Usually a missing env var — look for `undefined` in startup logs
- Fix: add the variable in Railway Variables → redeploy

### "Failed to load [Fraud/KYC/TM] cases"
- A data source is down or credentials expired
- Check the health endpoint to identify which service
- For Jira: tokens expire — refresh `JIRA_TOKEN` in Railway from 1Password
- For Freshdesk: verify `FRESHDESK_KEY` is full key (not truncated)
- For ClickHouse: check 30s timeout — slow queries cause failures

### "Unauthorized" on login
- User email is not in `server/employees.js`
- Add them (Section 5), commit, push

### VIGÍA Analysis spins forever or errors
- Anthropic API key issue or rate limit
- Check `ANTHROPIC_API_KEY` in Railway Variables
- User can refresh and retry — Claude streaming occasionally stalls

### Dashboard shows 0 cases
- Cron may not have run yet — click "↻ Refresh"
- Freshdesk = 0 specifically: check `FRESHDESK_KEY` in Railway for truncation

### Send & Close fails
- Freshdesk API key expired or wrong
- User fallback: use "📋 Copy" and update Freshdesk manually
- Fix: rotate key, update `FRESHDESK_KEY` in Railway

### Railway deploy fails
- Check build logs for npm install errors
- Common cause: `package-lock.json` out of sync
- Fix: run `npm install` locally, commit updated lockfile, push

---

## 10. Known Limitations (Post-Launch Sprint)

| Issue | Severity | Fix |
|---|---|---|
| API-level role enforcement missing | HIGH | Add `requireRole()` middleware to backend routes |
| Audit trail resets on redeploy | HIGH | Configure Railway persistent volume |
| Google OAuth not configured | MEDIUM | Create Google Cloud project, add client ID/secret |
| Dashboard Freshdesk count = 0 | MEDIUM | Verify `FRESHDESK_KEY` not truncated in Railway |
| KYC country shows "Unknown" | LOW | Pre-load from Jira KS project |
| Fraud case shows UUID | LOW | Add display name lookup layer |

---

## 11. Contacts & Escalation

| Issue | First call | Escalate to |
|---|---|---|
| Portal down | @vigia in #vigia-compliance | Zaid → Aldo (VP Engineering) |
| Data wrong / stale | @vigia in #vigia-compliance | Zaid |
| Railway infrastructure | Zaid (has Railway access) | Aldo Minutti |
| 1Password secrets | Zaid | — |
| Compliance decision concerns | Analyst → Zaid | Zaid → Laura (CLO) |

---

## 12. Quick Reference

```
Production URL:    https://vigia-production-5a0a.up.railway.app
GitHub repo:       github.com/ZaidK11/Vigia (branch: main)
Railway project:   Vigia (auto-deploy on push to main)
Health check:      GET /api/health
Secrets vault:     sophia-agent-zaid (1Password)
Audit log:         /audit tab (Leadership only)
Dashboard refresh: POST /api/dashboard/refresh
Cron schedule:     :00 and :30 every hour
Support:           @vigia in #vigia-compliance
```

---

*VIGÍA Production Runbook v1.0 | CKE — Compliance Kinetic Extension*  
*Authorized: Zaid Khan (U087TL6CGNM) | Built: 2026-05-19*
