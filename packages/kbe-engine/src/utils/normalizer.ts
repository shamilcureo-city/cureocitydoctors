// ──────────────────────────────────────────────────────────────────────────────
// KBE Engine – Normalization Pipeline
//
// Converts free-text clinical input (including Manglish, shorthand, typos, and
// multi-word phrases) into a canonical corpus of clinical terms.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Malayalam-English transliterations (Manglish) to canonical clinical terms.
 */
export const MANGLISH_MAP: Record<string, string> = {
  'vayaru vedana': 'abdominal pain',
  'vayaru veedanam': 'abdominal pain',
  'mootra theeppu': 'dysuria burning urination',
  'thala vedana': 'headache',
  'thala veedanam': 'headache',
  'nenju vedana': 'chest pain',
  'nenju veedanam': 'chest pain',
  'pani': 'fever',
  'jwaram': 'fever',
  'chuma': 'cough',
  'kashu': 'cough',
  'mookkadappu': 'nasal congestion',
  'vaayil kumathal': 'nausea',
  'okkanam': 'vomiting',
  'cherthi': 'vomiting',
  'vatham': 'joint pain',
  'neeru veekkam': 'edema swelling',
  'moothram': 'urine',
  'raktham': 'blood',
  'thol': 'skin',
  'kannu': 'eye',
  'chevi': 'ear',
  'vayaru': 'abdomen stomach',
  'thala chakkar': 'dizziness vertigo',
  'virakkal': 'tremor',
  'malabandham': 'constipation',
  'vayarittu': 'diarrhea loose stools',
  'uyarchha rakthasamardham': 'hypertension high blood pressure',
  'prameham': 'diabetes',
  'swasam mudakku': 'breathlessness dyspnea',
  'neerizhivu': 'diabetes mellitus',
};

/**
 * Indian medical shorthand / abbreviations.
 */
export const SHORTHAND_MAP: Record<string, string> = {
  'ocp': 'oral contraceptive pill',
  'lft': 'liver function test',
  'rft': 'renal function test',
  'cbc': 'complete blood count',
  'esr': 'erythrocyte sedimentation rate',
  'crp': 'c-reactive protein',
  'hba1c': 'glycated hemoglobin',
  'fbs': 'fasting blood sugar',
  'ppbs': 'post prandial blood sugar',
  'rbs': 'random blood sugar',
  'ecg': 'electrocardiogram',
  'cxr': 'chest x-ray',
  'usg': 'ultrasonography',
  'ct': 'computed tomography',
  'mri': 'magnetic resonance imaging',
  'abg': 'arterial blood gas',
  'pt/inr': 'prothrombin time international normalized ratio',
  'gfr': 'glomerular filtration rate',
  'bmi': 'body mass index',
  'bp': 'blood pressure',
  'sob': 'shortness of breath',
  'npo': 'nil per oral',
  'tid': 'three times daily',
  'bd': 'twice daily',
  'od': 'once daily',
  'hs': 'at bedtime',
  'sos': 'as needed',
  'rta': 'road traffic accident',
  'dm': 'diabetes mellitus',
  'htn': 'hypertension',
  'ckd': 'chronic kidney disease',
  'copd': 'chronic obstructive pulmonary disease',
  'ihd': 'ischemic heart disease',
  'cad': 'coronary artery disease',
};

/**
 * Common clinical misspellings.
 */
export const SPELL_MAP: Record<string, string> = {
  'brething': 'breathing',
  'breathng': 'breathing',
  'polydypsia': 'polydipsia',
  'diabetis': 'diabetes',
  'diabeties': 'diabetes',
  'hypertention': 'hypertension',
  'hypertenshion': 'hypertension',
  'diarhea': 'diarrhea',
  'diarrhoea': 'diarrhea',
  'diarreah': 'diarrhea',
  'nuasea': 'nausea',
  'nasea': 'nausea',
  'vomitting': 'vomiting',
  'abdomnal': 'abdominal',
  'abdomin': 'abdominal',
  'fatiuge': 'fatigue',
  'fatique': 'fatigue',
  'headach': 'headache',
  'palpatation': 'palpitation',
  'palpitaion': 'palpitation',
  'dysentry': 'dysentery',
  'jaundis': 'jaundice',
  'jondice': 'jaundice',
  'pneumona': 'pneumonia',
  'newmonia': 'pneumonia',
  'temprature': 'temperature',
};

