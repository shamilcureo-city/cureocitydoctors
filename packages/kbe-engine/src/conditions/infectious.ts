// ──────────────────────────────────────────────────────────────────────────────
// KBE Engine – Infectious Disease Profiles (Kerala Endemic)
// ──────────────────────────────────────────────────────────────────────────────

import type { ConditionProfile } from '../types/index.js';

// ── Dengue Fever ─────────────────────────────────────────────────────────────

export const dengueFever: ConditionProfile = {
  id: 'INF-001',
  name: 'Dengue Fever',
  icd10: 'A90',
  system: 'infectious',
  positiveEvidence: [
    { term: 'fever', weight: 8, category: 'symptom' },
    { term: 'headache', weight: 5, category: 'symptom' },
    { term: 'myalgia', weight: 6, category: 'symptom' },
    { term: 'arthralgia', weight: 6, category: 'symptom' },
    { term: 'retro-orbital pain', weight: 7, category: 'symptom' },
    { term: 'rash', weight: 5, category: 'sign' },
    { term: 'thrombocytopenia', weight: 9, category: 'lab' },
    { term: 'leucopenia', weight: 7, category: 'lab' },
    { term: 'petechiae', weight: 7, category: 'sign' },
    { term: 'tourniquet test positive', weight: 6, category: 'sign' },
    { term: 'nausea', weight: 3, category: 'symptom' },
    { term: 'vomiting', weight: 3, category: 'symptom' },
    { term: 'abdominal pain', weight: 4, category: 'symptom' },
    { term: 'ns1 antigen positive', weight: 10, category: 'lab' },
    { term: 'dengue igg igm positive', weight: 10, category: 'lab' },
  ],
  negativeEvidence: [
    { term: 'productive cough', weight: 4, category: 'symptom' },
    { term: 'sore throat', weight: 3, category: 'symptom' },
    { term: 'diarrhea', weight: 2, category: 'symptom' },
  ],
  redFlags: [
    'Persistent vomiting',
    'Severe abdominal pain',
    'Mucosal bleeding',
    'Platelet count < 20000',
    'Hypotension',
    'Pleural effusion',
    'Ascites',
    'Restlessness or lethargy',
  ],
  keralaPrior: 0.4, // High during monsoon season (Jun-Nov)
  comorbidityModifiers: [
    { condition: 'diabetes mellitus', scoreAdjustment: 2 },
    { condition: 'chronic liver disease', scoreAdjustment: 3 },
  ],
  treatmentProtocol: {
    firstLine: [
      {
        drug: 'Paracetamol',
        brandName: 'Dolo',
        dose: '650mg',
        frequency: '1-0-1',
        route: 'Tab.',
        duration: '5 days',
        instructions: 'SOS for fever, max 4g/day',
      },
      {
        drug: 'ORS',
        dose: '1 sachet in 1L water',
        frequency: '1-1-1',
        route: 'Syr.',
        duration: '5 days',
        instructions: 'Adequate oral hydration',
      },
      {
        drug: 'Pantoprazole',
        brandName: 'Pan',
        dose: '40mg',
        frequency: '1-0-0',
        route: 'Tab.',
        duration: '5 days',
        instructions: 'Before breakfast',
      },
    ],
    investigations: [
      'CBC with platelet count - daily',
      'NS1 Antigen (Day 1-5)',
      'Dengue IgG/IgM (Day 5+)',
      'LFT',
      'USG Abdomen if warning signs',
    ],
    monitoring: [
      'Daily platelet count',
      'Hematocrit monitoring',
      'Fluid balance',
      'Watch for warning signs',
    ],
    referralCriteria: [
      'Platelet < 50000',
      'Signs of plasma leakage',
      'Persistent vomiting',
      'Severe abdominal pain',
      'Mucosal or GI bleeding',
      'Altered sensorium',
    ],
    followUpDays: 2,
  },
  discriminatingQuestions: [
    {
      question: 'Is there pain behind the eyes (retro-orbital)?',
      ifYes: [
        { condition: 'INF-001', scoreBoost: 8 },
        { condition: 'INF-004', scoreBoost: -2 },
      ],
      ifNo: [
        { condition: 'INF-001', scoreBoost: -3 },
      ],
    },
    {
      question: 'Are there any bleeding manifestations (gum bleeding, petechiae, blood in vomit)?',
      ifYes: [
        { condition: 'INF-001', scoreBoost: 10 },
        { condition: 'INF-002', scoreBoost: 5 },
      ],
      ifNo: [
        { condition: 'INF-001', scoreBoost: -2 },
      ],
    },
    {
      question: 'Did the fever start suddenly with severe body pain?',
      ifYes: [
        { condition: 'INF-001', scoreBoost: 5 },
        { condition: 'INF-003', scoreBoost: 4 },
      ],
      ifNo: [
        { condition: 'INF-004', scoreBoost: 3 },
      ],
    },
  ],
};

