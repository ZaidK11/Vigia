# VIGÍA — AI Compliance Engine
## Executive Brief | May 2026
**Prepared for:** Laura Seamon, Ruben Galindo, and Leadership  
**Prepared by:** Zaid Khan, Head of Compliance  
**Classification:** Internal / Leadership Only

---

## What We Built and Why

Airtm's compliance team reviews hundreds of fraud alerts, KYC applications, and suspicious transaction cases every month. Each one requires an analyst to pull data from multiple systems, assess risk, write a narrative, and log a decision — manually, every time.

In February 2026, we began building VIGÍA: an AI compliance engine that does the data-gathering, pattern recognition, and initial analysis automatically — so our analysts spend their time on judgment, not logistics.

Today, VIGÍA is live.

---

## Where We Are Today

VIGÍA is a fully operational compliance intelligence portal used by four teams: Support, Fraud Investigation, KYC, and Transaction Monitoring. It is also available to compliance leadership as a direct AI interface.

**What it does right now:**

When an analyst opens a fraud case, VIGÍA pulls the transaction history, risk scores, blockchain screening results, and customer support history — from five separate systems — and presents a structured analysis in under 10 seconds. The analyst reads it, makes the decision, and logs it. The decision is permanently recorded in an immutable audit trail.

The same workflow applies to KYC reviews, TM alerts, and support escalations. Each team sees only what they need for their role. Every action is tracked.

**Systems connected:**
- ClickHouse (Airtm's transaction data warehouse)
- Jira (case management)
- Freshdesk (customer support history)
- Persona (KYC identity verification)
- Elliptic (blockchain / crypto risk screening)
- Kount (device and behavioral fraud scoring)
- Google Drive (policy and audit document storage)

**Audit compliance:** Every decision VIGÍA informs is logged with a timestamp, analyst name, case ID, and reasoning chain. This satisfies BSA 5-year recordkeeping requirements and creates an auditor-ready evidence trail.

---

## The Business Problem We're Solving

Our compliance team is growing in responsibility faster than headcount. Crowe identified gaps in 2024 and 2025 — not because our people aren't capable, but because the manual workload makes full coverage impossible at scale.

VIGÍA's purpose is not to replace analysts. It is to give each analyst the throughput of three — by eliminating the time they spend gathering data, cross-referencing systems, and writing boilerplate documentation.

**Current analyst capacity (pre-VIGÍA):**
- Support: 12–15 cases/day per analyst
- Fraud: 3–5 investigations/day
- KYC: 4–6 applications/day
- TM: 2–3 alerts/day

**Target capacity (with VIGÍA, by September 2026):**
- Support: 20–25 cases/day (+60%)
- Fraud: 6–8 investigations/day (+80%)
- KYC: 8–12 applications/day (+100%)
- TM: 5–7 alerts/day (+100%)

This is not a projection based on theory. It is based on time-motion analysis of where analyst time actually goes today: approximately 60% of it is data retrieval and documentation. VIGÍA eliminates that 60%.

---

## The Roadmap: What Happens Next

We are operating on a 4-phase plan. Phases 0 and 1 are complete. We are entering Phase 2 now.

**Phase 1 — Build the Engine (Complete)**  
All data connections are live. The portal is operational. Every team can access VIGÍA-powered analysis today. The final step is permanent hosting, which requires platform credentials from IT — a 2-week task.

**Phase 2 — Pattern Analysis (June 8–22)**  
VIGÍA analyzes 759 historical Jira cases, Freshdesk ticket history, and 18 months of ClickHouse transaction data to identify which case types are consistently low-risk and safely automatable. We will produce three specific automation rules with documented accuracy projections before proceeding to piloting.

**Phase 3 — Controlled Pilot (June 22 – July 20)**  
We enable automation for the lowest-risk 5–10% of cases. An analyst sees every automated decision and can override at any time. We measure accuracy daily. If accuracy stays above 90%, we expand. If it drops below 90%, we pause and recalibrate. Analysts are always in control.

**Phase 4 — Production Automation (July 20 – September 2026)**  
Based on validated pilot results, we scale automation to 40–60% of routine cases across all four teams. The remaining 40–60% continue with full human review — these are the judgment calls, edge cases, and escalations where analyst expertise is irreplaceable.

**Estimated productivity value by September 2026:** Approximately $137,000–$200,000 annually in analyst hours freed for higher-value work, with zero additional headcount and no new system licenses required.

---

## Risk and Compliance Posture

VIGÍA does not make final compliance decisions. It never will. Every automated or AI-assisted action is reviewed by a human analyst before it affects a customer account. This is the Human-in-the-Loop (HITL) model — the standard for responsible AI in regulated financial services.

The audit trail is immutable and complete. If a regulator or external auditor asks what happened in a case, we can produce the full record: who reviewed it, what data was considered, what VIGÍA recommended, what the analyst decided, and when.

VIGÍA's automation rules will be formally approved by compliance leadership before activation. They will be documented, tested against historical data, and monitored continuously. Any rule with accuracy below 90% is automatically suspended.

---

## What We Need to Move Forward

Three things are blocking the transition from Phase 1 to Phase 2:

**1. Permanent hosting credentials**  
VIGÍA currently runs on the compliance Mac Studio. To operate continuously and enable the learning loop, it needs a permanent cloud environment. Cost: approximately $0 on a free tier (Railway, Render, or Fly.io). Action owner: IT / Aldo. Timeline: this week.

**2. Google SSO setup**  
To give Airtm employees single sign-on access using their @airtm.io Google accounts, we need a Google OAuth client credential. Cost: $0. Action owner: IT. Timeline: this week.

**3. Team adoption starting June 1**  
The learning loop depends on analysts actually using the portal. Every approved or rejected recommendation is a data point that improves future accuracy. Usage is the critical path. Action owner: Zaid, team leads. Timeline: June 1 briefing to all four teams.

---

## Honest Assessment

We are 3–4 months ahead of where we expected to be in May 2026.

The hardest part — connecting the data, building the analysis engine, designing the workflows — is done. What remains is operational: getting teams to use the tool daily, giving the system enough feedback to set accurate automation thresholds, and moving it to a permanent environment.

The original roadmap projected production automation by January 2027. Based on actual progress, our revised estimate is September 2026 — if team adoption starts in June and the hosting credentials are provided this month.

The technology is ready. The data is there. The audit framework is in place.

The constraint now is organizational, not technical.

---

*VIGÍA is the compliance infrastructure Airtm needs to maintain audit readiness, meet BSA obligations, and scale oversight without scaling headcount. The foundation is built. The next step is using it.*

---

**Next actions:**
| Action | Owner | By When |
|--------|-------|---------|
| Provide cloud hosting credentials | IT / Aldo | May 22 |
| Set up Google SSO | IT | May 22 |
| Brief all four compliance teams on portal | Zaid | June 1 |
| Phase 2 analysis kickoff | VIGÍA / Zaid | June 8 |
| Phase 3 pilot approval | Laura / Zaid | June 22 |
