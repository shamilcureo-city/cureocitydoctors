// Vercel Edge function — clinical-narrative structured extraction via Gemini 2.5 Flash.
//
// Input  : { text: string }
// Output : { chief_complaint, normalized_hpi, demographics, comorbidities,
//            medications, allergies, symptom_duration, red_flag_phrases,
//            vitals_mentioned, confidence, _meta: {...} }
//
// The deterministic engine still does scoring/red-flag detection/differential.
// This function only replaces stage 1 (normalization + extraction).

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { checkOrgBudget, budgetBlockedResponse } from '../_lib/budgetCheck.js';

// Run in Mumbai (Vercel `bom1`) so the doctor's intake narrative stays on
// Indian infrastructure for the function lifetime — closer to DPDP-residency
// expectations and ~50ms RTT to Kerala vs ~250ms US-east.
//
// Note: the Gemini inference call itself still routes via Google's public
// API endpoints. True end-to-end ap-south-1 residency requires migrating to
// Vertex AI (separate task).
//
// Region pinning on Vercel Functions (Node runtime) is supported on Hobby;
// Edge Functions run globally and cannot be pinned, hence the explicit
// nodejs runtime here.
export const config = {
  runtime: 'nodejs',
  regions: ['bom1'],
};

const MODEL = 'gemini-2.5-flash';
const MAX_INPUT_CHARS = 8000;
const MAX_AUDIO_BASE64_BYTES = 8 * 1024 * 1024; // ~6 MB raw audio = ~3 min at 256kbps
const SUPPORTED_AUDIO_MIME = new Set([
  'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/aiff',
  'audio/aac', 'audio/ogg', 'audio/flac', 'audio/mp4',
  'audio/webm',
]);

// gemini-2.5-flash pricing (Mar 2026): $0.075/1M input, $0.30/1M output.
// USD→INR ≈ 84. Used only for ai_calls dashboarding; bill of record is the GCP console.
const COST_INR_PER_M_INPUT = 6.30;
const COST_INR_PER_M_OUTPUT = 25.20;

