# VIGÍA Portal — Deployment Guide

## Production URL
Set after Railway deployment (update this file once live)

## Architecture
- **Backend:** Node.js 18 + Express (server/)
- **Frontend:** React + Vite + Tailwind (client/) — pre-built into server/public/
- **Deployment:** Railway (Docker, auto-deploy on push to main)
- **Auth:** Email whitelist + Google SSO (@airtm.io domain only)

## GitHub
- Repo: `ZaidK11/Vigia`
- Branch: `main`
- Auto-deploys on every push

## Railway Environment Variables (required)
Set these in Railway Dashboard → Variables tab:

```
# Jira
JIRA_BASE_URL=https://airtech.atlassian.net
JIRA_EMAIL=zaid@airtm.io
JIRA_TOKEN=<from 1Password: openclaw-jira-api-token>

# Freshdesk
FRESHDESK_BASE_URL=https://airtm.freshdesk.com/api/v2
FRESHDESK_KEY=<from 1Password: vigia-freshdesk-api-key>

# ClickHouse
CLICKHOUSE_HOST=https://data-lake.galar.data.airtm.com
CLICKHOUSE_USER=ruben
CLICKHOUSE_PASSWORD=<from 1Password: vigia-clickhouse>

# Anthropic (Claude)
ANTHROPIC_API_KEY=<from 1Password: vigia-anthropic-api-key>
CLAUDE_MODEL=claude-sonnet-4-5

# Persona
PERSONA_BASE_URL=https://withpersona.com/api/v1
PERSONA_API_KEY=<from 1Password: vigia-persona-api-key>

# Elliptic
ELLIPTIC_API_KEY=<from 1Password: vigia-elliptic-api-key>

# Google OAuth (create in Google Cloud Console)
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=https://<your-railway-url>/auth/google/callback

# Session
SESSION_SECRET=<generate a random 64-char string>

# Runtime
NODE_ENV=production
PORT=3000
```

## Test Accounts
| Email | Role | Portals |
|---|---|---|
| `zaid.khan@airtm.io` | LEADERSHIP | All 6 portals |
| `melanie.suckau@airtm.io` | TM_ANALYST | TM + Support |
| `omar.isea@airtm.io` | FRAUD_INVESTIGATOR | Fraud + Support |
| `jose.crespo@airtm.io` | KYC_ANALYST | KYC + Support |
| `alexis.vicente@airtm.io` | SUPPORT_ANALYST | Support only |

## Google OAuth Setup
1. Go to https://console.cloud.google.com
2. Create project → Enable Google+ API
3. Credentials → OAuth 2.0 Client ID → Web Application
4. Authorized origins: `https://<railway-url>`
5. Authorized redirect URIs: `https://<railway-url>/auth/google/callback`
6. Copy Client ID + Secret → add to Railway env vars

## Portals
1. `/support` — Support Portal (search customers, generate responses)
2. `/fraud` — Fraud Investigation (case queue, SAR narratives)
3. `/kyc` — KYC Applications (approve/reject with reason codes)
4. `/tm` — TM Alerts (SAR deadlines, investigations)
5. `/leadership` — Leadership Overview (stats + VIGÍA chat)
6. `/dashboard` — Case Queue Dashboard (all open cases, due dates, urgency)

## Support Team Launch
June 1, 2026

## Dashboard Cron Job
Updates every 30 minutes automatically. Sources:
- Freshdesk (Support tickets)
- Jira KS project (KYC cases)
- Jira AR project (TM/SAR alerts)
- Jira COM project (Escalations)
- Elliptic sanctions matches (via ClickHouse)
