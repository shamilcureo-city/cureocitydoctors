# Sprint 0 — Deliverables & Sprint 1 Readiness

**Sprint:** 0 — Foundation & De-risking
**Duration:** 2 weeks
**Status:** Code-side deliverables landed
**Branch:** `claude/codebase-audit-recommendations-vuP4A`

---

## What landed in this sprint

### 1. Architecture & decision documents

| Doc | Purpose |
|---|---|
| `docs/architecture/ai-first-pivot.md` | North-star architecture. Engine → agent + tools. STT pipeline rewrite. Per-component before/after. Risks. |
| `docs/architecture/tool-boundary.md` | The clinical-safety contract. Class A (deterministic) vs Class B (LLM with citations) vs Class C (free text). Bright-line "never do this" list with detection. Worked examples. |
| `docs/architecture/cost-model.md` | Per-component pricing (Mar/Apr 2026 rates). Per-consult and per-clinic projections at 4 quality tiers. Pricing implications and engineering guardrails. |
| `docs/architecture/sprint-0-deliverables.md` | This file. |

### 2. Database migrations

| Migration | What it adds |
|---|---|
| `supabase/migrations/0005_kb_chunks_pgvector.sql` | `kb_chunks` (vector(1024)), `kb_versions`, `agent_kb_citations`. ivfflat index. RLS. `search_kb_chunks()` SECURITY DEFINER RPC for top-k retrieval. |
| `supabase/migrations/0006_drug_safety_tables.sql` | `drug_master`, `drug_interactions` (drug-drug/disease/allergy/age/preg/lact), `drug_doses` (age/weight/renal/hepatic bands, max-dose caps), `red_flag_phrases`, `tool_calls` audit log. RLS. `v_drug_interactions_by_name` view. |

Migrations are additive and reversible. Run on staging first.

### 3. Agent core

| File | Purpose |
|---|---|
| `src/lib/agent/systemPrompt.js` | Clinical co-pilot prompt. Output schema spec, citation requirement, tool-use protocol, fail-safes. |
| `src/lib/agent/tools/schemas.js` | 8 tool JSONSchema definitions. CLASS_A_TOOLS set. |
| `src/lib/agent/tools/calcRiskScore.js` | Deterministic CURB-65, NEWS2, Wells (PE+DVT), Centor, HAS-BLED, CHA₂DS₂-VASc, PERC, Ottawa Ankle. GRACE stubbed for Sprint 2. |
| `src/lib/agent/tools/searchKb.js` | RAG retrieval handler. Voyage-3 embed → pgvector query. |
| `src/lib/agent/tools/drugInteractions.js` | Drug-drug + drug-disease + drug-allergy + drug-age + drug-preg + drug-lact lookup. Brand-name resolution. Severity ordering. |
| `src/lib/agent/tools/doseCheck.js` | Most-specific-match dose selection from `drug_doses`. mg/kg, fixed, BSA. Max-single + max-daily caps. |
| `src/lib/agent/tools/index.js` | Unified dispatcher. Routes Anthropic tool_use → handlers. Logs every call to `tool_calls`. Wraps results in tool_result blocks. |

### 4. API endpoints

| Endpoint | Purpose |
|---|---|
| `api/agent/turn.js` | Claude Sonnet 4.6 / Opus 4.7 agent loop. SSE streaming. Multi-turn tool dispatch (max 8 iterations). Per-call cost logging in INR. Per-org budget enforcement. |
| `api/realtime/session.js` | Realtime WS protocol spec + reference Node implementation. Returns 501 from Vercel — actual host runs on Cloudflare Workers / Fly.io (Sprint 1 deployment task). |

### 5. Frontend scaffolds

| File | Purpose |
|---|---|
| `src/hooks/useLiveStream.js` | Continuous PCM16 capture over WebSocket. Replaces the 8-second-chunk loop. Reducer-based transcript state with diarization. |
| `src/components/spike/LiveTranscriptSpike.jsx` | Throwaway end-to-end spike UI: streaming transcript + red flags + agent test button. Validates the pipeline before ConsultSurface lands in Sprint 5. |

### 6. Ingestion + tooling

