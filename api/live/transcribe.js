// Vercel Node.js function — Gemini-powered live ambient consult extraction.
//
// Input  : { audio_chunk_b64, mime_type, prior_transcript_tail, sequence,
//            consultation_id?, orgId? }
// Output : {
//   transcript_delta,    // verbatim transcription of THIS chunk
//   hpi_delta,           // clean medical-English summary of NEW clinical content
//   new_vitals: [{ key, value }],
//   new_labs: [{ key, value }],
//   new_drugs: [{ name, dose? }],
//   new_allergies: [{ allergen, reaction?, severity? }],
//   red_flag_phrases,
//   confidence,
//   _meta: { tokensIn, tokensOut, costInr, latencyMs, model, budget }
// }
//
// The doctor's browser captures 8-second audio chunks and posts each one
// here with the accumulated transcript-tail for context. This endpoint
// transcribes + extracts deltas only — never the full case (the engine
// holds that). The client merges the deltas into engine state via the
// usual setters; the engine recomputes the differential as the corpus
// grows.
//
// Pinned to bom1 (Mumbai) for India residency. Gemini call routes via
// Google's public API; full ap-south-1 residency requires Vertex AI.

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { checkOrgBudget, budgetBlockedResponse } from '../_lib/budgetCheck.js';

export const config = {
  runtime: 'nodejs',
  regions: ['bom1'],
};

const MODEL = 'gemini-2.5-flash';
const MAX_CHUNK_BASE64_BYTES = 1024 * 1024;       // ~750 KB raw audio per chunk; chunks are ~8s
const MAX_PRIOR_TAIL_CHARS = 4000;
const SUPPORTED_AUDIO_MIME = new Set([
  'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/aiff',
  'audio/aac', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/webm',
]);

// gemini-2.5-flash pricing (Mar 2026): $0.10/M audio, $0.30/M text in/out.
// USD→INR ≈ 84.
const COST_INR_PER_M_AUDIO_INPUT = 8.40;
const COST_INR_PER_M_TEXT_INPUT  = 25.20;
const COST_INR_PER_M_TEXT_OUTPUT = 25.20;

