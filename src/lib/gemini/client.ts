import { GoogleGenAI } from "@google/genai";

let cached: GoogleGenAI | null = null;

export function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!cached) {
    cached = new GoogleGenAI({ apiKey });
  }
  return cached;
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}
