# AI-First Architecture Pivot

**Status:** Sprint 0 — Foundation & De-risking
**Owner:** Engineering + Clinical Advisory
**Last updated:** 2026-05-10

---

## TL;DR

We are replacing the 8.9k-line monolithic deterministic engine (`src/engine/cureocityEngine.js`)
with an LLM agent orchestrating a small set of deterministic clinical-safety tools. Live
ambient transcription moves from 8-second chunked REST polling (current p95 latency
~25s, unusable in real consults) to a streaming WebSocket pipeline (target p95 <1s
first-token).

The 7-step structured workflow (Intake → Missing Data → Exam → Meds → Labs →
Assessment → Rx) is replaced with a single conversational consultation surface
where the agent decides what to surface based on context.

**The engine is deleted. The KB is preserved as RAG. Three things stay
deterministic: drug interactions, dose calculations, and risk scores.** That
boundary is non-negotiable; see `tool-boundary.md`.

---

## Why we're doing this

1. **The current "live" mode is not live.** `api/live/transcribe.js` chunks
   audio at 8s (`useLiveAudio.js:50`) and blocks on Gemini Flash for 10–20s
   per chunk. End-to-end visible delay is ~25s. Doctors abandon it.
2. **The monolithic engine is a maintenance ceiling.** 8.9k LOC of regex +
   keyword matching, excluded from linting, no types. Every new condition
   requires a code change. Scaling KB to 500+ conditions is impractical.
3. **The 7-step workflow doesn't match how doctors actually consult.** Real
   consults are non-linear: doctors triage red flags first, fill HPI as
   they go, order labs while still examining. The fixed step machine
   forces them to context-switch.
4. **LLMs in 2026 are good enough for clinical narrative reasoning** when
   grounded in a curated KB and gated by deterministic safety tools.
   Pure-LLM is unsafe; thin-shell + tools is the right middle.

## Why we're NOT going pure-LLM

LLMs hallucinate on three classes of clinical decision where hallucination
= patient harm:

- **Drug-drug interactions.** Misses real ones, invents fake ones.
- **Dosing math.** Particularly mg/kg paeds, renal-adjusted, and BSA-based
  oncology. Even SOTA models get arithmetic wrong ~3–8% of the time.
- **Risk scores** (CURB-65, GRACE, Wells, NEWS2). Same arithmetic problem,
  with the added trap of mis-mapping inputs to score components.

These three stay as deterministic tools the agent calls. Everything else
(intake parsing, narrative reasoning, differential ranking, "ask next",
prescription drafting, KB retrieval) goes to the LLM. See
`tool-boundary.md` for the explicit list.

---

## Target architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser                                                          │
│  • WebRTC mic capture (continuous PCM/Opus)                      │
│  • Single WebSocket to /api/realtime/session                     │
│  • Streaming UI: transcript + agent output token-by-token        │
│  • Service worker for offline event queueing                     │
└──────────────────────┬───────────────────────────────────────────┘
                       │ WS (audio frames in, events out)
┌──────────────────────▼───────────────────────────────────────────┐
│ Realtime backend (Cloudflare Durable Objects OR Node.js on Fly)  │
│  • Authenticates Supabase JWT on WS upgrade                      │
│  • Pipes audio → STT vendor (Gemini Live or AssemblyAI)          │
│  • Pipes transcript deltas → Agent + back to client              │
│  • Buffers 30s of audio for reconnect                            │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│ Clinical Agent (Anthropic Messages API)                          │
│  Default: Claude Sonnet 4.6 (live pass)                          │
│  Deep:    Claude Opus 4.7 (user-triggered re-reasoning)          │
│  Fast:    Claude Haiku 4.5 (per-turn streaming if Sonnet >8s)    │
│                                                                  │
│  System prompt: clinical co-pilot, India primary care, citations │
│  required, never invent dose/interaction/score                   │
│                                                                  │
│  Tools:                                                          │
│    1. search_kb(query, filters)        → pgvector RAG            │
│    2. drug_interactions(drugs[])       → SQL lookup              │
│    3. calc_risk_score(type, params)    → deterministic JS        │
│    4. dose_check(drug, patient)        → SQL + JS rules          │
│    5. patient_history(phone)           → Supabase                │
│    6. flag_red_flag(phrase, severity)  → escalation              │
│    7. save_consult_event(event)        → append-only log         │
│    8. finalize_rx(items)               → validated Rx output     │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│ Data layer (Supabase, ap-south-1 Mumbai)                         │
│  Existing:                                                       │
│   • doctors, organizations, org_memberships, patients            │
│   • consultations, consultation_events, prescriptions            │
│   • audit_log, ai_calls, consent_records, kb_snapshots           │
│   • clinical_concerns                                            │
│  New (migrations 0005, 0006):                                    │
│   • kb_chunks (vector embeddings, RAG corpus)                    │
│   • drug_interactions (severity-graded matrix)                   │
│   • drug_doses (age/weight/renal bands, max doses, contraindic.) │
│   • red_flag_phrases (deterministic escalation triggers)         │
│  Removed:                                                        │
│   • consultations.engine_snapshot (no engine state to snapshot)  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component-by-component changes