| File | Purpose |
|---|---|
| `scripts/ingest_kb.js` | KB → pgvector ingestion. Markdown + JSON sources. Voyage-3 embeddings. Chunked at semantic boundaries. Records corpus hash + version metadata. |

### 7. Tests

| Suite | Tests | Coverage |
|---|---|---|
| `src/lib/agent/tools/__tests__/calcRiskScore.test.js` | 15 | CURB-65, NEWS2, Wells PE, Centor, Ottawa boundaries + error handling |
| `src/lib/agent/tools/__tests__/doseCheck.test.js` | 29 | Frequency parsing, fixed/mg-per-kg dose math, max-single/max-daily caps, row-matching across age/weight/renal/preg axes, specificity scoring |
| `api/realtime/__tests__/protocol.test.js` | 11 | Client event validation, oversize chunks, version constants |

**Suite total: 124 tests, all green.**

### 8. Config updates

| File | Change |
|---|---|
| `.env.example` | Added `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`, `VITE_REALTIME_URL`, `VITE_USE_AGENT` |
| `package.json` | Added `ingest:kb` npm script |
| `vitest.config.js` | Discovers tests under `api/**/__tests__/` |
| `eslint.config.js` | Adds Node globals to agent-tool/ingest scripts; `^_` unused-var convention |

---

## What did NOT land (and why)

These were Sprint 0 tasks that need humans, infra, or external engagement:

| Task | Why not | Owner |
|---|---|---|
| Vercel staging environment | Requires Vercel project access; needs a real branch deployed | Eng Lead |
| LangFuse/Helicone observability hookup | Needs account creation + DSN | Eng Lead |
| Gemini Live spike on Manglish/Indian English | Needs real audio clips + GEMINI_API_KEY in dev env | Eng Lead + Clinician |
| AssemblyAI Universal-2 spike for comparison | Same reason | Eng Lead + Clinician |
| Tool Boundary clinician sign-off | Doc is drafted; needs real signature from lead clinician | Lead Clinician |
| CDSCO consultant engagement | RFP / shortlist needed; weeks of lead time | Founders + Regulatory |
| Professional indemnity insurance quote | Multiple insurers to compare | Founders + Finance |
| Cost model re-validation against real traffic | Needs Sprint 4+ usage data | Eng Lead |

These become explicit Sprint 1 entrance criteria below.

---

## Sprint 1 readiness checklist

Before kicking off Sprint 1 (Live Transcription Pipeline), confirm:

### Environment

