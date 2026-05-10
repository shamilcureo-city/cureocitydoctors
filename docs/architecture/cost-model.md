# AI-First Cost Model

**Status:** Sprint 0 baseline — re-validate after Sprint 4 with real traffic
**Owner:** Engineering + Finance
**FX assumption:** USD 1 = INR 84

---

## TL;DR

Per-consult AI cost rises **10–30×** in the AI-first architecture. At a
conservative midpoint, expect **₹20/consult** average vs ₹1/consult on
the engine. Pricing must move from "AI cost is rounding error" to "AI
cost is 30–50% of revenue per doctor" or we lose money on every consult.

**Recommended response:** tier the model selection, cap per-consult
spend hard, and price the new product at **₹2,500–4,000/doctor/month**
(up from current free pilot).

---

## Per-component pricing (Mar/Apr 2026 published rates)

### Speech-to-text (live consult)

| Vendor / Model | Pricing | Per 10-min consult |
|---|---|---|
| **Gemini Live 2.5 Flash** | $0.10/M input audio tokens; ~32 audio tokens/sec → ~19,200 tokens / 10min | $0.0019 ≈ **₹0.16** |
| **Gemini Live 2.5 Flash (with output audio TTS)** | + $0.40/M output text tokens for "ask next" hints | +$0.001 ≈ **₹0.08** |
| **AssemblyAI Universal-2 Streaming** | $0.37/hr | $0.062 ≈ **₹5.20** |
| **Deepgram Nova-3 Streaming** | $0.0058/min | $0.058 ≈ **₹4.87** |
| **Whisper API (batch only, not live)** | $0.006/min | not viable for live |

**Choice:** Gemini Live is **30× cheaper** than AssemblyAI for STT alone.
Decision driver is **accuracy on Indian English/Manglish**, not cost.
We can absorb ₹5/consult on AssemblyAI if quality demands it.

### Reasoning LLM (per turn)

Assume average consult: 12 agent turns × 800 input tokens × 400 output tokens.
Plus extended thinking on 2 turns (~2000 thinking tokens each).

| Model | Input $/M | Output $/M | Thinking $/M | Per-consult cost |
|---|---|---|---|---|
| **Claude Haiku 4.5** | $1 | $5 | $5 | $0.026 ≈ **₹2.18** |
| **Claude Sonnet 4.6** | $3 | $15 | $15 | $0.077 ≈ **₹6.47** |
| **Claude Opus 4.7** | $15 | $75 | $75 | $0.385 ≈ **₹32.34** |
| **Gemini 2.5 Pro** | $1.25 | $10 | n/a | $0.044 ≈ **₹3.70** |

**Choice:** Default to **Sonnet 4.6** for live agent turns. Use **Haiku 4.5**
for the streaming-narration pass when latency matters more than reasoning.
Reserve **Opus 4.7** for the user-triggered "deep reasoning" review (1×
per consult max, doctor-initiated).

### Embeddings (RAG)

KB ingestion is one-time per KB version. Per-query retrieval embedding is
small.

| Model | Pricing | Per consult (12 queries × 50 tokens avg) |
|---|---|---|
| **Voyage-3** | $0.06/M | $0.000036 ≈ **₹0.003** |
| **OpenAI text-embedding-3-large** | $0.13/M | $0.000078 ≈ **₹0.007** |

Negligible. Choice driven by retrieval quality on medical content. **Voyage-3
recommended** for clinical domain.

### Vector storage / DB / hosting

| Component | Pricing | Per-consult share |
|---|---|---|
| **Supabase Pro** ($25/mo + $0.0125/GB transfer) | flat | ~₹0 amortized |
| **Vercel Pro** ($20/mo + serverless minutes) | flat | ~₹0 amortized |
| **Cloudflare Workers / DOs** ($5/mo + $0.15/M req) | flat + tiny variable | ~₹0 |

Infrastructure cost is rounding error vs AI cost.

---

## Composite per-consult cost (10-min average)

### Scenario A: Cost-optimized (Haiku-default)

| Item | Cost |
|---|---|
| Gemini Live STT | ₹0.16 |
| Haiku 4.5 agent (12 turns) | ₹2.18 |
| Voyage-3 embeddings (12 queries) | ₹0.003 |
| Supabase + Vercel + CF amortized | ~₹0.05 |
| **Total** | **~₹2.40** |

### Scenario B: Quality-balanced (Sonnet-default) ★ recommended

| Item | Cost |
|---|---|
| Gemini Live STT | ₹0.16 |
| Sonnet 4.6 agent (12 turns) | ₹6.47 |
| Voyage-3 embeddings | ₹0.003 |
| Supabase + Vercel + CF amortized | ~₹0.05 |
| 1× Opus deep-review (50% of consults) | ₹16 |
| **Total (with Opus)** | **~₹22.70** |
| **Total (without Opus)** | **~₹6.70** |

### Scenario C: Premium (Sonnet + AssemblyAI for accuracy)

| Item | Cost |
|---|---|
| AssemblyAI STT | ₹5.20 |
| Sonnet 4.6 agent | ₹6.47 |
| Voyage-3 embeddings | ₹0.003 |
| Infra | ~₹0.05 |
| 1× Opus deep-review (always) | ₹32.34 |
| **Total** | **~₹44.06** |