// ── Leptospirosis ────────────────────────────────────────────────────────────

export const leptospirosis: ConditionProfile = {
  id: 'INF-002',
  name: 'Leptospirosis',
  icd10: 'A27.9',
  system: 'infectious',
  positiveEvidence: [
    { term: 'fever', weight: 8, category: 'symptom' },
    { term: 'myalgia', weight: 7, category: 'symptom' },
    { term: 'headache', weight: 5, category: 'symptom' },
    { term: 'conjunctival suffusion', weight: 9, category: 'sign' },
    { term: 'jaundice', weight: 8, category: 'sign' },
    { term: 'oliguria', weight: 7, category: 'symptom' },
    { term: 'calf tenderness', weight: 8, category: 'sign' },
    { term: 'elevated creatinine', weight: 7, category: 'lab' },
    { term: 'thrombocytopenia', weight: 6, category: 'lab' },
    { term: 'paddy field exposure', weight: 9, category: 'risk_factor' },
    { term: 'flood exposure', weight: 9, category: 'risk_factor' },
    { term: 'animal contact', weight: 6, category: 'risk_factor' },
    { term: 'dark urine', weight: 5, category: 'symptom' },
    { term: 'hemorrhage', weight: 7, category: 'sign' },
    { term: 'leptospira igm positive', weight: 10, category: 'lab' },
  ],
  negativeEvidence: [
    { term: 'rash', weight: 3, category: 'sign' },
    { term: 'lymphadenopathy', weight: 3, category: 'sign' },
  ],
  redFlags: [
    'Acute kidney injury',
    'Pulmonary hemorrhage',
    'Jaundice with renal failure (Weil disease)',
    'Altered sensorium',
    'Hypotension / shock',
    'Severe thrombocytopenia',
  ],
  keralaPrior: 0.5, // Very high during monsoon / post-flood
  ageRange: { min: 15 },
  comorbidityModifiers: [
    { condition: 'chronic kidney disease', scoreAdjustment: 3 },
    { condition: 'chronic liver disease', scoreAdjustment: 3 },
    { condition: 'diabetes mellitus', scoreAdjustment: 2 },
  ],
  treatmentProtocol: {
    firstLine: [
      {
        drug: 'Doxycycline',
        dose: '100mg',
        frequency: '1-0-1',
        route: 'Cap.',
        duration: '7 days',
        instructions: 'After food, avoid in pregnancy',
      },
      {
        drug: 'Paracetamol',
        brandName: 'Dolo',
        dose: '650mg',
        frequency: '1-0-1',
        route: 'Tab.',
        duration: '5 days',
        instructions: 'SOS for fever',
      },
      {
        drug: 'Pantoprazole',
        brandName: 'Pan',
        dose: '40mg',
        frequency: '1-0-0',
        route: 'Tab.',
        duration: '7 days',
        instructions: 'Before breakfast',
      },
    ],
    investigations: [
      'CBC with platelet count',
      'RFT (Creatinine, BUN)',
      'LFT (Bilirubin, SGOT, SGPT)',
      'Leptospira IgM',
      'Urine routine',
      'CXR if respiratory symptoms',
    ],
    monitoring: [
      'Daily renal function',
      'Urine output monitoring',
      'Watch for hemorrhagic complications',
      'Liver function trend',
    ],
    referralCriteria: [
      'Creatinine > 3 mg/dL',
      'Pulmonary involvement',
      'Persistent hypotension',
      'Weil disease features',
      'Need for dialysis',
    ],
    followUpDays: 3,
  },
  discriminatingQuestions: [
    {
      question: 'Has the patient had recent exposure to flood water or paddy fields?',
      ifYes: [
        { condition: 'INF-002', scoreBoost: 10 },
        { condition: 'INF-001', scoreBoost: -2 },
      ],
      ifNo: [
        { condition: 'INF-002', scoreBoost: -5 },
      ],
    },
    {
      question: 'Is there calf muscle pain or tenderness?',
      ifYes: [
        { condition: 'INF-002', scoreBoost: 8 },
      ],
      ifNo: [
        { condition: 'INF-002', scoreBoost: -3 },
      ],
    },
    {
      question: 'Are the eyes red (conjunctival suffusion without discharge)?',
      ifYes: [
        { condition: 'INF-002', scoreBoost: 9 },
        { condition: 'INF-001', scoreBoost: -2 },
      ],
      ifNo: [
        { condition: 'INF-002', scoreBoost: -2 },
      ],
    },
  ],
};

