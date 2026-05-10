# Pilot Operations Playbook

How we run a 5-clinic, 50-doctor Kerala pilot for 8–12 weeks. Living
document — update with what we learn.

---

## Pre-flight (you do this once)

- [ ] Apply Supabase migration `0003_clinical_concerns.sql`
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` and `VITE_SENTRY_DSN` to Vercel env
- [ ] Sentry alert rules per docs/observability.md
- [ ] Privacy policy v2 published with grievance officer named (docs/privacy-policy.md)
- [ ] DPA template printed for each clinic (docs/dpa-template.md)
- [ ] Indemnity insurance bound (₹2-3L/yr; ICICI Lombard or HDFC Ergo)
- [ ] CDSCO consultant engaged — even if certification is 9 months out
- [ ] Pilot agreement template drafted (60-day free + ₹X/mo after)
- [ ] Razorpay subscription product set up (₹30K/mo for 5-doctor clinic, ₹50K for 6-15)
- [ ] WhatsApp Business API approved with Gupshup or Wati (DLT-registered transactional templates only)

---

## Per-clinic onboarding (5 hours, day-of)

### Pre-visit (the day before)

- [ ] Org owner email captured. Send them the privacy policy + DPA in advance.
- [ ] Create their `organizations` row (type='clinic') and attach them as `org_owner`
- [ ] Reserve their slot in our calendar; ~3 hours on-site

### On-site visit

**Hour 1 — Owner walkthrough**
- [ ] Tour the workflow with the owner: PatientStartCard → Live Consult → Step 7 Rx → Billing CSV
- [ ] Sign DPA + pilot agreement
- [ ] Capture each doctor's MCI/SMC registration number into their profile
- [ ] Set `daily_ai_cost_cap_inr` (default ₹2000 per org; bump to ₹5000 if large clinic)

**Hour 2 — Doctor training (group session, 5 doctors)**
- [ ] 90-second demo video play
- [ ] Live demo: chest-pain ACS case + one common Kerala fever case
- [ ] Each doctor practices once on a fake patient (Practice Mode)
- [ ] Show the consent banner — they must say "patient verbally consented" before recording
- [ ] Show the 🚩 Report Concern button — emphasise: file early, file often
- [ ] Distribute the 1-page TPG-compliant Rx workflow card

**Hour 3 — First real consult, with you watching**
- [ ] Lead doctor sees one real walk-in patient with us in the room
- [ ] We say nothing; just observe + take notes on friction points
- [ ] Debrief at end: what worked, what felt slow, any red flags

### Post-visit

- [ ] WhatsApp support group created (you + the lead doctor + clinic owner)
- [ ] Daily dashboard query saved: today's consults / today's AI spend / today's open concerns

---

## Daily operations (per clinic, first 2 weeks)

You spend ~30 min / clinic / day:

- [ ] Glance at Sentry — any new issues tagged with their `org_id`?
- [ ] Run the SQL: today's open concerns for this org. Triage anything `severity = 'high'` or `'critical'` within 1h
- [ ] Glance at AI spend: are they nearing the daily cap?
- [ ] Reply to WhatsApp questions
- [ ] If any consult ended without a primary diagnosis: ping the doctor — was the AI useful or did they fall back to typing?

---

## Weekly clinical advisor review (every Monday)

Aggregate review of the prior week across all clinics. ~2 hours.

- [ ] Pull all `clinical_concerns` rows where `status = 'open'` and `severity ∈ ('high','critical')`
- [ ] Walk through each concern with the clinical advisor:
  - Was the AI wrong? If so, KB fix or engine fix?
  - Add a regression test (Sprint 1.1 vitest pattern)
  - Update the KB if a guideline was misrepresented
- [ ] Concerns marked `triaged` get an ETA; closed ones move to `resolved`
- [ ] Aggregate metrics:
  - p50 time-to-Rx (target <8 minutes)
  - Live-mode adoption % (target >30% by week 2)
  - AI accuracy thumbs-up rate (placeholder until we ship the inline feedback UI)
  - Cost per consult (target <₹6 average)
- [ ] Email digest to org owners every Monday

---

## When something goes wrong

### P0 incidents (page immediately)

| What | Who responds | SLA |
|---|---|---|
| Sentry alert: ≥5 users affected by same issue in 1h | Founder + on-call eng | 5 min ack, 1h fix or rollback |
| AI cost cap breached unexpectedly | Founder | 15 min — bump cap or pause |
| Patient data breach suspected | Founder + DPO | 1h investigation, 24h Customer notice, 72h DPB notice |
| Critical concern filed (`severity = 'critical'`) | Clinical advisor + founder | 4h triage |

### P1 incidents (next business day)

| What | Who responds | SLA |
|---|---|---|
| New issue type in Sentry | Eng | 1 business day |
| AI provider degraded (Gemini/Claude returning errors) | Eng | 1h ack, escalate to provider, communicate to clinics |
| Single-clinic data discrepancy | Eng + advisor | 2 business days |

---

## Pricing & commercial close

- 60 days free pilot — no charge, no card on file
- Day 45: send the renewal proposal
  - ₹30K/mo for ≤5 doctors
  - ₹50K/mo for 6-15 doctors
  - Custom for 15+
  - Annual prepay discount: 10%
- Day 60: clinic chooses to renew (paid) or churns (no penalty)
- Razorpay subscriptions for paid clinics; first invoice on day 91

---

## Pilot exit criteria (we hit GA at v1)

- 5 clinics signed (4 paid + 1 flagship case study)
- ≥80% of pilot doctors using live mode for ≥30% of daily consults in week 8
- Median consult-to-Rx <8 min (vs ~15 min baseline)
- Concern thumbs-up >70% (placeholder until inline feedback ships)
- Zero P0 incidents lasting >1h in launch month
- CDSCO file submitted

---

## Useful SQL snippets

**Open concerns this week, grouped by category:**
```sql
select category, severity, count(*)
from clinical_concerns
where status = 'open' and created_at > now() - interval '7 days'
group by category, severity
order by severity desc, count(*) desc;
```

**Active patients per org today:**
```sql
select o.name, count(distinct c.patient_id) as patients_today
from organizations o
join consultations c on c.org_id = o.id
where c.started_at::date = (current_date at time zone 'Asia/Kolkata')::date
group by o.name
order by patients_today desc;
```

**AI spend by clinic this month:**
```sql
select o.name,
       round(sum(a.cost_inr)::numeric, 2) as inr_this_month,
       o.daily_ai_cost_cap_inr * 30 as monthly_cap_estimate
from organizations o
join org_memberships m on m.org_id = o.id and m.is_active
join ai_calls a on a.doctor_id = m.user_id
where a.created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata')
group by o.id, o.name, o.daily_ai_cost_cap_inr
order by inr_this_month desc;
```

**Open consultations (no primary diagnosis filed) — orphan check:**
```sql
select id, doctor_id, started_at, chief_complaint
from consultations
where ended_at is null and started_at < now() - interval '24 hours'
order by started_at;
```
