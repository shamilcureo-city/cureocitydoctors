import { getGemini, getGeminiModel } from "./client";
import {
  buildScribeSystemPrompt,
  buildScribeUserPrompt,
  SCRIBE_RESPONSE_SCHEMA,
  type ScribeContext,
} from "./prompts";
import type { Prescription, SoapNote } from "@/lib/db/types";

export type ScribeResult = {
  detectedLanguage: string;
  transcript: string;
  soap: SoapNote;
  prescription: Prescription;
  warnings: string[];
};

export type ScribeInput = {
  audio: { data: Buffer; mimeType: string };
  context: ScribeContext;
};

export async function runScribe({ audio, context }: ScribeInput): Promise<ScribeResult> {
  const ai = getGemini();
  const model = getGeminiModel();

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: buildScribeUserPrompt(context) },
          {
            inlineData: {
              mimeType: audio.mimeType,
              data: audio.data.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: buildScribeSystemPrompt(context),
      responseMimeType: "application/json",
      // The SDK accepts a plain JSON schema object for structured output.
      responseSchema: SCRIBE_RESPONSE_SCHEMA as unknown as object,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  let parsed: ScribeResult;
  try {
    const raw = JSON.parse(text) as {
      detected_language: string;
      transcript: string;
      soap: SoapNote;
      prescription: Prescription;
      warnings: string[];
    };
    parsed = {
      detectedLanguage: raw.detected_language,
      transcript: raw.transcript,
      soap: raw.soap,
      prescription: raw.prescription,
      warnings: raw.warnings ?? [],
    };
  } catch (err) {
    throw new Error(`Failed to parse Gemini JSON: ${(err as Error).message}`);
  }

  return parsed;
}