// ── Scrub Typhus ─────────────────────────────────────────────────────────────

export const scrubTyphus: ConditionProfile = {
  id: 'INF-003',
  name: 'Scrub Typhus',
  icd10: 'A75.3',
  system: 'infectious',
  positiveEvidence: [
    { term: 'fever', weight: 8, category: 'symptom' },
    { term: 'eschar', weight: 10, category: 'sign' },
    { term: 'headache', weight: 5, category: 'symptom' },
    { term: 'myalgia', weight: 5, category: 'symptom' },
    { term: 'lymphadenopathy', weight: 7, category: 'sign' },
    { term: 'rash', weight: 5, category: 'sign' },
    { term: 'hepatosplenomegaly', weight: 6, category: 'sign' },
    { term: 'elevated transaminases', weight: 6, category: 'lab' },
    { term: 'thrombocytopenia', weight: 5, category: 'lab' },
    { term: 'scrub bush exposure', weight: 8, category: 'risk_factor' },
    { term: 'rural area', weight: 4, category: 'risk_factor' },
    { term: 'weil-felix positive', weight: 8, category: 'lab' },
    { term: 'scrub typhus igm positive', weight: 10, category: 'lab' },
  ],
  negativeEvidence: [
    { term: 'diarrhea', weight: 3, category: 'symptom' },
    { term: 'dysuria', weight: 4, category: 'symptom' },
  ],
  redFlags: [
    'ARDS / respiratory distress',
    'Meningoencephalitis',
    'Myocarditis',
    'Multi-organ dysfunction',
    'DIC',
    'Altered sensorium',
  ],
  keralaPrior: 0.3, // Endemic, peak post-monsoon
  comorbidityModifiers: [
    { condition: 'diabetes mellitus', scoreAdjustment: 2 },
    { condition: 'immunosuppression', scoreAdjustment: 3 },
  ],
  treatmentProtocol: {
    firstLine: [
      {
        drug: 'Doxycycline',
        dose: '100mg',
        frequency: '1-0-1',
        route: 'Cap.',
        duration: '7 days',
        instructions: 'After food, first-line treatment',
      },
      {
        drug: 'Azithromycin',
        dose: '500mg',
        frequency: '1-0-0',
        route: 'Tab.',
        duration: '5 days',
        instructions: 'Alternative if Doxycycline contraindicated (pregnancy)',
      },
      {
        drug: 'Paracetamol',
        brandName: 'Dolo',
        dose: '650mg',
        frequency: '1-0-1',
        route: 'Tab.',
        duration: '5 days',
        instructions: 'SOS for fever',
      },
    ],
    investigations: [
      'CBC',
      'LFT',
      'RFT',
      'Weil-Felix test',
      'Scrub Typhus IgM ELISA',
      'CXR',
      'Peripheral smear',
    ],
    monitoring: [
      'Fever defervescence (expect within 48h of Doxycycline)',
      'Liver function trend',
      'Watch for complications',
    ],
    referralCriteria: [
      'No response to Doxycycline in 48 hours',
      'ARDS',
      'Meningoencephalitis',
      'Multi-organ involvement',
    ],
    followUpDays: 3,
  },
  discriminatingQuestions: [
    {
      question: 'Is there a painless black scab (eschar) anywhere on the body?',
      ifYes: [
        { condition: 'INF-003', scoreBoost: 15 },
        { condition: 'INF-001', scoreBoost: -5 },
        { condition: 'INF-002', scoreBoost: -5 },
      ],
      ifNo: [
        { condition: 'INF-003', scoreBoost: -4 },
      ],
    },
    {
      question: 'Has the patient been in rural/bush areas or agricultural fields recently?',
      ifYes: [
        { condition: 'INF-003', scoreBoost: 7 },
        { condition: 'INF-002', scoreBoost: 5 },
      ],
      ifNo: [
        { condition: 'INF-003', scoreBoost: -3 },
      ],
    },
  ],
};

