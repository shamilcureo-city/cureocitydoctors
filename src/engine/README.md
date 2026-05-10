# Cureocity Engine

The deterministic clinical decision-support engine. KBE scoring, drug
interactions, lab interpretation, calculators, ICD-10 lookup, prescription
builder. All clinical safety primitives live here.

## How to consume the engine

**Always import from the barrel:**

```js
import { EngineCore, processIntake, CLINICAL_KB } from '../engine/index.js';
```

Never import from `cureocityEngine.js` directly. The barrel is the contract;
the implementation can move without breaking callers.

## File map

```
src/engine/
├── index.js              ← public API (the only file callers import)
├── cureocityEngine.js    ← implementation (will be split further in 1.3+)
├── timing.js             ← Indian Rx timing + drug-form prefix (pure)
└── __tests__/
    └── engine.test.js    ← 50 tests covering safety-critical paths
```

## Public API surface

### Engine session control
```js
EngineCore       // mutable session API (setPatient, setVital, fillGap, etc.)
S                // session state object — read-only-ish in practice
processIntake()  // re-runs scoring on current state
updateLab(k, v)  // updates a lab value, triggers re-score
```

### Knowledge base (read-only)
```js
CLINICAL_KB              // 30+ conditions with treatment, monitoring, India context
CLINICAL_NOTES           // shared notes object (intake/history/impression)
KB_ID_MAP                // maps engine condition IDs → KB keys
SYMPTOM_BUILDER_GROUPS   // structured symptom builder UI data
FOLLOW_UP_QUESTIONS_DB   // engine-driven "what to ask next" pool
DEMOS                    // 3 demo case narratives for Step 1
lookupKB(condId)         // condition ID → KB entry (or null)
```

### Vitals + allergies
```js
VITALS_DEFS                  // HR, SBP, DBP, RR, SpO2, Temp, GCS, Wt, BMI defs
S_VITALS                     // mutable vital values
isAbnormalVital(key, value)  // returns 'normal'|'low'|'high'|'warning'|'critical'
getVitalsSummary()           // [{ label, value, unit, status }, ...]
S_ALLERGIES                  // mutable allergy list
ALLERGY_CROSS_REACTIVITY     // penicillin → cephalosporin etc.
```

### Labs
```js
LAB_DEFS                  // grouped (cbc, metabolic, cardiac, thyroid, lft, inflam)
getLabStatus(val, def)    // 'normal'|'abnormal-low'|'abnormal-high'|'critical'
CRITICAL_LAB_RULES        // 8 rules surfaced by Slice 9 critical-value overlay
```

### Calculators + ICD-10
```js
CALCULATORS               // 9 risk scores: CURB-65, Wells PE/DVT, GRACE, CHA2DS2-VASc,
                          // FINDRISC, NEWS2, PHQ-9, GAD-7
ICD10_DB                  // 70+ codes
COND_ICD_MAP              // condition ID → suggested ICD codes
```

### Prescription / referral
```js
INDIA_COST_DB             // generic → { brand, cost_month, jan_aushadhi }
getCostEstimate(generic)  // returns the cost row or null
SPECIALIST_MAP            // primary-system → { name, urgency_flag }
checkInteractions(drugs)  // [{ matchedDrugs, sev, desc, resolution }]
mapToIndianTiming(freq, route)   // 'BD' → '1-0-1', 'TDS' → '1-1-1'
getFormPrefix(route, generic)    // 'Oral' → 'Tab.', 'Inhaled' → 'Inh.'
```

### Helpers (rarely needed externally)
```js
termPresent(corpus, term)       // negation-aware substring match
kbeScoreAll(corpus, ...)        // raw scoring for tests / debugging
kbeScoreCondition(...)          // scope a single condition's score
```

## Testing

```bash
npm test          # run once
npm run test:watch   # watch mode during refactors
```

The test suite locks in current engine behavior — including some boundary
behaviors that are non-obvious (e.g., `termPresent` is case-sensitive;
`isAbnormalVital('sbp', 80)` returns `'low'` not `'warning'`). If you change
the engine's behavior, update the tests *intentionally*.

## Future plans (Sprint 1.3+)

The 8.5K-line `cureocityEngine.js` will be split further once the session
container lands in Sprint 1.3. Planned modules:

- `engine/labs.js` — LAB_DEFS + getLabStatus + critical rules
- `engine/calculators.js` — CALCULATORS + computeCalcScore
- `engine/icd.js` — ICD10_DB + COND_ICD_MAP
- `engine/kb.js` — CLINICAL_KB + lookupKB + KB_ID_MAP
- `engine/scoring.js` — kbeScoreAll, kbeBuildDifferential, kbeBuildNextSteps
- `engine/prescriber.js` — Rx-related EngineCore methods
- `engine/symptoms.js` — SYSTEMS + activators + SYMPTOM_BUILDER_GROUPS

The barrel (`index.js`) hides this transition from consumers — when modules
get extracted, only the barrel's internal re-exports change.

## Safety notes

- Every change in this directory should be accompanied by a passing test
- The `S` module-level state is **shared across all consumers** (single-tab
  assumption). Multi-tab / multi-doctor concurrency requires Sprint 1.3 to
  land first.
- Never log clinical data to Sentry, console, or any external system. The
  engine receives PII; treat it as toxic.