const SYSTEM_INSTRUCTION = `You are an ambient clinical-co-pilot model running live during an Indian primary-care consultation. The doctor's browser captures 8-second audio chunks of the doctor + patient speaking and sends each chunk to you with the last ~30 seconds of confirmed transcript as context. Both speakers may use any combination of English, Indian English, Manglish, Hinglish, Malayalam, or Hindi.

Your job for each chunk:

1. SPEAKER DIARIZATION — output a 'speakers' array of conversation turns:
   [{speaker, text}, ...]
   - speaker: 'doctor' | 'patient' | 'unknown'
   - text: verbatim turn (preserve original language + code-mixing)
   The DOCTOR typically asks questions, narrates findings ("BP 140 over 90", "tachycardia present"), uses clinical abbreviations, speaks in confident clinical English/Manglish.
   The PATIENT typically describes symptoms, answers questions, may use lay language or vernacular ("nenju vedhana" / "seene mein dard"), often hesitates or repeats.
   When uncertain, use 'unknown'. Empty array if no speech.

2. transcript_delta — full verbatim transcription of this chunk, all speakers concatenated. Preserve abbreviations and code-mixing. Use this if a single string is more useful than the speaker turns.

3. hpi_delta — clean medical-English summary of NEW clinical content in this chunk (1-2 sentences). Translate vernacular to medical terms ("nenju vedhana" → "chest pain"). Expand abbreviations (k/c/o, h/o, c/o, BP, HR, RR, SpO2, etc.). Empty string if only banter/greeting.

4. STRUCTURED ENTITIES (first mention in this chunk only — don't repeat from prior_transcript_tail):
   - new_vitals: { key, value }. Keys: 'hr','sbp','dbp','rr','spo2','temp','wt','bmi','gcs'. For BP, return BOTH sbp and dbp.
   - new_labs: { key, value }. Keys: 'hb','wbc','plt','na','k','urea','cr','glu','hba1c','trop','bnp','crp','tsh','alt','ast','tbil','inr','pct','lact'.
   - new_drugs: { name, dose? }. Generic names preferred.
   - new_allergies: { allergen, reaction?, severity? }.

5. red_flag_phrases — verbatim phrases (any speaker) suggesting emergency: 'chest pain radiating to jaw', 'thunderclap headache', 'haematemesis', 'tearing pain', 'silent chest', 'altered consciousness'. Do NOT invent.

6. NEXT QUESTION — the single most useful question the doctor should ASK NEXT to disambiguate the working diagnosis. Output as next_question: { text, reason } or null.
   - text: ≤ 12 words, plain English, phrased as the doctor would say it ("Any pain radiating to the jaw or arm?")
   - reason: ≤ 18 words explaining the differentiator ("Differentiates ACS from PE — radiation strongly suggests cardiac.")
   - Pick from these priorities (highest first):
     a) Critical red-flag screening for the leading hypothesis (radiation, syncope, melaena, neck stiffness, etc.)
     b) Onset / character / duration if not yet captured
     c) Drug history / allergy if not yet captured and relevant
     d) Specific differentiator between top 2 hypotheses
   - Return null if the conversation is well-covered or you'd be repeating earlier questions in prior_transcript_tail.

7. confidence: 0.0-1.0 — your self-assessed quality for this chunk.

Strict rules:
- Respond with JSON only matching the schema. No prose, no markdown.
- Empty arrays as [], empty strings as '', null as null. Never undefined.
- Do NOT diagnose definitively, do NOT prescribe, do NOT invent findings.
- Do NOT translate the transcript_delta itself — keep it verbatim. Translation lives in hpi_delta.
- Do NOT repeat content already in prior_transcript_tail.`;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    transcript_delta: { type: SchemaType.STRING, description: 'Verbatim transcription of this chunk only.' },
    hpi_delta: { type: SchemaType.STRING, description: 'Clean medical-English summary of NEW clinical content. Empty if none.' },
    new_vitals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          key: { type: SchemaType.STRING, enum: ['hr','sbp','dbp','rr','spo2','temp','wt','bmi','gcs'] },
          value: { type: SchemaType.STRING },
        },
        required: ['key', 'value'],
      },
    },
    new_labs: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          key: { type: SchemaType.STRING, enum: ['hb','wbc','plt','na','k','urea','cr','glu','hba1c','trop','bnp','crp','tsh','alt','ast','tbil','inr','pct','lact'] },
          value: { type: SchemaType.STRING },
        },
        required: ['key', 'value'],
      },
    },
    new_drugs: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          dose: { type: SchemaType.STRING, nullable: true },
        },
        required: ['name'],
      },
    },
    new_allergies: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          allergen: { type: SchemaType.STRING },
          reaction: { type: SchemaType.STRING, nullable: true },
          severity: { type: SchemaType.STRING, nullable: true },
        },
        required: ['allergen'],
      },
    },
    red_flag_phrases: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    speakers: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          speaker: { type: SchemaType.STRING, enum: ['doctor', 'patient', 'unknown'] },
          text: { type: SchemaType.STRING },
        },
        required: ['speaker', 'text'],
      },
    },
    next_question: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        text:   { type: SchemaType.STRING },
        reason: { type: SchemaType.STRING },
      },
      required: ['text', 'reason'],
    },
    confidence: { type: SchemaType.NUMBER },
  },
  required: ['transcript_delta', 'hpi_delta', 'new_vitals', 'new_labs', 'new_drugs', 'new_allergies', 'red_flag_phrases', 'speakers', 'confidence'],
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
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const audioB64 = typeof body?.audio_chunk_b64 === 'string' ? body.audio_chunk_b64 : null;
  const mimeType = typeof body?.mime_type === 'string' ? body.mime_type : null;
  const priorTranscriptTail = typeof body?.prior_transcript_tail === 'string'
    ? body.prior_transcript_tail.slice(-MAX_PRIOR_TAIL_CHARS)
    : '';
  const sequence = Number.isInteger(body?.sequence) ? body.sequence : 0;
  const orgId = typeof body?.orgId === 'string' ? body.orgId : null;

  if (!audioB64) return jsonResponse({ error: 'audio_chunk_b64 is required' }, 400);
  if (!mimeType || !SUPPORTED_AUDIO_MIME.has(mimeType)) {
    return jsonResponse({ error: `mime_type ${mimeType} not supported` }, 415);
  }
  if (audioB64.length > MAX_CHUNK_BASE64_BYTES) {
    return jsonResponse({ error: 'audio chunk too large (>1MB base64)' }, 413);
  }

  // Cost cap — fails open if Supabase admin client misconfigured
  const budget = await checkOrgBudget(orgId);
  if (budget.blocked) return budgetBlockedResponse(budget);

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

    const userMessage = priorTranscriptTail
      ? `Prior transcript (last ~30s, for context only — do not re-extract):\n${priorTranscriptTail}\n\nThis is chunk ${sequence}. Transcribe and extract per the schema.`
      : `This is chunk ${sequence} (start of consult). Transcribe and extract per the schema.`;

    const parts = [
      { inlineData: { data: audioB64, mimeType } },
      { text: userMessage },
    ];

    const result = await model.generateContent(parts);
    const raw = result.response.text();
    const usage = result.response.usageMetadata || {};
    // Gemini reports total prompt tokens; for audio input it's bundled into promptTokenCount.
    // We approximate audio vs text split: ~80% of input tokens at this scale are audio.
    const tokensIn = usage.promptTokenCount ?? 0;
    const audioTokens = Math.floor(tokensIn * 0.8);
    const textInTokens = tokensIn - audioTokens;
    const tokensOut = usage.candidatesTokenCount ?? 0;
    const costInr =
      (audioTokens / 1e6) * COST_INR_PER_M_AUDIO_INPUT +
      (textInTokens / 1e6) * COST_INR_PER_M_TEXT_INPUT +
      (tokensOut / 1e6) * COST_INR_PER_M_TEXT_OUTPUT;
    const latencyMs = Date.now() - startedAt;

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
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
        sequence,
        tokensIn,
        tokensOut,
        costInr: Number(costInr.toFixed(4)),
        latencyMs,
        budget: {
          today_spend_inr: budget.todaySpendInr,
          cap_inr: budget.capInr,
          near_cap: budget.nearCap,
        },
      },
    });
  } catch (err) {
    console.error('[live/transcribe] gemini error', err);
    return jsonResponse({
      error: err?.message || 'Gemini call failed',
      _meta: { provider: 'gemini', model: MODEL, latencyMs: Date.now() - startedAt },
    }, 502);
  }
}