// ── Typhoid Fever ────────────────────────────────────────────────────────────

export const typhoidFever: ConditionProfile = {
  id: 'INF-004',
  name: 'Typhoid Fever',
  icd10: 'A01.0',
  system: 'infectious',
  positiveEvidence: [
    { term: 'fever', weight: 8, category: 'symptom' },
    { term: 'headache', weight: 4, category: 'symptom' },
    { term: 'abdominal pain', weight: 6, category: 'symptom' },
    { term: 'diarrhea', weight: 4, category: 'symptom' },
    { term: 'constipation', weight: 4, category: 'symptom' },
    { term: 'hepatosplenomegaly', weight: 6, category: 'sign' },
    { term: 'coated tongue', weight: 5, category: 'sign' },
    { term: 'relative bradycardia', weight: 7, category: 'sign' },
    { term: 'rose spots', weight: 8, category: 'sign' },
    { term: 'stepladder fever', weight: 7, category: 'history' },
    { term: 'anorexia', weight: 3, category: 'symptom' },
    { term: 'malaise', weight: 2, category: 'symptom' },
    { term: 'widal positive', weight: 7, category: 'lab' },
    { term: 'typhidot positive', weight: 9, category: 'lab' },
    { term: 'blood culture salmonella', weight: 10, category: 'lab' },
    { term: 'leucopenia', weight: 5, category: 'lab' },
  ],
  negativeEvidence: [
    { term: 'retro-orbital pain', weight: 4, category: 'symptom' },
    { term: 'rash', weight: 2, category: 'sign' },
    { term: 'conjunctival suffusion', weight: 4, category: 'sign' },
  ],
  redFlags: [
    'GI bleeding / melena',
    'Intestinal perforation signs',
    'Altered sensorium / encephalopathy',
    'Myocarditis',
    'Persistent high fever > 2 weeks',
  ],
  keralaPrior: 0.2, // Endemic year-round
  comorbidityModifiers: [
    { condition: 'hiv', scoreAdjustment: 3 },
    { condition: 'immunosuppression', scoreAdjustment: 3 },
    { condition: 'sickle cell disease', scoreAdjustment: 2 },
  ],
  treatmentProtocol: {
    firstLine: [
      {
        drug: 'Cefixime',
        brandName: 'Taxim-O',
        dose: '200mg',
        frequency: '1-0-1',
        route: 'Tab.',
        duration: '14 days',
        instructions: 'Complete full course',
      },
      {
        drug: 'Azithromycin',
        dose: '500mg',
        frequency: '1-0-0',
        route: 'Tab.',
        duration: '7 days',
        instructions: 'Alternative first-line',
      },
      {
        drug: 'Paracetamol',
        brandName: 'Dolo',
        dose: '650mg',
        frequency: '1-0-1',
        route: 'Tab.',
        duration: '5 days',
        instructions: 'SOS for fever',
      },
      {
        drug: 'Pantoprazole',
        brandName: 'Pan',
        dose: '40mg',
        frequency: '1-0-0',
        route: 'Tab.',
        duration: '14 days',
        instructions: 'Before breakfast',
      },
    ],
    investigations: [
      'CBC',
      'Blood culture and sensitivity',
      'Widal test',
      'Typhidot IgM',
      'LFT',
      'USG Abdomen',
    ],
    monitoring: [
      'Fever chart',
      'Watch for GI complications',
      'Blood culture if no response in 5 days',
    ],
    referralCriteria: [
      'No defervescence after 5 days of antibiotics',
      'GI bleeding',
      'Signs of perforation',
      'Encephalopathy',
      'Multi-drug resistant typhoid',
    ],
    followUpDays: 5,
  },
  discriminatingQuestions: [
    {
      question: 'Has the fever been gradually increasing over several days (stepladder pattern)?',
      ifYes: [
        { condition: 'INF-004', scoreBoost: 8 },
        { condition: 'INF-001', scoreBoost: -3 },
      ],
      ifNo: [
        { condition: 'INF-004', scoreBoost: -3 },
        { condition: 'INF-001', scoreBoost: 3 },
      ],
    },
    {
      question: 'Is there constipation or alternating constipation and diarrhea?',
      ifYes: [
        { condition: 'INF-004', scoreBoost: 6 },
        { condition: 'INF-005', scoreBoost: -3 },
      ],
      ifNo: [
        { condition: 'INF-004', scoreBoost: -2 },
      ],
    },
    {
      question: 'Did the patient consume outside food or contaminated water recently?',
      ifYes: [
        { condition: 'INF-004', scoreBoost: 5 },
        { condition: 'INF-005', scoreBoost: 5 },
      ],
      ifNo: [],
    },
  ],
};