### Live audio pipeline

**Current:**
- `src/hooks/useLiveAudio.js` — MediaRecorder restart loop, 8s chunks
- `api/live/transcribe.js` — POST per chunk, blocking Gemini Flash call
- Visible latency: 18–28s per chunk

**Target:**
- `src/hooks/useLiveStream.js` — continuous Opus stream over WebSocket
- `api/realtime/session.js` — WS handler proxying to STT vendor
- Visible latency: <1s p95

**STT vendor decision (Sprint 0):**
| Option | Pros | Cons |
|---|---|---|
| Gemini Live API (`gemini-live-2.5-flash`) | Single vendor, native diarization, low latency | Quality on Indian English/Manglish unproven at scale |
| AssemblyAI Universal-2 Streaming | Best transcription quality, Indian English support | Two vendors (still need Anthropic for reasoning) |
| Deepgram Nova-3 | Fastest first-token | Indian English accuracy lower than AssemblyAI |

**Recommended path:** Start Gemini Live for the spike. If Word Error Rate
on a 10-clip Manglish/Indian-English test set exceeds 12%, switch to
AssemblyAI for STT and keep Gemini for nothing.

### Clinical reasoning

**Current:** `src/engine/cureocityEngine.js` (8.9k LOC, regex + keyword
matching + scoring tables + drug interaction matrix + risk calculators
all in one file).

**Target:**
- `src/lib/agent/systemPrompt.js` — clinical co-pilot prompt
- `src/lib/agent/tools/*.js` — 8 tool handlers (4 deterministic + 4 data ops)
- `api/agent/turn.js` — Anthropic Messages call with tool loop, streams via SSE
- KB content moved to `kb_chunks` table with vector embeddings

### Workflow / UI

**Current:** `src/components/WorkflowApp.jsx` orchestrates 7 panels by
`activeStep` state.

**Target:** `src/components/ConsultSurface.jsx` — single live surface
with three columns:
- Left: streaming transcript with diarization
- Center: agent output (HPI, vitals, differential, red flags, "ask next")
- Right: actions (add to Rx, order lab, refer, finalize)

The 7 panels are deleted. Functionality moves into the agent's tool calls
and into focused dialogs triggered from the right-column actions.

### Persistence

**Current:** Engine state mirrored into `consultations.engine_snapshot`
JSONB column for fast replay.

**Target:** State derived from `consultation_events` log. Agent can
reconstruct context from the event stream on session resume. `engine_snapshot`
column dropped in migration `0007`.

---

## Cost & latency envelope

See `cost-model.md` for detail. Headline numbers:

| Path | Old | New (target) |
|---|---|---|
| First transcript word | 18–28s | <1s p95 |
| Differential update after new info | 5–15s | 2–5s p95 |
| Per-consult AI cost (10 min) | ₹0.50–2 | ₹15–30 |
| Per-clinic monthly AI cost (40/d × 25d) | ₹500–2k | ₹15k–30k |

**Critical:** AI cost rises 10–30× per consult. Pricing must be revised
before pilot expansion. See `cost-model.md` for the proposed tier structure.

