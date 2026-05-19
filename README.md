# ⚖️ VIGÍA Compliance Portal

**Version:** 1.0.0 | **Build Date:** 2026-05-14 | **Authorized by:** Zaid Khan (U087TL6CGNM)

VIGÍA Compliance Portal is a 4-team internal tool for Airtm's compliance function. It bridges raw data (ClickHouse, Jira, Freshdesk, Persona) with compliance decision-making — generating pre-formatted commands analysts send to VIGÍA in Slack for analysis, then logging every decision to an immutable SQLite audit trail.

---

## Quick Start

```bash
# 1. Setup (resolves secrets from 1Password, installs deps)
bash setup.sh

# 2. Start backend (Terminal 1)
cd server && npm start

# 3. Start frontend (Terminal 2)
cd client && npm run dev
```

**Portal URL:** http://localhost:5173  
**API URL:** http://localhost:3001

Login with any Airtm employee email — access is controlled by the whitelist in `server/employees.js`.

---

## Architecture

```
vigia-portal/
├── server/              # Express.js backend (port 3001)
│   ├── index.js         # App entry + auth middleware
│   ├── employees.js     # 136-employee whitelist + role mapping
│   ├── routes/
│   │   ├── auth.js      # Login (email whitelist, token-based)
│   │   ├── support.js   # Support portal APIs
│   │   ├── fraud.js     # Fraud investigation APIs
│   │   ├── kyc.js       # KYC review APIs
│   │   ├── tm.js        # Transaction monitoring APIs
│   │   └── auditRoute.js # Audit log read/write
│   └── lib/
│       ├── clickhouse.js # ClickHouse HTTP client (30s timeout)
│       ├── jira.js       # Jira REST client
│       ├── freshdesk.js  # Freshdesk API client
│       ├── persona.js    # Persona API client
│       └── audit.js      # SQLite audit log (better-sqlite3)
│
├── client/              # React + Vite + Tailwind (port 5173)
│   └── src/
│       ├── App.jsx       # Router + auth context
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Support.jsx
│       │   ├── Fraud.jsx
│       │   ├── KYC.jsx
│       │   └── TM.jsx
│       └── components/
│           ├── PortalSelector.jsx  # Home screen
│           ├── CommandBox.jsx      # Copy-to-clipboard VIGÍA command
│           ├── UserCard.jsx        # User info display
│           └── AuditLog.jsx        # Recent decisions
│
├── setup.sh             # One-command setup
└── README.md
```

---

## Portals

| Portal | Role | What it does |
|--------|------|--------------|
| 🎟️ Support | SUPPORT_ANALYST + | Search users by email/UUID, 7 preset investigation queries |
| 🔍 Fraud | FRAUD_INVESTIGATOR + | Load Jira cases, 4 analysis panels, SAR decision logging |
| 🪪 KYC | KYC_ANALYST + | Load Persona applications, document/screening review, approve/reject |
| 📡 TM | TM_ANALYST + | TM alerts from ClickHouse+Jira, SAR Narrative Builder, 3hr clock |

LEADERSHIP role sees all portals + full audit log.

---

## The HITL Workflow

1. **Analyst loads a case/user** in the portal
2. **Portal queries data** from ClickHouse, Jira, Persona, Freshdesk
3. **Portal generates a VIGÍA command** — structured, pre-filled with all relevant data
4. **Analyst copies the command** → pastes in `#vigia-compliance` → tags `@vigia`
5. **VIGÍA analyzes** and responds with risk assessment, pattern type, recommendation + reasoning
6. **Analyst reviews** VIGÍA's response + makes the final decision
7. **Analyst logs decision** via portal buttons → immutably recorded in SQLite

Every decision: Who → What → When → Decision → Details. Defensible under POL-BSA-001-v4.2.

---

## Data Sources

| Source | Used For |
|--------|----------|
| ClickHouse | User profiles, transactions, TM alerts, risk scores |
| Jira | Fraud cases (AR project), compliance cases (COM project) |
| Freshdesk | Support ticket history |
| Persona | KYC application documents, sanctions/PEP screening |

---

## Compliance Anchoring

- **Policy:** POL-BSA-001-v4.2
- **EWRA Coverage:** EWRA-01, EWRA-06A/B, EWRA-08A/B, EWRA-15A/B, EWRA-20, EWRA-23
- **Crowe Findings Addressed:** F3, F6, F7 (audit trail + investigation clock)
- **Audit:** Every action logged to `server/audit.db` (SQLite, immutable)
- **3-Hour Clock:** TM portal surfaces clock alert on every alert above 3 days

---

## Environment Variables (`server/.env`)

| Variable | Source | Description |
|----------|--------|-------------|
| CLICKHOUSE_HOST | 1Password | ClickHouse HTTP URL |
| CLICKHOUSE_USER | Hardcoded | `ruben` |
| CLICKHOUSE_PASSWORD | 1Password | ClickHouse password |
| JIRA_BASE_URL | Hardcoded | `https://airtech.atlassian.net` |
| JIRA_EMAIL | Hardcoded | `zaid@airtm.io` |
| JIRA_TOKEN | 1Password | Jira API token |
| FRESHDESK_BASE_URL | Hardcoded | `https://airtm.freshdesk.com/api/v2` |
| FRESHDESK_KEY | 1Password | Freshdesk API key |
| PERSONA_API_KEY | 1Password | Persona API key |
| ELLIPTIC_API_KEY | 1Password | Elliptic API key (for future use) |
| SESSION_SECRET | Hardcoded | Token signing secret |
| PORT | Default 3001 | Server port |
