# VIGÍA Monitoring & Observability Setup
**Version:** 1.0 | **Date:** 2026-05-19  
**Authorized by:** Zaid Khan (U087TL6CGNM)

---

## Overview

Three things to monitor:
1. **Uptime** — Is the portal reachable?
2. **Data sources** — Are ClickHouse, Jira, Freshdesk, Persona responding?
3. **Usage & errors** — Who's using it, what's failing?

---

## 1. Uptime Monitoring

### Option A: UptimeRobot (Free, recommended)

1. Go to uptimerobot.com → Create account
2. Add monitor:
   - Type: `HTTP(s)`
   - URL: `https://vigia-production-5a0a.up.railway.app/api/health`
   - Interval: `5 minutes`
   - Alert contacts: `zaid@airtm.io` + Slack webhook to #vigia-compliance
3. Expected response: `{"status":"ok"}`
4. Alert if: not `200` OR body doesn't contain `"status":"ok"`

Setup time: ~15 minutes.

### Option B: CKE Heartbeat (already running, zero cost)

Add to `HEARTBEAT.md`:
```
- Check Vigía portal health: curl https://vigia-production-5a0a.up.railway.app/api/health
  - Alert Zaid if status != "ok" or any service down
```

Detection latency ~30 min. Good complement to UptimeRobot.

### Option C: Railway built-in

Railway shows deployment health in Deployments tab → View Logs. Manual check only, no active alerting.

---

## 2. Data Source Monitoring

### Health check

```bash
curl -s https://vigia-production-5a0a.up.railway.app/api/health | python3 -m json.tool
```

| Source | Healthy | Failure |
|---|---|---|
| ClickHouse | `"clickhouse":"ok"` | `"clickhouse":"error"` |
| Jira | `"jira":"ok"` | `"jira":"error"` |
| Freshdesk | `"freshdesk":"ok"` | `"freshdesk":"error"` |
| Persona | `"persona":"ok"` | `"persona":"error"` |

---

## 3. Error Tracking

### Railway Logs

All server errors → Railway logs:
1. railway.app → Vigia → Deployments → View Logs
2. Filter for: `ERROR` | `500` | `timeout`

Common error patterns to watch:

| Pattern | Cause | Fix |
|---|---|---|
| `ClickHouse timeout` | Slow query or CH down | Check CH status separately |
| `Jira 401` | Token expired | Refresh `JIRA_TOKEN` in Railway |
| `Anthropic rate limit` | Too many analysis requests | Back off, retry in ~60s |
| `FRESHDESK 429` | Rate limited (40 req/min) | Reduce request frequency |

---

## 4. Usage Analytics

Every portal action is logged to `server/audit.db`. Access via `/audit` tab (LEADERSHIP only).

Weekly metrics to review:

| Metric | Why |
|---|---|
| Tickets closed / week | Support team activity |
| Escalations / week | Compliance workload |
| VIGÍA analysis runs / day | Usage health |
| Time to close (open → close) | SLA compliance |
| Top error types | What needs fixing |

---

## 5. Performance Baselines

From the 2026-05-19 production evaluation:

| Metric | Baseline | Alert threshold |
|---|---|---|
| Health check | <100ms | >2s |
| Portal page load | <3s | >8s |
| API calls | <2s | >5s |
| Dashboard (250 cases) | <2s | >5s |
| VIGÍA analysis (Claude) | <10s | >30s |

---

## 6. Monitoring Roadmap

*Before June 1:*
- [ ] Set up UptimeRobot on `/api/health`
- [ ] Add CKE heartbeat check
- [ ] Zaid subscribes to Railway deployment notifications

*Week 1 post-launch:*
- [ ] First weekly audit log review
- [ ] Watch Railway logs for recurring errors
- [ ] Identify top support ticket categories

*Month 1:*
- [ ] Slack webhook from Railway on deploy failures
- [ ] Basic usage dashboard (tickets, escalations, analysis runs)

*Quarter 1:*
- [ ] Persistent audit trail (Railway volume or external DB)
- [ ] Formal SLA tracking
- [ ] Backend API-level role enforcement

---

## 7. Incident Response

### Portal down

1. Check Railway logs for errors
2. If deployment failed → Roll back in Railway (Deployments → previous build → Redeploy)
3. If env var missing → Add in Variables → auto-redeploys
4. If external source (ClickHouse, Jira) down → Portal degrades gracefully; notify team to use source systems directly
5. Post in #vigia-compliance: `"VIGÍA portal temporarily down. Use [Freshdesk/Jira] directly. Restoring now."`

### Data wrong or stale

1. Check Dashboard last-updated timestamp
2. Force refresh: `POST /api/dashboard/refresh`
3. If genuinely stale upstream: check ClickHouse or Jira
4. Tag @vigia for investigation

### User locked out

1. Verify email in `server/employees.js`
2. If not found: add entry, commit to main, push → deploys in ~2 minutes
3. If email changed: update existing entry

---

*VIGÍA Monitoring Setup v1.0 | CKE — Compliance Kinetic Extension*  
*Authorized: Zaid Khan (U087TL6CGNM) | 2026-05-19*