### Scenario D: Worst case (long consult, runaway turns, Opus default)

20-min consult, 25 agent turns, Sonnet+Opus mix, AssemblyAI:

**~₹85/consult**

This is the cap we must enforce per-consult to prevent runaway burn
from misbehaving agents or doctors who abandon a session mid-stream.

---

## Per-clinic monthly cost projections

Assume 40 consults/day × 25 working days = 1,000 consults/month/doctor.

| Doctors | Scenario A (Haiku) | Scenario B (Sonnet) | Scenario C (Premium) |
|---|---|---|---|
| 1 | ₹2,400 | ₹22,700 | ₹44,000 |
| 5 (current pilot) | ₹12,000 | ₹113,500 | ₹220,000 |
| 25 (Sprint 10 target) | ₹60,000 | ₹567,500 | ₹1,100,000 |
| 100 (12-month target) | ₹240,000 | ₹2,270,000 | ₹4,400,000 |

---

## Pricing implications

Current pilot: free.

For the AI-first product to be margin-positive at **40% gross margin**
(reasonable for SaaS clinical), pricing must be:

| Scenario | AI cost / doctor / mo | Sustainable price (40% GM) |
|---|---|---|
| A — Haiku | ₹2,400 | ₹4,000/doctor/mo |
| B — Sonnet ★ | ₹22,700 | ₹38,000/doctor/mo |
| **B — Sonnet selective Opus** | **₹6,700–15,000** | **₹11,000–25,000/doctor/mo** |
| C — Premium | ₹44,000 | ₹73,000/doctor/mo |

Indian primary care GP willingness-to-pay reality check:
- Solo GP in tier-2/3 town: ₹500–2,000/mo absolute ceiling
- Group practice / clinic chain: ₹3,000–8,000/doctor/mo possible
- Hospital network deal: ₹5,000–15,000/doctor/mo possible per chain

**Implication:** Solo GPs cannot afford the AI-first product at full
quality. We must:
1. **Tier the product:** "Co-pilot Lite" (Haiku, no live) at ₹1,500/mo
   for solo GPs; "Co-pilot Pro" (Sonnet, live, deep review) at
   ₹4,500/mo for clinics; "Co-pilot Enterprise" for hospital networks.
2. **Sell to clinics not solos initially.** A 5-doctor clinic at
   ₹4,500/doctor = ₹22,500/mo is achievable; a solo GP at the same
   rate is not.
3. **Hard per-consult cost caps** at ₹40 (Pro) and ₹15 (Lite). Cap
   prevents pathological cases (long consults, agent loops) from
   destroying unit economics.

---

## Cost guardrails (engineering)

These are enforced in code, not by hope.

### Per-org daily cap (existing, in `api/_lib/budgetCheck.js`)

`organizations.daily_ai_cost_cap_inr` × IST day boundary; sum of
`ai_calls.cost_inr` since midnight IST. Returns 429 when ≥ cap.

**Default values to set:**
- Lite tier org: ₹500/day
- Pro tier org: ₹2,000/day per active doctor (so 5-doctor clinic = ₹10k/day)
- Enterprise: custom

### Per-consult cap (new, Sprint 4)

`consultations.consult_cost_cap_inr` (default ₹40 Pro / ₹15 Lite). When
sum of `ai_calls.cost_inr` for that consultation_id reaches cap, agent
turns are blocked, doctor sees a "consult limit reached" notice, and the
consult finalization is forced.

### Per-turn input cap (new, Sprint 3)

Agent context window manually capped at 16k tokens via Anthropic context
management memory tools. Prevents runaway transcript accumulation.

### Per-day per-doctor sanity cap (new, Sprint 8)

Hard cap of 100 consults/doctor/day. Anything above this is suspicious
(automation? bot? account share?). Triggers alert + temporary block.

---

## Cost monitoring

| Metric | Where | Alert threshold |
|---|---|---|
| Per-consult cost | `ai_calls` aggregated by consultation_id | p95 > ₹35 (Pro) / ₹13 (Lite) |
| Per-doctor daily | `ai_calls` aggregated by doctor + IST day | > ₹500 |
| Per-org daily | existing `checkOrgBudget` | > 80% of cap = warn; ≥100% = block |
| Per-tool call cost | new `tool_calls` table | n/a (mostly free; embeddings only) |
| Cost variance from baseline | weekly comparison | >25% drift triggers review |

Dashboards:
- `/admin/billing` — per-org spend last 30 days, projected month-end
- `/admin/cost-by-doctor` — leaderboard, identifies outliers
- Sentry alerts on per-consult cost > ₹50 (regardless of tier)

---

## Re-validation triggers

Re-run this cost model when any of these change:

- Anthropic, Google, AssemblyAI publish new pricing
- Average consult duration shifts ±20% from 10min baseline
- Average agent turns/consult shifts ±20% from 12 baseline
- Vertex AI ap-south-1 migration (changes per-token cost)
- Self-hosting consideration (changes infra cost class)

Owner: Engineering Lead. Cadence: Quarterly + on-trigger.