/**
 * Multi-word phrase synonyms to canonical clinical terms.
 */
export const PHRASES_MAP: Record<string, string> = {
  'stomach pain': 'abdominal pain',
  'tummy pain': 'abdominal pain',
  'belly pain': 'abdominal pain',
  'burning urination': 'dysuria',
  'painful urination': 'dysuria',
  'loose motion': 'diarrhea',
  'loose motions': 'diarrhea',
  'loose stools': 'diarrhea',
  'watery stools': 'diarrhea',
  'running nose': 'rhinorrhea',
  'runny nose': 'rhinorrhea',
  'body pain': 'myalgia',
  'body ache': 'myalgia',
  'muscle pain': 'myalgia',
  'joint pain': 'arthralgia',
  'joint swelling': 'arthritis',
  'chest tightness': 'chest pain',
  'weight loss': 'unintentional weight loss',
  'weight gain': 'unintentional weight gain',
  'loss of appetite': 'anorexia',
  'no appetite': 'anorexia',
  'cannot sleep': 'insomnia',
  'not sleeping': 'insomnia',
  'blood in stool': 'hematochezia',
  'blood in urine': 'hematuria',
  'blood in sputum': 'hemoptysis',
  'coughing blood': 'hemoptysis',
  'high sugar': 'hyperglycemia',
  'low sugar': 'hypoglycemia',
  'high bp': 'hypertension',
  'low bp': 'hypotension',
  'feeling faint': 'presyncope',
  'blurred vision': 'visual disturbance',
  'dark urine': 'choluria',
  'yellow eyes': 'icterus jaundice',
  'swollen legs': 'pedal edema',
  'swollen feet': 'pedal edema',
  'breathing difficulty': 'dyspnea',
  'difficulty breathing': 'dyspnea',
  'shortness of breath': 'dyspnea',
  'cold and cough': 'upper respiratory infection',
  'skin rash': 'rash dermatitis',
  'night sweats': 'nocturnal diaphoresis',
};

// ── Normalizer Pipeline ──────────────────────────────────────────────────────

/**
 * Normalize a raw clinical input string into an array of canonical corpus terms.
 *
 * Pipeline order:
 *   1. Lowercase + trim
 *   2. Manglish expansion (longest-match first)
 *   3. Phrase mapping (longest-match first)
 *   4. Spell correction (token-level)
 *   5. Shorthand expansion (token-level)
 *   6. Deduplicate and return
 */
export function normalizeInput(input: string): string[] {
  if (!input || input.trim().length === 0) {
    return [];
  }

  let text = input.toLowerCase().trim();

  // Strip excess whitespace
  text = text.replace(/\s+/g, ' ');

  // Phase 1: Manglish expansion (longest match first to avoid partial hits)
  text = applyPhraseMap(text, MANGLISH_MAP);

  // Phase 2: Multi-word phrase mapping
  text = applyPhraseMap(text, PHRASES_MAP);

  // Phase 3 & 4: Token-level spell correction and shorthand expansion
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const correctedTokens: string[] = [];

  for (const token of tokens) {
    let t = token;

    // Spell correction
    if (SPELL_MAP[t]) {
      t = SPELL_MAP[t];
    }

    // Shorthand expansion
    if (SHORTHAND_MAP[t]) {
      t = SHORTHAND_MAP[t];
    }

    correctedTokens.push(t);
  }

  // Rejoin, then split into individual terms for the corpus
  const expanded = correctedTokens.join(' ');
  const corpusTerms = expanded
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[^a-z0-9/-]/g, ''))
    .filter((t) => t.length > 1);

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of corpusTerms) {
    if (!seen.has(term)) {
      seen.add(term);
      result.push(term);
    }
  }

  return result;
}

/**
 * Replace phrase-map keys in text with their canonical values.
 * Processes longest keys first to avoid partial matches.
 */
function applyPhraseMap(text: string, map: Record<string, string>): string {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    // Use word-boundary-safe replacement
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'g');
    text = text.replace(regex, (match) => {
      // Preserve leading/trailing whitespace from the match
      const leading = match.startsWith(' ') ? ' ' : '';
      const trailing = match.endsWith(' ') ? ' ' : '';
      return `${leading}${map[key]}${trailing}`;
    });
  }
  return text;
}
