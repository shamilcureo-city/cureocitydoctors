// ──────────────────────────────────────────────────────────────────────────────
// Gemini AI Service – Clinical Entity Extraction & SOAP Note Generation
// ──────────────────────────────────────────────────────────────────────────────

import { config } from '../config/index.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

// ── Clinical Entity Extraction ──────────────────────────────────────────────

export interface ExtractedEntities {
  symptoms: Array<{
    term: string;
    duration?: string;
    severity?: 'mild' | 'moderate' | 'severe';
    onset?: 'sudden' | 'gradual';
    associatedSymptoms?: string[];
  }>;
  signs: string[];
  drugs: Array<{
    name: string;
    dose?: string;
    frequency?: string;
    route?: string;
    duration?: string;
  }>;
  allergies: string[];
  history: string[];
  negatedTerms: string[];
  vitals: Record<string, number>;
}

const ENTITY_EXTRACTION_PROMPT = `You are a clinical NLP engine for an Indian medical practice. Extract structured clinical entities from the doctor-patient conversation transcript below.

Return ONLY valid JSON with this exact schema (no markdown, no explanation):
{
  "symptoms": [{"term": "string", "duration": "string|null", "severity": "mild|moderate|severe|null", "onset": "sudden|gradual|null", "associatedSymptoms": ["string"]}],
  "signs": ["string"],
  "drugs": [{"name": "string", "dose": "string|null", "frequency": "string|null", "route": "string|null", "duration": "string|null"}],
  "allergies": ["string"],
  "history": ["string"],
  "negatedTerms": ["string"],
  "vitals": {}
}

Rules:
- Detect Manglish (Malayalam in English script) medical terms
- Normalize shorthand: "HTN" -> "hypertension", "DM" -> "diabetes mellitus"
- Capture negations: "no cough", "denies fever" -> negatedTerms: ["cough", "fever"]
- Extract vitals as numbers: {"temperature": 101.5, "bpSystolic": 140}
- For drugs, use generic names where possible
- Include past medical history and family history in "history"`;

export async function extractClinicalEntities(
  transcript: string,
): Promise<ExtractedEntities> {
  if (!config.geminiApiKey) {
    return {
      symptoms: [],
      signs: [],
      drugs: [],
      allergies: [],
      history: [],
      negatedTerms: [],
      vitals: {},
    };
  }

  const response = await callGemini(
    `${ENTITY_EXTRACTION_PROMPT}\n\nTranscript:\n${transcript}`,
    'gemini-2.0-flash',
  );

  try {
    const parsed = JSON.parse(response);
    return {
      symptoms: parsed.symptoms || [],
      signs: parsed.signs || [],
      drugs: parsed.drugs || [],
      allergies: parsed.allergies || [],
      history: parsed.history || [],
      negatedTerms: parsed.negatedTerms || [],
      vitals: parsed.vitals || {},
    };
  } catch {
    console.error('[gemini] Failed to parse entity extraction response');
    return {
      symptoms: [],
      signs: [],
      drugs: [],
      allergies: [],
      history: [],
      negatedTerms: [],
      vitals: {},
    };
  }
}

// ── SOAP Note Generation ────────────────────────────────────────────────────

export interface SOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

const SOAP_NOTE_PROMPT = `You are a clinical documentation assistant for Indian medical practice. Generate a SOAP note from the consultation data below.

Return ONLY valid JSON with this exact schema (no markdown, no explanation):
{
  "subjective": "string - Chief complaint, HPI, review of systems, past medical/surgical/family/social history",
  "objective": "string - Vitals, physical exam findings, lab results",
  "assessment": "string - Diagnoses with ICD-10 codes, differential diagnoses",
  "plan": "string - Medications, investigations ordered, follow-up instructions, patient education"
}

Rules:
- Use standard medical abbreviations (c/o, H/o, O/E, etc.)
- Include ICD-10 codes for diagnoses
- List medications in Indian prescription format (Tab./Cap./Syr. Drug Dose Freq x Duration)
- Be concise but thorough
- Use Kerala-relevant clinical guidelines where applicable`;

export async function generateSOAPNote(consultationData: {
  transcript?: string;
  entities?: ExtractedEntities;
  diagnoses?: Array<{ condition_name: string; icd10_code?: string; tier?: string }>;
  vitals?: Record<string, unknown>;
  prescriptions?: Array<{ drugs: unknown[] }>;
  labOrders?: Array<{ test_name: string; urgency: string }>;
  patient?: { name: string; age?: number; gender?: string; allergies?: string[]; comorbidities?: string[] };
}): Promise<SOAPNote> {
  if (!config.geminiApiKey) {
    return { subjective: '', objective: '', assessment: '', plan: '' };
  }

  const context = JSON.stringify(consultationData, null, 2);
  const response = await callGemini(
    `${SOAP_NOTE_PROMPT}\n\nConsultation Data:\n${context}`,
    'gemini-2.0-flash',
  );

  try {
    const parsed = JSON.parse(response);
    return {
      subjective: parsed.subjective || '',
      objective: parsed.objective || '',
      assessment: parsed.assessment || '',
      plan: parsed.plan || '',
    };
  } catch {
    console.error('[gemini] Failed to parse SOAP note response');
    return { subjective: '', objective: '', assessment: '', plan: '' };
  }
}

// ── Streaming Entity Extraction (for ambient mode) ──────────────────────────

export async function extractEntitiesFromChunk(
  chunk: string,
  previousContext: string,
): Promise<{ entities: Partial<ExtractedEntities>; updatedContext: string }> {
  if (!config.geminiApiKey) {
    return { entities: {}, updatedContext: previousContext };
  }

  const prompt = `You are a real-time clinical NLP engine. Extract NEW clinical entities from this latest speech chunk, considering the prior context.

Previous context: ${previousContext || 'None'}
New chunk: ${chunk}

Return ONLY valid JSON:
{
  "symptoms": [{"term": "string", "duration": "string|null"}],
  "signs": ["string"],
  "drugs": [{"name": "string"}],
  "negatedTerms": ["string"],
  "contextSummary": "string - brief summary of conversation so far for next chunk"
}

Only include NEW entities not already in the previous context. Be conservative - only extract clear clinical terms.`;

  const response = await callGemini(prompt, 'gemini-2.0-flash');

  try {
    const parsed = JSON.parse(response);
    return {
      entities: {
        symptoms: parsed.symptoms || [],
        signs: parsed.signs || [],
        drugs: parsed.drugs || [],
        negatedTerms: parsed.negatedTerms || [],
      },
      updatedContext: parsed.contextSummary || previousContext,
    };
  } catch {
    return { entities: {}, updatedContext: previousContext };
  }
}

// ── Gemini API Call ─────────────────────────────────────────────────────────

async function callGemini(
  prompt: string,
  model: string,
): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${config.geminiApiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[gemini] API error (${res.status}): ${errText}`);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}
