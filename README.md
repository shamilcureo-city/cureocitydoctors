# Cureocity Doctors

Clinical decision-support web app for Indian primary-care doctors. Free-text patient narrative (English, Indian English, or Manglish) → 7-step guided workflow → printable prescription. The clinical reasoning engine handles symptom normalization, differential scoring, drug-interaction checking, lab interpretation, and risk calculators (CURB-65, Wells, GRACE, NEWS2, etc.).

> **Decision support — not a substitute for medical judgement.** All differentials, drug suggestions and risk scores are advisory. The treating clinician is responsible for the final decision. Per the Telemedicine Practice Guidelines (2020).

## Stack

- React 19 + Vite 8 (JSX, ES modules)
- Supabase (auth + Postgres + RLS, region `ap-south-1` Mumbai)
- Vercel (static hosting + edge)
- PostHog (product analytics, optional)
- Sentry (error reporting, optional)
- Clinical engine: `src/engine/cureocityEngine.js` (~8.3k lines — to be replaced by Gemini in Sprint 2)

## Project layout

```
src/
  main.jsx                     # Vite entry — boots analytics + error reporting
  App.jsx                      # auth/landing/workflow router
  index.css                    # design tokens + all component styles
  hooks/
    useEngine.js               # React wrapper around engine + case persistence
    useAuth.js                 # Supabase session hook
  engine/cureocityEngine.js    # clinical engine
  lib/
    supabaseClient.js          # singleton Supabase client (env-gated)
    auth.js                    # signIn / signOut / session helpers
    casePersistence.js         # event-sourced case sync + offline queue
    analytics.js               # PostHog (env-gated, no-op fallback)
    errorReporting.js          # Sentry (env-gated, no-op fallback)
  components/
    WorkflowApp.jsx            # the 7-step wizard
    Landing.jsx                # public landing page + signup form
    Auth.jsx                   # email magic-link sign-in
    Header / Sidebar / IntakePanel / ExamPanel / MedicationsPanel /
    LabsPanel / AssessmentPanel / PrescriptionPanel / LivePanel /
    DisclaimerBanner.jsx
  utils/auditLog.js            # localStorage audit log + Supabase sync
public/                        # icons, favicon
supabase/migrations/0001_initial.sql   # full schema + RLS
docs/architecture.pdf          # architecture deck
vercel.json                    # SPA rewrites + security headers
```

## Local development

```bash
npm install
cp .env.example .env           # then fill in Supabase keys (or leave blank for local-only mode)
npm run dev                    # Vite dev server with HMR
npm run lint
npm run build                  # production build → dist/
npm run preview                # preview the production build
```

If `.env` is empty the app boots in **local-only mode**: no auth, cases save to your browser only.

## Setup — cloud sync

You need a Supabase project, a Vercel account, and (optionally) PostHog + Sentry. The app degrades gracefully if any of these are missing.

### 1. Supabase

1. Create a new project at <https://supabase.com> — region **South Asia (Mumbai) `ap-south-1`** (DPDP data residency).
2. Open the SQL editor and paste the contents of `supabase/migrations/0001_initial.sql`. Run.
3. Settings → API → copy `URL` and `anon public` key into your `.env`:
   ```
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Authentication → URL Configuration → add your dev origin (`http://localhost:5173`) and your production domain to the redirect-URL allowlist.
5. (Optional) Enable phone/SMS auth later — requires Twilio. Email magic-link works out of the box.

### 2. Vercel

1. Push the repo to GitHub.
2. Import the repo at <https://vercel.com/new>. Vercel auto-detects Vite.
3. Add the environment variables from `.env` to the Vercel project (`Settings → Environment Variables`).
4. Deploy. `vercel.json` configures SPA rewrites and security headers.

### 3. PostHog (optional)

1. Sign up at <https://posthog.com> (free tier).
2. Project → API key → copy `phc_…` into `.env`:
   ```
   VITE_POSTHOG_KEY=phc_...
   VITE_POSTHOG_HOST=https://app.posthog.com
   ```

### 4. Sentry (optional)

1. Create a React project at <https://sentry.io>.
2. Copy the DSN into `.env`:
   ```
   VITE_SENTRY_DSN=https://...@...ingest.sentry.io/...
   ```

## Audit log

Every clinical action (intake, gap fill, exam toggle, lab update, drug add/remove, step transition, disclaimer ack, sign-in/out) is recorded:

- **Always** in `localStorage` under `cx_audit_log_v1` (capped at 5000 events).
- **When cloud sync is configured**, also flushed to Supabase `audit_log` table in batches.

Inspect from devtools:
```js
JSON.parse(localStorage.getItem('cx_audit_log_v1'))
```

## Case persistence (event-sourced)

Each clinical action is also written as a `case_event` (type + payload + timestamp). Events are queued in `localStorage` and async-flushed to Supabase. This means:

- **Offline support** — events queue and drain when connection returns.
- **Audit reconstruction** — replaying events recreates case state.
- **Move-friendly** — when we add a proper FHIR data model in Sprint 6, the event log becomes the migration source.

## Workflow

```
1 Intake          Free-text chief complaint + HPI
2 Missing Data    Critical history gaps surfaced by the engine
3 Exam            System-based examination findings + vitals
4 Medications     Current drugs + interaction safety check
5 Diagnostics     Lab values with reference ranges + critical alerts
6 Assessment      Differential (T1/T2/T3) + red flags + next steps
7 Finalize        Build & print prescription
```

## Roadmap

- **Sprint 0** ✅ — Stabilize: clinical-correctness fixes, disclaimer, audit log
- **Sprint 1** ✅ — Supabase auth + event-sourced persistence, Vercel deploy, PostHog/Sentry hooks
- **Sprint 2** — Gemini 2.5 Flash voice/text intake (replaces regex pipeline)
- **Sprint 3** — 5 Kerala GPs onboarded for daily use, weekly feedback loop
- **Sprint 4–5** — Iterate from doctor feedback
- **Sprint 6** — Strategic decision: ABDM/FHIR, Claude Opus reasoning tier, language expansion
