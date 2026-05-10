// Tool schemas for the Cureocity clinical agent.
//
// These are the JSONSchema definitions Anthropic's Messages API expects
// in the `tools` array. Each tool here corresponds to a handler in
// ./handlers.js (Class A: deterministic) or ./dataTools.js (data ops).
//
// Source of truth for the boundary between LLM and deterministic logic:
// docs/architecture/tool-boundary.md

export const TOOL_SCHEMAS = [
  // ───────────────────────────────────────────────────────────────────
  // CLASS A: deterministic clinical safety tools
  // ───────────────────────────────────────────────────────────────────
  {
    name: 'search_kb',
    description:
      'Retrieve top-k clinical knowledge-base chunks for a query. Use this BEFORE any clinical claim. Filters narrow by condition, drug, age group, or guideline source.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Plain-English query, e.g. "community acquired pneumonia severity assessment"',
        },
        filters: {
          type: 'object',
          properties: {
            conditions: { type: 'array', items: { type: 'string' } },
            drugs: { type: 'array', items: { type: 'string' } },
            age_groups: {
              type: 'array',
              items: { type: 'string', enum: ['paeds', 'adult', 'geriatric', 'pregnancy'] },
            },
            guideline: { type: 'string', enum: ['ICMR', 'NICE', 'WHO', 'AHA', 'ACS', 'BNF'] },
          },
        },
        k: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
      },
      required: ['query'],
    },
  },

  {
    name: 'drug_interactions',
    description:
      'Check drug-drug, drug-disease, drug-allergy, drug-age, drug-pregnancy, drug-lactation interactions. MANDATORY before suggesting any drug and at Rx finalization. Returns severity-graded list.',
    input_schema: {
      type: 'object',
      properties: {
        drugs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Generic drug names. Brand names are auto-resolved.',
          minItems: 1,
        },
        patient_context: {
          type: 'object',
          properties: {
            age_years: { type: 'number' },
            sex: { type: 'string', enum: ['M', 'F', 'other'] },
            weight_kg: { type: 'number' },
            comorbidities: { type: 'array', items: { type: 'string' } },
            allergies: { type: 'array', items: { type: 'string' } },
            crcl_ml_min: { type: 'number' },
            child_pugh: { type: 'string', enum: ['A', 'B', 'C'] },
            is_pregnant: { type: 'boolean' },
            pregnancy_trimester: { type: 'integer', minimum: 1, maximum: 3 },
            is_lactating: { type: 'boolean' },
          },
        },
      },
      required: ['drugs'],
    },
  },

  {
    name: 'dose_check',
    description:
      'Compute the validated dose, frequency, duration, and max-per-day for a drug given patient context. MANDATORY before stating any dose. Returns mg amounts based on age/weight/renal/hepatic context. Returns null with reason if no safe dose applies.',
    input_schema: {
      type: 'object',
      properties: {
        drug: { type: 'string', description: 'Generic name (brand auto-resolved)' },
        indication: { type: 'string' },
        route: { type: 'string', enum: ['PO', 'IV', 'IM', 'SC', 'IN', 'PR', 'topical', 'inhaled'] },
        patient: {
          type: 'object',
          properties: {
            age_years: { type: 'number' },
            weight_kg: { type: 'number' },
            crcl_ml_min: { type: 'number' },
            child_pugh: { type: 'string', enum: ['A', 'B', 'C'] },
            is_pregnant: { type: 'boolean' },
            is_lactating: { type: 'boolean' },
          },
          required: ['age_years'],
        },
      },
      required: ['drug', 'indication', 'patient'],
    },
  },

  {
    name: 'calc_risk_score',
    description:
      'Compute a clinical risk score deterministically. MANDATORY for any score statement. Available scores: curb65, news2, wells_pe, wells_dvt, grace, has_bled, chads_vasc, perc, ottawa_ankle, centor.',
    input_schema: {
      type: 'object',
      properties: {
        score_type: {
          type: 'string',
          enum: [
            'curb65', 'news2', 'wells_pe', 'wells_dvt', 'grace',
            'has_bled', 'chads_vasc', 'perc', 'ottawa_ankle', 'centor',
          ],
        },
        params: {
          type: 'object',
          description: 'Score-specific parameters; see tool docs for the per-score schema.',
          additionalProperties: true,
        },
      },
      required: ['score_type', 'params'],
    },
  },

  {
    name: 'flag_red_flag',
    description:
      'Escalate a detected red-flag phrase. Call IMMEDIATELY when detected — do not wait for the next agent turn. The phrase is logged, the doctor sees a banner, and (for p0) the consult auto-pauses for acknowledgement.',
    input_schema: {
      type: 'object',
      properties: {
        phrase: { type: 'string', description: 'Verbatim phrase from transcript' },
        severity: { type: 'string', enum: ['p0_immediate', 'p1_urgent', 'p2_priority'] },
        category: {
          type: 'string',
          enum: ['cardiac', 'neuro', 'gi', 'obs', 'paeds', 'sepsis', 'resp', 'trauma', 'tox', 'other'],
        },
        rationale: { type: 'string', description: 'One-sentence why-this-matters' },
      },
      required: ['phrase', 'severity', 'category', 'rationale'],
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // DATA OPS: read/write Supabase
  // ───────────────────────────────────────────────────────────────────
  {
    name: 'patient_history',
    description:
      'Fetch the patient\'s prior consultations, prescriptions, allergies, and key conditions. Use when the doctor identifies an existing patient by phone or name.',
    input_schema: {
      type: 'object',
      properties: {
        phone_e164: { type: 'string', pattern: '^\\+[1-9][0-9]{6,14}$' },
        patient_id: { type: 'string', description: 'UUID; alternative to phone' },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['consultations', 'prescriptions', 'allergies', 'conditions'] },
          default: ['consultations', 'prescriptions', 'allergies', 'conditions'],
        },
        max_consultations: { type: 'integer', default: 5, maximum: 20 },
      },
    },
  },

  {
    name: 'save_consult_event',
    description:
      'Append an event to the consultation event log. Use for working-diagnosis updates, key state changes, and decision points. Read-only fields (transcript, vitals from STT) are auto-logged elsewhere — do not duplicate.',
    input_schema: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          enum: [
            'agent.diagnosis_update',
            'agent.workup_suggested',
            'agent.warning_raised',
            'agent.note',
            'consult.finalized',
          ],
        },
        payload: { type: 'object', additionalProperties: true },
      },
      required: ['event_type', 'payload'],
    },
  },

  {
    name: 'finalize_rx',
    description:
      'Generate the validated prescription. Each item is re-checked via drug_interactions + dose_check; mismatches block finalization with a blocking warning the doctor must resolve. Returns the structured Rx ready for doctor signature.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              drug_generic: { type: 'string' },
              brand_preference: { type: 'string', description: 'Optional preferred Indian brand' },
              indication: { type: 'string' },
              route: { type: 'string', enum: ['PO', 'IV', 'IM', 'SC', 'IN', 'PR', 'topical', 'inhaled'] },
              dose_mg: { type: 'number', description: 'Single-dose mg from dose_check tool' },
              frequency: { type: 'string' },
              duration_days: { type: 'number' },
              instructions: { type: 'string' },
            },
            required: ['drug_generic', 'indication', 'route', 'dose_mg', 'frequency', 'duration_days'],
          },
        },
        advice: {
          type: 'array',
          items: { type: 'string' },
          description: 'Patient-facing advice items in plain language',
        },
        follow_up_days: { type: 'integer' },
        referral: {
          type: 'object',
          properties: {
            specialist: { type: 'string' },
            urgency: { type: 'string', enum: ['routine', 'urgent', 'emergency'] },
            reason: { type: 'string' },
          },
        },
      },
      required: ['items'],
    },
  },
];

// Quick lookup
export const TOOL_NAMES = TOOL_SCHEMAS.map(t => t.name);

export const CLASS_A_TOOLS = new Set([
  'search_kb',
  'drug_interactions',
  'dose_check',
  'calc_risk_score',
  'flag_red_flag',
]);
