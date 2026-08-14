import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set (check .env.local)");
}

const ai = new GoogleGenAI({ apiKey });

const MODEL = "gemini-2.5-flash";

/**
 * One Gemini call that must return JSON, with one automatic retry on a
 * failed call or unparseable response — per HLD section 9 error handling.
 */
export async function generateJson<T>(
  systemInstruction: string,
  userContent: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: userContent,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini call failed after retry");
}

/** Plain-text Gemini call (no JSON parsing) for the chat endpoint. */
export async function generateText(
  systemInstruction: string,
  userContent: string
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: userContent,
        config: { systemInstruction },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      return text;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini call failed after retry");
}
