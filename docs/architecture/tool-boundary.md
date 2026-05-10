# Tool Boundary: What the LLM Does vs What Stays Deterministic

**Status:** DRAFT — pending clinical advisor sign-off
**Owner:** Engineering Lead + Lead Clinician
**Last reviewed:** 2026-05-10
**Review cadence:** After every clinical concern report; mandatory quarterly

---

## Purpose

This document defines **the explicit contract** between LLM-driven reasoning
and deterministic clinical-safety tools in the AI-first architecture. It
exists for three reasons:

1. **Patient safety.** Hallucinated drug interactions, doses, or risk
   scores can kill people. We will not let an LLM be the source of truth
   for any of those.
2. **Regulatory defense.** The CDSCO submission's safety case rests on
   this boundary. If a reviewer asks "how do you prevent the AI from
   inventing a drug dose?", the answer is this document plus the code
   that implements it.
3. **Engineering discipline.** Without an explicit boundary, every
   feature decision becomes a debate. With one, it's a lookup.

**Sign-off requirement:** No code that violates this boundary ships to
production. Any change to the boundary requires the lead clinician's
written approval (PR review with explicit comment).

---

## The contract

### Class A — Always deterministic. NEVER goes to the LLM.

The LLM may **request** the result via tool call. The LLM may **explain**
the result to the doctor in narrative. The LLM **never produces**
the result itself.

| Decision | Tool | Implementation |
|---|---|---|
| **Drug-drug interaction severity** | `drug_interactions(drugs[])` | SQL query against `drug_interactions` table |
| **Drug-disease contraindication** | `drug_interactions` (extended) | SQL with patient comorbidity context |
| **Drug-allergy cross-check** | `drug_interactions` (extended) | SQL against patient allergy list |
| **Pediatric dose (mg/kg, max dose)** | `dose_check(drug, patient)` | SQL + JS rules from `drug_doses` |
| **Renal-adjusted dose (CrCl bands)** | `dose_check` | Same |
| **Hepatic-adjusted dose** | `dose_check` | Same |
| **Pregnancy category enforcement** | `dose_check` | Same |
| **CURB-65 score** | `calc_risk_score("curb65", params)` | Pure JS function, unit-tested |
| **Wells score (PE)** | `calc_risk_score("wells_pe", params)` | Same |
| **Wells score (DVT)** | `calc_risk_score("wells_dvt", params)` | Same |
| **GRACE score (ACS)** | `calc_risk_score("grace", params)` | Same |
| **NEWS2 score** | `calc_risk_score("news2", params)` | Same |
| **HAS-BLED, CHA₂DS₂-VASc** | `calc_risk_score(...)` | Same |
| **Lab critical-value flag** | Deterministic threshold table | SQL + UI overlay |
| **Red-flag phrase escalation** | `red_flag_phrases` deterministic list | String match in transcript |
| **Doctor registration number validation** | DB CHECK constraint | TPG 2020 §3.7.1 |
| **Audit log writes** | Direct SQL inserts | DPDP Act trail |
| **Consent recording** | Direct SQL inserts | DPDP Act + TPG |
| **DPDP data residency** | Supabase region pinning | Infra config |

**Enforcement:**
- Tool calls are the **only** path to these results. The LLM cannot
  bypass them.
- The Rx finalization endpoint (`finalize_rx`) re-runs `drug_interactions`
  and `dose_check` on every drug in the Rx **regardless of what the
  agent said**, before the doctor can sign. If the agent skipped a check,
  the validator catches it.
- The UI does not render any LLM-stated dose, interaction, or risk score.
  It only renders the **tool output**, with the LLM's narrative wrapped
  around it.

### Class B — LLM-driven, citation-required.

The LLM produces the output. It must cite a `kb_chunks.id` for any
clinical claim. Un-cited claims are visually flagged in the UI and
treated as the LLM's opinion, not knowledge.

| Decision | LLM behavior |
|---|---|
| **Intake parsing** (free-text → structured HPI) | Parse, structure, summarize. No diagnostic claims. |
| **Speaker diarization** | Label doctor/patient turns. |
| **Vital extraction** | Extract verbatim from transcript; no inference. |
| **Lab value extraction** | Extract verbatim; no interpretation without `search_kb` cite. |
| **Symptom translation** (Manglish/Hindi/Malayalam → medical English) | Translate; preserve original. |
| **Differential diagnosis ranking** | Rank top 3–5 with confidence; **cite KB protocols**. |
| **"Ask next" question generation** | Suggest single highest-yield question; cite reasoning. |
| **Working diagnosis narrative** | Summarize current state; cite. |
| **Suggested workup** | Suggest labs/imaging; cite KB protocols (e.g., NICE chest pain). |
| **Treatment line draft** | Draft Rx items with brand suggestions; **must call `dose_check` before output**. |
| **Patient advice text** | Generate plain-language advice; cite KB. |
| **Referral letter draft** | Compose letter; cite KB for urgency rationale. |
| **Follow-up plan** | Suggest follow-up days; cite. |

**Enforcement:**
- System prompt requires `[kb:<id>]` citation markers inline for every
  clinical claim.
- Post-processing strips claims that lack citations and replaces them
  with a "[unverified]" tag the doctor can see.
- Agent telemetry tracks citation rate per turn. <90% citation rate
  on a turn auto-files a clinical concern for review.

### Class C — LLM-driven, no citation required.

Pure UX/narrative tasks where there is no clinical truth claim.

| Task |
|---|
| Greeting / banter detection in transcript |
| Pleasantries omission from clinical notes |
| Formatting of HPI summary |
| Phrasing of the "ask next" question for tone |
| Spelling/grammar normalization |

---

## What the LLM **MUST NEVER** do

