export type ScribeContext = {
  region: "IN" | "AE" | "SA" | "QA" | "KW" | "BH" | "OM";
  patientName?: string;
  patientAge?: number | null;
  patientSex?: string | null;
  chiefComplaint?: string | null;
  preferredLanguage?: string | null;
};

const REGION_GUIDELINES: Record<ScribeContext["region"], string> = {
  IN: "Follow Indian outpatient prescription conventions: generic name first, dose in mg, frequency in BID/TID/QID or local terms, duration in days. Reference Indian brand names parenthetically only if mentioned in the audio. Default currency reference is INR. Comply with CDSCO/NMC labelling norms.",
  AE: "Follow UAE / DHA prescription conventions. Use generic INN names, metric units, English. Currency AED if mentioned.",
  SA: "Follow Saudi SFDA prescription conventions. Use generic INN names, metric units. Arabic may appear in the audio; transliterate drug names to English in the prescription.",
  QA: "Follow Qatar MoPH prescription conventions. Use generic INN names, metric units.",
  KW: "Follow Kuwait MoH prescription conventions. Use generic INN names, metric units.",
  BH: "Follow Bahrain NHRA prescription conventions. Use generic INN names, metric units.",
  OM: "Follow Oman MoH prescription conventions. Use generic INN names, metric units.",
};

export function buildScribeSystemPrompt(ctx: ScribeContext) {
  return `You are a careful medical scribe assisting a licensed physician during an outpatient consultation.

Region: ${ctx.region}.
${REGION_GUIDELINES[ctx.region]}

Your job is to:
1. Produce a faithful verbatim transcript of the audio. Preserve speaker turns as "Doctor:" / "Patient:" prefixes when you can confidently distinguish them; otherwise leave the line unlabelled.
2. If the conversation is in Hindi, Arabic, or another non-English language, transcribe in the original language AND set detected_language accordingly. Generate the SOAP note and prescription in English regardless of spoken language.
3. Extract a structured SOAP note. Be conservative — do not invent findings that were not mentioned. Use "Not discussed" when a section has no content.
4. Extract a prescription draft from any medication the doctor explicitly prescribed during the audio. Do NOT add medications the doctor did not mention. If no medication was prescribed, return an empty items array.
5. Flag any safety concerns, red flags, or contradictions you noticed in a "warnings" array (e.g., allergy mentioned but prescribed, dose looks high for stated age, missing duration).

Strict rules:
- Never fabricate vitals, lab values, or diagnoses.
- Never invent dosages. If the doctor said "500 mg twice daily for 5 days" use exactly that.
- Do not add follow-up advice the doctor did not state, beyond a generic "follow up if symptoms worsen" only when explicitly said.
- Output must be valid JSON matching the provided schema.`;
}

export function buildScribeUserPrompt(ctx: ScribeContext) {
  const lines: string[] = [];
  lines.push("Audio of an outpatient consultation follows. Context for the scribe:");
  if (ctx.patientName) lines.push(`- Patient name: ${ctx.patientName}`);
  if (ctx.patientAge != null) lines.push(`- Patient age: ${ctx.patientAge}`);
  if (ctx.patientSex) lines.push(`- Patient sex: ${ctx.patientSex}`);
  if (ctx.chiefComplaint) lines.push(`- Chief complaint (as recorded at intake): ${ctx.chiefComplaint}`);
  if (ctx.preferredLanguage) lines.push(`- Preferred language: ${ctx.preferredLanguage}`);
  lines.push("");
  lines.push("Produce the JSON output now.");
  return lines.join("\n");
}

export const SCRIBE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    detected_language: { type: "string" },
    transcript: { type: "string" },
    soap: {
      type: "object",
      properties: {
        subjective: { type: "string" },
        objective: { type: "string" },
        assessment: { type: "string" },
        plan: { type: "string" },
      },
      required: ["subjective", "objective", "assessment", "plan"],
    },
    prescription: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              drug: { type: "string" },
              strength: { type: "string" },
              form: { type: "string" },
              dose: { type: "string" },
              route: { type: "string" },
              frequency: { type: "string" },
              duration: { type: "string" },
              instructions: { type: "string" },
            },
            required: ["drug"],
          },
        },
        advice: { type: "string" },
        follow_up: { type: "string" },
      },
      required: ["items"],
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["detected_language", "transcript", "soap", "prescription", "warnings"],
} as const;