// ── Acute Gastroenteritis ────────────────────────────────────────────────────

export const acuteGastroenteritis: ConditionProfile = {
  id: 'INF-005',
  name: 'Acute Gastroenteritis',
  icd10: 'A09',
  system: 'infectious',
  positiveEvidence: [
    { term: 'diarrhea', weight: 9, category: 'symptom' },
    { term: 'vomiting', weight: 8, category: 'symptom' },
    { term: 'nausea', weight: 6, category: 'symptom' },
    { term: 'abdominal pain', weight: 6, category: 'symptom' },
    { term: 'abdominal cramps', weight: 7, category: 'symptom' },
    { term: 'fever', weight: 4, category: 'symptom' },
    { term: 'dehydration', weight: 7, category: 'sign' },
    { term: 'contaminated food', weight: 8, category: 'history' },
    { term: 'contaminated water', weight: 8, category: 'history' },
    { term: 'similar illness in contacts', weight: 6, category: 'history' },
    { term: 'watery stools', weight: 7, category: 'symptom' },
    { term: 'urgency', weight: 4, category: 'symptom' },
    { term: 'tenesmus', weight: 5, category: 'symptom' },
  ],
  negativeEvidence: [
    { term: 'retro-orbital pain', weight: 5, category: 'symptom' },
    { term: 'rash', weight: 4, category: 'sign' },
    { term: 'jaundice', weight: 5, category: 'sign' },
    { term: 'eschar', weight: 5, category: 'sign' },
  ],
  redFlags: [
    'Severe dehydration (sunken eyes, skin turgor loss)',
    'Blood in stools (dysentery)',
    'High-grade fever > 39°C',
    'Unable to tolerate oral fluids',
    'Oliguria / anuria',
    'Altered sensorium',
    'Elderly patient (>65) or infant',
  ],
  keralaPrior: 0.3, // Common year-round, peaks in monsoon
  comorbidityModifiers: [
    { condition: 'diabetes mellitus', scoreAdjustment: 2 },
    { condition: 'chronic kidney disease', scoreAdjustment: 3 },
    { condition: 'immunosuppression', scoreAdjustment: 3 },
  ],
  treatmentProtocol: {
    firstLine: [
      {
        drug: 'ORS',
        dose: '1 sachet in 1L water',
        frequency: 'After every loose stool',
        route: 'Syr.',
        duration: '3-5 days',
        instructions: 'Sip frequently, main treatment',
      },
      {
        drug: 'Ondansetron',
        brandName: 'Emeset',
        dose: '4mg',
        frequency: '1-0-1',
        route: 'Tab.',
        duration: '3 days',
        instructions: 'SOS for vomiting',
      },
      {
        drug: 'Racecadotril',
        brandName: 'Redotril',
        dose: '100mg',
        frequency: '1-1-1',
        route: 'Cap.',
        duration: '3 days',
        instructions: 'Anti-secretory, before food',
      },
      {
        drug: 'Zinc',
        dose: '20mg',
        frequency: '1-0-0',
        route: 'Tab.',
        duration: '14 days',
        instructions: 'Supports gut recovery',
      },
      {
        drug: 'Probiotics',
        brandName: 'Vizylac',
        dose: '1 cap',
        frequency: '1-0-1',
        route: 'Cap.',
        duration: '5 days',
        instructions: 'After food',
      },
    ],
    investigations: [
      'Stool routine and microscopy',
      'Stool culture if bloody diarrhea',
      'CBC',
      'Serum electrolytes',
      'RFT if dehydrated',
    ],
    monitoring: [
      'Hydration status',
      'Stool frequency and consistency',
      'Urine output',
      'Oral intake tolerance',
    ],
    referralCriteria: [
      'Severe dehydration not responding to ORS',
      'Bloody diarrhea with high fever',
      'Unable to tolerate oral fluids',
      'Electrolyte imbalance',
      'Renal impairment',
    ],
    followUpDays: 3,
  },
  discriminatingQuestions: [
    {
      question: 'Did the symptoms start within hours of eating outside food?',
      ifYes: [
        { condition: 'INF-005', scoreBoost: 8 },
        { condition: 'INF-004', scoreBoost: 2 },
      ],
      ifNo: [
        { condition: 'INF-005', scoreBoost: -2 },
      ],
    },
    {
      question: 'Is there blood or mucus in the stools?',
      ifYes: [
        { condition: 'INF-005', scoreBoost: 3 },
        { condition: 'INF-004', scoreBoost: 4 },
      ],
      ifNo: [
        { condition: 'INF-005', scoreBoost: 2 },
      ],
    },
    {
      question: 'Are other family members or contacts also affected?',
      ifYes: [
        { condition: 'INF-005', scoreBoost: 7 },
        { condition: 'INF-004', scoreBoost: -2 },
      ],
      ifNo: [],
    },
    {
      question: 'How many episodes of loose stools in the last 24 hours (>6)?',
      ifYes: [
        { condition: 'INF-005', scoreBoost: 5 },
      ],
      ifNo: [
        { condition: 'INF-005', scoreBoost: -1 },
      ],
    },
  ],
};

/** All infectious disease condition profiles. */
export const infectiousConditions: ConditionProfile[] = [
  dengueFever,
  leptospirosis,
  scrubTyphus,
  typhoidFever,
  acuteGastroenteritis,
];