The following are bright-line violations. If observed, treat as a P0
incident:

1. **State a drug interaction without a `drug_interactions` tool result.**
2. **State a dose without a `dose_check` tool result.**
3. **State a risk score number without a `calc_risk_score` tool result.**
4. **Invent a `kb_chunks.id` that does not exist** (fabricated citation).
5. **Reword a red-flag phrase to suppress its severity** (e.g., changing
   "thunderclap headache" to "sudden headache").
6. **Suggest an off-license drug indication** without explicit
   "[off-label]" tag and KB cite.
7. **Output a complete prescription as text** (must use `finalize_rx`
   structured tool that runs validators).
8. **Claim a contraindication does not apply** to override a tool result
   (the tool wins).

**Detection:** Each of the above has automated detectors in
`src/lib/agent/safetyCheck.js` (Sprint 6 deliverable). Violations are
logged to `audit_log` with type `agent.safety.violation`, surface in the
admin dashboard, and block the affected output from rendering.

---

## Worked examples

### Example 1: Doctor says "She's on warfarin, can I add ciprofloxacin?"

**LLM workflow:**
1. Recognizes drug-drug interaction question.
2. Calls `drug_interactions(["warfarin", "ciprofloxacin"])`.
3. Tool returns: `{ severity: "major", mechanism: "CYP1A2/CYP3A4 inhibition; INR rise", advice: "Avoid; if essential, monitor INR daily and reduce warfarin dose 25–50%" }`.
4. Calls `search_kb("warfarin ciprofloxacin interaction management")` to get citation.
5. Outputs: "Major interaction. Ciprofloxacin inhibits warfarin metabolism, INR can rise sharply. [kb:if_warfarin_quinolone_v3] Recommend doxycycline or amoxicillin if appropriate. If ciprofloxacin essential, monitor INR daily and consider 25–50% warfarin dose reduction."

**What the LLM did NOT do:**
- It did not say "minor interaction" based on training data.
- It did not invent the dose adjustment percentage.
- It did not cite a KB chunk that doesn't exist.

### Example 2: Paeds dose request

**Doctor:** "8-year-old, 24kg, fever 39°C, give paracetamol."

**LLM workflow:**
1. Calls `dose_check({ drug: "paracetamol", patient: { age_years: 8, weight_kg: 24, ... } })`.
2. Tool returns: `{ dose_mg: 360, dose_range_mg_kg: [10, 15], frequency: "Q4-6H", max_per_day_mg: 1500, route: "PO" }`.
3. Outputs: "Paracetamol 15 mg/kg/dose = 360 mg, give Q4–6H, max 1500 mg/day. [kb:paeds_paracetamol_v2] Suggest syrup form for ease."

**What the LLM did NOT do:**
- It did not multiply 8 × 15 = 120 in its head.
- It did not output "give 500 mg" because that's the adult dose it remembers.

### Example 3: Risk stratification

**Doctor:** "70-year-old male, BUN 22, RR 32, BP 80/50, confused. CURB-65?"

**LLM workflow:**
1. Calls `calc_risk_score("curb65", { age_years: 70, bun_mmol_l: 7.85, rr: 32, sbp: 80, dbp: 50, confusion: true })`.
2. Tool returns: `{ score: 5, mortality_risk: "high (>20%)", recommendation: "ICU admission" }`.
3. Outputs: "CURB-65 = 5 (max). Confusion + Urea>7 + RR≥30 + SBP<90 + Age≥65. [kb:curb65_v1] Mortality risk >20%. Recommend ICU admission."

**What the LLM did NOT do:**
- It did not compute the score itself.
- It did not say "score is 4" if the tool said 5.

---

## Boundary review process

This boundary will be challenged by feature requests. The process for
moving an item between classes:

1. Engineering files an RFC referencing this document.
2. Lead clinician reviews; can require evidence (clinical literature,
   regulatory precedent, validation study).
3. If approved, the change ships in the same PR that updates this doc.
4. Quarterly review: lead clinician walks the boundary against
   accumulated clinical concern reports. Items move to Class A if
   evidence shows LLM unreliability.

**Default direction of travel:** items move FROM Class B TO Class A as
we learn. Items rarely move out of Class A.

---

## Sign-off

This document requires sign-off from:

- [ ] Engineering Lead
- [ ] Lead Clinician (Family Medicine, MD/DNB)
- [ ] CDSCO Regulatory Consultant (when engaged)
- [ ] Data Protection Officer (DPDP)

Sign-off is recorded as commits to this file with `Signed-off-by:` trailers
and stored alongside the technical file for CDSCO submission.

---

## Appendix: Why "RAG with citations" is not enough

A reasonable objection: "If the LLM cites the KB, why also need
deterministic tools? The KB has the dose."

Answer:

1. **Retrieval is fuzzy.** The KB chunk for paracetamol paeds dosing
   may or may not be the top-1 retrieval result for a given query. The
   LLM may retrieve and quote correctly, or retrieve correctly and
   miscompute, or retrieve a near-neighbor (paracetamol IV vs PO) and
   apply it wrongly.
2. **Computation is brittle in LLMs.** Even with a correct KB excerpt
   open in context, LLMs miscompute mg/kg, mis-apply max-dose ceilings,
   and confuse units (mg vs mcg).
3. **Auditability.** A deterministic tool result is a row in a
   `tool_calls` log we can replay and verify. An LLM citation is a
   string we have to validate against a moving corpus.
4. **CDSCO defense.** "We retrieve the KB then ask the LLM to compute"
   is harder to defend than "we retrieve the KB then call a tested
   function whose output is logged."

The KB is the source of clinical *knowledge*. The deterministic tools
are the source of clinical *decisions* derived from that knowledge.
Both are necessary; neither is sufficient.