- [ ] `.env.local` has `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] Migrations 0005, 0006 applied to a Supabase **staging** project (not production)
- [ ] Staging Supabase project has pgvector extension enabled (verify: `select * from pg_extension where extname='vector'`)
- [ ] Vercel project has a `staging` branch deployed at a non-production URL
- [ ] Sentry alerts wired for new `/api/agent/*` and `/api/realtime/*` paths

### Tooling

- [ ] LangFuse or Helicone account created; DSN in `.env.local`
- [ ] Gemini API key has Gemini Live access enabled (paid tier required)
- [ ] AssemblyAI account created (for fallback comparison)
- [ ] Voyage AI key created and tested with `node scripts/ingest_kb.js --dry-run --source docs/sample-kb/`

### Decisions to close (from `ai-first-pivot.md` § Open decisions)

- [ ] **STT vendor primary** — Gemini Live vs AssemblyAI: decided after spike on 10 Manglish/Indian English clips
- [ ] **Realtime hosting** — Cloudflare Durable Objects vs Node + `ws` on Fly.io
- [ ] **Embedding model** — Voyage-3 (recommended) vs OpenAI text-embedding-3-large
- [ ] **Agent model tiering** — Default Sonnet 4.6 vs Haiku 4.5 with Sonnet for review
- [ ] **CDSCO submission timing** — Sprint 8 (eng-ready) vs Sprint 10 (clinical-evidence-ready)

### Sign-offs

- [ ] **Tool Boundary doc** signed by:
  - [ ] Engineering Lead
  - [ ] Lead Clinician
  - [ ] Data Protection Officer
- [ ] **Cost Model** reviewed by Founders + Finance; pricing tier strategy approved
- [ ] **CDSCO consultant** shortlisted (3 vendors quoted)
- [ ] **Professional indemnity insurance** quoted (3 insurers)

### Pre-Sprint 1 spike acceptance

- [ ] Gemini Live one-clip POC: speak → transcribe → display in <1 second p95 (10 clips)
- [ ] Word Error Rate measured on Manglish/Indian-English test set (target <12%)
- [ ] If WER >12%: AssemblyAI re-tested on the same clips; primary vendor switched
- [ ] Claude Agent SDK loop POC: agent calls `search_kb` (against 10 mock chunks), streams response to console

---

## Risks identified during Sprint 0 (carried into Sprint 1+)

1. **Vercel + WebSocket fundamental mismatch.** Vercel Node serverless does not support long-lived WS upgrades. Sprint 1 must include the decision + setup of a separate realtime host (Cloudflare Workers DO recommended). This was anticipated; it's now a P0 Sprint 1 blocker.

2. **pgvector ivfflat index needs REINDEX after major ingestion.** Document the ingestion runbook. Sprint 2 deliverable.

3. **Drug safety data is empty.** Migrations 0005 + 0006 ship the schema, not the data. We need a structured drug-interaction + dose corpus before agent can be useful. Options:
   - Buy: First Databank, Lexicomp (₹lakhs/year).
   - License open: openFDA / RxNorm / DailyMed (US-centric, gaps for Indian brands).
   - Build: clinician-curated subset of top 200 Indian primary-care drugs.
   - **Sprint 2 must close this.** Data quality is more important than KB chunk quality.

4. **The system prompt assumes Anthropic Messages API tool-use semantics.** If we tier down to Haiku 4.5 for live, verify tool reliability — Haiku tool-use is sometimes flakier than Sonnet. Sprint 4 acceptance criteria.

5. **Hallucination detection is post-hoc.** The system prompt + citation requirement reduces hallucination but doesn't eliminate it. The pre-render guard rails (re-running drug_interactions + dose_check at finalize_rx) are the safety net. Sprint 6 deliverable; do not ship to pilot before then.

---

## Files added this sprint

```
docs/architecture/
  ai-first-pivot.md                    NEW
  tool-boundary.md                     NEW
  cost-model.md                        NEW
  sprint-0-deliverables.md             NEW

supabase/migrations/
  0005_kb_chunks_pgvector.sql          NEW
  0006_drug_safety_tables.sql          NEW

src/lib/agent/
  systemPrompt.js                      NEW
  tools/schemas.js                     NEW
  tools/calcRiskScore.js               NEW
  tools/searchKb.js                    NEW
  tools/drugInteractions.js            NEW
  tools/doseCheck.js                   NEW
  tools/index.js                       NEW
  tools/__tests__/calcRiskScore.test.js NEW
  tools/__tests__/doseCheck.test.js    NEW

api/agent/
  turn.js                              NEW
api/realtime/
  session.js                           NEW
  __tests__/protocol.test.js           NEW

src/hooks/
  useLiveStream.js                     NEW

src/components/spike/
  LiveTranscriptSpike.jsx              NEW

scripts/
  ingest_kb.js                         NEW

# config
.env.example                           CHANGED (5 new vars)
package.json                           CHANGED (1 new script)
vitest.config.js                       CHANGED (api/ test discovery)
eslint.config.js                       CHANGED (Node globals + ^_ convention)
```

**Lines added: ~3,500 across 16 new files.**
**Lines removed: 0 (engine deletion happens in Sprint 7).**

---

## Sprint 1 entry criteria

Sprint 1 starts when **all of the following are true**:

1. All Sprint 1 readiness checkboxes above are ticked.
2. Tool Boundary doc has all sign-offs.
3. Realtime hosting decision made and account provisioned.
4. STT vendor decision made (Gemini Live or AssemblyAI).
5. Migrations 0005 + 0006 applied to staging Supabase.
6. CDSCO consultant has had kickoff call.

Until these are true, **do not start Sprint 1**. Use the time to close the open items rather than racing ahead — the engineering work is gated on these decisions and getting them wrong wastes the sprint.