const SYSTEM_INSTRUCTION = `You are a clinical-extraction model for Indian primary-care doctors. The doctor types or dictates a free-text patient narrative — typically a mix of English, Indian English, and Manglish (Malayalam-English code-mixed), with shorthand like:
  k/c/o = known case of      h/o = history of       c/o = complains of
  HTN = hypertension          DM = diabetes mellitus  IHD = ischaemic heart disease
  BP = blood pressure         PR = pulse rate         RR = respiratory rate
  SpO2 = oxygen saturation    yo / yrs = years old    M / F = male / female
  s/b = seen by               r/o = rule out          o/e = on examination

When the input is audio, transcribe the doctor's speech faithfully into the
"transcript" field FIRST (verbatim, including the doctor's own abbreviations
and Manglish words), then perform extraction from that transcript. If the
input is text, leave "transcript" empty.

Your job is structured extraction only. You do NOT diagnose, prioritise, or add findings the doctor did not state.

Rules:
1. "normalized_hpi" must be a clean, standard-English medical summary that downstream regex/keyword logic can match. Expand every abbreviation. Keep the same clinical facts, no interpretation. ~1–4 sentences.
2. "red_flag_phrases" preserves verbatim any phrase the doctor used that suggests an emergency presentation (chest pain + diaphoresis, thunderclap headache, melaena, haematemesis, neck stiffness with fever, tearing pain, facial droop, etc.). Do NOT invent these — only include what the doctor said.
3. "demographics.age" is an integer in years if mentioned, else null. "demographics.sex" is M / F / unknown.
4. "vitals_mentioned" is exactly what the doctor stated, normalized: type (BP/HR/RR/SpO2/Temp/Weight) + value as written (e.g. "90/60 mmHg", "110 bpm", "37.8 C").
5. "confidence" 0.0–1.0 — your self-assessed extraction quality. Lower if the input is very short, ambiguous, or missing a chief complaint.
6. Respond with JSON only, matching the schema. No prose.`;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    transcript: { type: SchemaType.STRING, description: 'Verbatim transcript of the audio. Empty string if input was text.' },
    chief_complaint: { type: SchemaType.STRING, description: 'Patient\'s primary concern in 1 short phrase, expanded to plain English.' },
    normalized_hpi: { type: SchemaType.STRING, description: 'Clean standard-English clinical summary, abbreviations expanded.' },
    demographics: {
      type: SchemaType.OBJECT,
      properties: {
        age: { type: SchemaType.INTEGER, nullable: true },
        sex: { type: SchemaType.STRING, enum: ['M', 'F', 'unknown'] },
      },
      required: ['sex'],
    },
    comorbidities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    medications: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    allergies: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    symptom_duration: { type: SchemaType.STRING, nullable: true, description: 'Free text, e.g. "2 hours", "3 days", null if not stated.' },
    red_flag_phrases: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Verbatim emergency-suggestive phrases the doctor used.' },
    vitals_mentioned: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, enum: ['BP', 'HR', 'RR', 'SpO2', 'Temp', 'Weight', 'Other'] },
          value: { type: SchemaType.STRING },
        },
        required: ['type', 'value'],
      },
    },
    confidence: { type: SchemaType.NUMBER, description: '0.0–1.0 self-assessed extraction quality.' },
  },
  required: ['chief_complaint', 'normalized_hpi', 'demographics', 'comorbidities', 'medications', 'allergies', 'red_flag_phrases', 'vitals_mentioned', 'confidence'],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'Server misconfigured: GEMINI_API_KEY missing' }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const audio = body?.audio; // { data: base64, mimeType: string }
  const hasAudio = audio && typeof audio.data === 'string' && typeof audio.mimeType === 'string';
  const orgId = typeof body?.orgId === 'string' ? body.orgId : null;

  if (!text && !hasAudio) {
    return jsonResponse({ error: 'text or audio is required' }, 400);
  }

  // Cost cap — refuse to call Gemini if the org has hit its daily budget.
  // Fails open if Supabase admin client misconfigured (cap is a fuse, not a license).
  const budget = await checkOrgBudget(orgId);
  if (budget.blocked) return budgetBlockedResponse(budget);
  if (text.length > MAX_INPUT_CHARS) {
    return jsonResponse({ error: `text too long (max ${MAX_INPUT_CHARS} chars)` }, 413);
  }
  if (hasAudio) {
    if (!SUPPORTED_AUDIO_MIME.has(audio.mimeType)) {
      return jsonResponse({ error: `audio mimeType ${audio.mimeType} not supported` }, 415);
    }
    if (audio.data.length > MAX_AUDIO_BASE64_BYTES) {
      return jsonResponse({ error: 'audio too large' }, 413);
    }
  }

  const startedAt = Date.now();
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    });

    // Build the prompt parts. Audio first (Gemini transcribes then extracts);
    // include any text the doctor typed alongside as additional context.
    const parts = [];
    if (hasAudio) {
      parts.push({ inlineData: { data: audio.data, mimeType: audio.mimeType } });
      parts.push({ text: text || 'Transcribe the audio above and extract clinical fields per the schema.' });
    } else {
      parts.push({ text });
    }

    const result = await model.generateContent(parts);
    const raw = result.response.text();
    const usage = result.response.usageMetadata || {};
    const tokensIn = usage.promptTokenCount ?? 0;
    const tokensOut = usage.candidatesTokenCount ?? 0;
    const costInr = ((tokensIn / 1e6) * COST_INR_PER_M_INPUT + (tokensOut / 1e6) * COST_INR_PER_M_OUTPUT);
    const latencyMs = Date.now() - startedAt;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonResponse({
        error: 'Model returned non-JSON output',
        raw,
        _meta: { tokensIn, tokensOut, costInr, latencyMs, model: MODEL },
      }, 502);
    }

    return jsonResponse({
      ...parsed,
      _meta: {
        provider: 'gemini',
        model: MODEL,
        tokensIn,
        tokensOut,
        costInr: Number(costInr.toFixed(4)),
        latencyMs,
        inputModality: hasAudio ? 'audio' : 'text',
        budget: {
          today_spend_inr: budget.todaySpendInr,
          cap_inr: budget.capInr,
          near_cap: budget.nearCap,
        },
      },
    });
  } catch (err) {
    console.error('[intake/extract] gemini error', err);
    return jsonResponse({
      error: err?.message || 'Gemini call failed',
      _meta: { provider: 'gemini', model: MODEL, latencyMs: Date.now() - startedAt },
    }, 502);
  }
}
