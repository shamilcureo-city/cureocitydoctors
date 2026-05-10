# Observability

How we know the system is healthy and how we get paged when it isn't.

## Stack

| Layer | Tool | What we capture |
|---|---|---|
| Client error monitoring | Sentry (`@sentry/react`) | JS exceptions, breadcrumbs of every audit event, user/org tags |
| Server logs | Vercel Functions log retention | Console output from `/api/*` endpoints |
| Audit trail | Supabase `audit_log` table | Every clinical action with `kb_version`, `consultation_id`, `org_id` |
| AI cost tracking | Supabase `ai_calls` table | Tokens, cost INR, latency for every Gemini/Claude call |
| Cost guardrail | `api/_lib/budgetCheck.js` | 429 when org hits `daily_ai_cost_cap_inr` |
| Product analytics | PostHog | Funnel + retention metrics (no PHI) |

## Sentry — what flows through

**Breadcrumbs** are added automatically for every `logEvent()` call (auth, consult lifecycle, engine actions, AI calls, alerts). Free-text payload fields (`rawInput`, `corpus`, `transcript`, `caseSummary`, `phone`, `name`, `email`, `comorbid`, `history`) are auto-redacted by `beforeBreadcrumb`. So when an exception fires, the Sentry issue shows the doctor's last ~100 actions without leaking patient data.

**Captured exceptions** are tagged with:
- `area`: `ai.intake.extract` / `ai.reasoning` / `engine` / `db.*`
- `op`: specific operation (`gap.fill`, `lab.update`, `drug.add`, etc.)
- `provider`: `gemini` / `anthropic` / `regex`
- `level`: `error` / `warning`

**User context**: opaque `auth.uid()` only. No email, name, or PHI.

**Org context** (set in Phase 2 when org-loading lands): `org_id` and `org_type` as tags so issues can be filtered per clinic.

## Recommended Sentry alert rules

Set these in Sentry → **Alerts** → **Create Alert Rule**:

### P0 — wake me up
| Condition | Action |
|---|---|
| Issue affects ≥ 5 users in 1 hour | Email + push notification |
| Any issue tagged `area:engine` and `level:fatal` | Email + push (engine crash = doctor blocked) |
| Issue tagged `area:ai.reasoning` AND has occurred ≥ 10× in 5 min | Email (Claude outage) |

### P1 — daily digest
| Condition | Action |
|---|---|
| New issue type appears for the first time | Email digest |
| Any issue tagged `failureMode:timeout` ≥ 3× in 1 hour | Email |
| Any issue tagged `area:db.*` ≥ 5× in 1 hour | Email (Supabase degradation) |

### P2 — weekly review
| Condition | Action |
|---|---|
| Top 10 issues by frequency | Weekly digest |
| Issues by `org_id` tag | Weekly per-clinic report |

## Cost / budget alerts

The `near_cap` flag (≥80% daily AI spend) is surfaced in API responses and audited as `ai.budget.near_cap`. Hard-block (≥100%) is audited as `ai.budget.blocked` and returns HTTP 429 to the client.

Recommended Sentry alert: any `ai.budget.blocked` event = email immediately. It's a real operational issue (clinic can't operate until midnight IST or budget bump).

For per-org cost dashboards, use Supabase SQL:

```sql
-- Today's AI spend by org (IST day boundary)
select
  o.id, o.name,
  sum(a.cost_inr) as today_spend_inr,
  o.daily_ai_cost_cap_inr,
  count(*) as ai_calls_today
from public.organizations o
join public.org_memberships m on m.org_id = o.id and m.is_active
join public.ai_calls a on a.doctor_id = m.user_id
where a.created_at >= (current_date at time zone 'Asia/Kolkata')::timestamptz
group by o.id, o.name, o.daily_ai_cost_cap_inr
order by today_spend_inr desc;
```

## Audit log queries (for support / medical-legal)

Reconstruct a doctor's full session timeline:
```sql
select ts, type, payload->>'consultation_id' as consult_id
from public.audit_log
where doctor_id = '<uuid>' and ts >= '2026-05-10'
order by ts;
```

Reconstruct a single consultation:
```sql
select ts, type, payload
from public.audit_log
where payload->>'consultation_id' = '<consult-uuid>'
order by ts;
```

Find which KB version was used:
```sql
select id, primary_diagnosis_name, kb_version
from public.consultations
where id = '<consult-uuid>';
```

## On-call SOP (Phase 5 onwards)

1. Incident detected (Sentry alert / customer message / dashboard anomaly)
2. Acknowledge in Sentry within 5 min if P0
3. Triage: client-only? server? Supabase? AI provider?
4. Mitigation:
   - Rollback to previous main commit if recent deploy
   - Bump per-org cost cap if budget-related
   - Manually inspect a few flagged consultations in Supabase
5. Post-incident: write a 1-page memo, add a regression test, file a ticket

## Health check / readiness

A basic synthetic test that hits the public surface every 5 min:
- `GET /` returns 200 with the bundle
- `POST /api/intake/extract` with a known fixture returns differential ID `acs` for the canonical chest-pain case

Set up via UptimeRobot (free) or Vercel's built-in monitoring once on Pro tier.