---

## Migration sequence

| Sprint | Milestone |
|---|---|
| 0 | Foundation docs, migrations drafted, spike code, tool boundary signed |
| 1 | Live transcription <1s end-to-end, side-by-side with old workflow |
| 2 | KB ingested into pgvector, tool handlers tested |
| 3 | Agent runs in shadow mode, output compared to engine offline |
| 4 | Co-pilot panel visible to doctor as opt-in beta |
| 5 | ConsultSurface replaces WorkflowApp as default |
| 6 | Rx finalization gated by deterministic safety tools |
| 7 | Engine deleted from main; pilot doctors fully on new system |
| 8 | Production hardening (error boundaries, retries, E2E, observability) |
| 9 | WCAG 2.1 AA + mobile validation |
| 10 | Pilot expansion 5 → 25 doctors, clinical outcome instrumentation |

Detailed sprint plan: `../sprint-plan.md` (forthcoming) and the audit conversation transcript.

---

## What stays the same

- DPDP compliance posture (RLS, audit trail, consent recording, PII scrubbing)
- Supabase + Vercel deployment (with Cloudflare Workers added for WS)
- Mumbai data residency for storage; AI inference still routes via vendor
  endpoints until Vertex AI migration (post Sprint 10)
- KB versioning (`kb_version` per consult) — now derived from `kb_chunks`
  table version rather than engine commit hash
- Clinical concern reporting flow (becomes the primary feedback loop for
  agent quality, not just engine quality)
- TPG/CDSCO compliance scaffolding — modality recording, registration
  number enforcement, audit log

## What changes regulatorily

The CDSCO submission narrative shifts from "deterministic decision-support
algorithm" to "LLM-based clinical co-pilot with deterministic safety
guards." This is a **harder** approval path. We must:

- Document the exact tool boundary (deterministic vs LLM) — see `tool-boundary.md`
- Provide validation evidence for each tool independently
- Provide hallucination evidence: false claims caught by citation
  requirement, by deterministic guards, by clinical concern reports
- Maintain a safety case that no LLM output reaches the patient without
  passing through at least one deterministic guard for any
  drug/dose/interaction/score claim

This is why **Sprint 0 must include CDSCO consultant engagement** — the
strategy needs regulatory validation before code commits.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini Live latency >1s on Indian network | Medium | High | AssemblyAI fallback; geo-test in Kerala in Sprint 1 |
| Agent hallucinates dose/interaction despite tools | High if prompt sloppy | Critical | Validate every drug through `dose_check` + `drug_interactions` tools at the UI layer regardless of agent claim |
| Cost overruns | High | High | Per-org daily cap (existing); per-consult cap (new); model tiering (Haiku for live, Sonnet for review) |
| CDSCO rejects LLM-based SaMD | Medium | Critical | Engage consultant Sprint 0; design tool boundary as the safety case |
| Pilot doctor rejects new UX | Medium | High | Keep `/legacy` route through Sprint 8; opt-in beta in Sprint 4–5 |
| WS reliability on flaky tier-2/3 networks | Medium | Medium | 30s audio buffer; reconnect with sequence; offline event queue (existing) |
| Cloudflare Workers learning curve | Low | Medium | Start with Node.js + `ws` on Fly if Workers slows the team |

---

## Open decisions (close before Sprint 1)

1. **STT vendor primary:** Gemini Live vs AssemblyAI — decide after Sprint 0 spike on 10 Manglish clips.
2. **Realtime hosting:** Cloudflare Durable Objects vs Node.js on Fly/Render — decide based on team familiarity.
3. **Embedding model:** Voyage-3 (1024-dim) vs OpenAI text-embedding-3-large (3072-dim) — Voyage-3 is recommended for medical content.
4. **Agent model tiering:** Default to Sonnet 4.6, or default to Haiku 4.5 with Sonnet for review only? Cost vs quality.
5. **CDSCO submission timing:** Submit Sprint 8 (engineering ready) or Sprint 10 (clinical evidence ready)?

These do not block Sprint 0 deliverables but must be closed by start of Sprint 1.
