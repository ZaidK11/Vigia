# VIGÍA Support Team Training Guide
**Version:** 1.0 | **Date:** 2026-05-19 | **Launch:** June 1, 2026  
**Portal:** https://vigia-production-5a0a.up.railway.app

---

## Welcome to VIGÍA

When a customer contacts Airtm support, VIGÍA is your first stop. It pulls everything we know about the account — ticket history, KYC status, risk score, recent transactions — and gives you a suggested response in under 3 seconds. You review it, edit if needed, and close the ticket. That's the whole workflow.

VIGÍA doesn't make compliance decisions. It gives you the picture. You decide.

---

## Module 1: Getting In

### Logging In

1. Go to: `https://vigia-production-5a0a.up.railway.app`
2. Enter your `@airtm.io` email address
3. Click **Sign In**

No password for now — SSO is coming. Just your Airtm email.

> *If you see "Not on the Airtm employee whitelist"* — ping Zaid or your manager. Your email needs to be added.

### What You'll See First

The **Portal Selector** — cards for each portal. As a Support Analyst, you have access to:
- 🎟️ **Support** — your main workspace
- 📊 **Case Queue Dashboard** — the full case view

Click **Support** to start.

---

## Module 2: The Support Portal Workflow

This is your daily loop.

### Step 1: The Queue

The left panel shows all open Freshdesk tickets, sorted by urgency.

- 🟠 **Orange border** = ticket open >3 hours — handle these first
- **Time badge** = how long the ticket has been open
- **Subject** = the customer's question

Click any ticket to open it.

### Step 2: The Detail Panel

The right panel shows:

*Ticket Info*
- Customer name, email
- Subject and status
- How long it's been open

*Conversation History*
- Last 10 messages from the customer

*Vigía Analysis (auto-loads)*
- Risk level: 🟢 LOW / 🟡 MEDIUM / 🔴 HIGH
- Category: FAQ | KYC_VERIFICATION | TRANSACTION_ISSUE | FRAUD_SIGNAL | etc.
- What VIGÍA detected about the account
- A suggested response

### Step 3: Review the Suggested Response

VIGÍA drafts a response based on the ticket content and what it knows about the account.

Before sending:
- Read it
- Does it actually answer the customer's question?
- Click **Edit response** if anything needs changing

### Step 4: Take Action

| Button | What it does | When to use |
|---|---|---|
| ✅ **Send & Close** | Sends response + marks ticket Resolved in Freshdesk | Routine cases you're confident about |
| 📋 **Copy** | Copies to clipboard | If you want to paste manually in Freshdesk |
| 🚨 **Escalate to Compliance** | Flags for compliance team review | Any HIGH risk, fraud signal, or uncertainty |

> *Rule of thumb:* If you're unsure, escalate. You can't make a compliance mistake by escalating. You can make one by closing a case you shouldn't.

### Step 5: Done

After **Send & Close**, the ticket disappears from your queue. VIGÍA logs the action automatically.

---

## Module 3: Reading Vigía Analysis

### Risk Levels

| Level | What it means | Your action |
|---|---|---|
| 🟢 **LOW** | Normal customer question, no flags | Suggested response is probably fine as-is |
| 🟡 **MEDIUM** | KYC issue, pending verification, minor concern | Read carefully, may need account lookup |
| 🔴 **HIGH** | Fraud signal, sanctions flag, suspicious pattern | Click **Escalate** — do not close |

### Alert Banners

| Banner | Meaning |
|---|---|
| ⏱️ **3-Hour Clock Breached** | Ticket has been open too long — regulatory requirement to act |
| 🚨 **Vigía Escalation Recommended** | Compliance must review before closure |
| 🔍 **Similar Cases Found** | Related tickets in Freshdesk for context |

---

## Module 4: Account Search

Click **🔍 Account Search** in the header to look up any account directly.

Enter:
- Email address: `customer@email.com`
- UUID: `usr_xxxxxxxxxxxxxxxx`

VIGÍA returns: account status, KYC tier, risk score, recent activity, ticket history.

Use this when a customer contacts you from a different email than their account, or when you need more context.

---

## Module 5: The Case Queue Dashboard

Click **📊 Dashboard** in the header.

*Stats cards:* Open Cases | Due Today | Overdue | Sources

*Filter tabs:* All | Support | KYC | TM | Fraud | Escalations | Overdue | Due Today

*Table:*
- Sortable columns (click headers)
- Color-coded rows: red = overdue, amber = due today
- Click any row for case details

Dashboard auto-refreshes every 30 seconds.

---

## Module 6: Common Scenarios

### Customer can't send money
1. Open ticket → check VIGÍA Analysis for account status flags
2. Common causes: limit hit, KYC pending, compliance hold
3. Use suggested response, or escalate if compliance hold (🔴 HIGH)

### Customer can't verify their identity
1. VIGÍA will classify as `KYC_VERIFICATION` or `MEDIUM`
2. Check what step they're stuck on
3. If verification was rejected for compliance reasons → escalate, don't explain the rejection

### Customer thinks they were wrongly blocked
1. VIGÍA may show 🔴 HIGH
2. Do NOT promise to unblock anyone
3. Escalate — these decisions are not Support's to make
4. Tell them: "I've escalated your account for review and our team will be in touch."

### Customer reports fraud on their account
1. Always 🚨 Escalate
2. You are routing the report, not investigating
3. Acknowledge, reassure, and escalate

---

## Module 7: What to Remember

*VIGÍA is:*
- A data aggregator and suggestion engine
- An audit trail for every action
- A compliance signal detector

*VIGÍA is not:*
- A compliance decision-maker
- Infallible — it can misclassify, always use your judgment

*The escalation rule:*
> When in doubt, escalate.

*PII:*
- VIGÍA doesn't show raw PII in support view
- Do not share customer account details outside Airtm systems

---

## Quick Reference

```
Portal URL:     https://vigia-production-5a0a.up.railway.app
Login:          @airtm.io email
Main workflow:  Queue → Ticket → Review → Send & Close or Escalate
High risk:      Always escalate
Doubt:          Always escalate
Help:           Tag @vigia in #vigia-compliance
```

---

## Troubleshooting

| Problem | What to do |
|---|---|
| Queue shows 0 tickets | Click ↻ Refresh. If still 0, check Freshdesk directly |
| "Freshdesk unavailable" | Backend issue — tag @vigia or Zaid in Slack |
| Send & Close fails | Use 📋 Copy, paste manually in Freshdesk, alert Zaid |
| Login blocked | Ping your manager — email needs whitelisting |
| VIGÍA analysis stuck spinning | Refresh the page and reselect the ticket |
| Analysis says "GENERAL_INQUIRY" on complex case | Manual review — use your judgment |

---

*VIGÍA Support Team Training Guide v1.0*  
*Built by CKE — Authorized by Zaid Khan (U087TL6CGNM) — 2026-05-19*
