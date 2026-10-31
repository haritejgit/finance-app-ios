import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { AIRequestValidationError, requireUserId, sanitizeAIContext, takeAIRequestSlot, validateBoundedText, validateChatMessages } from "./ai-proxy-validation";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_PROMPT_LENGTH = 12_000;

function requireSignedIn(request: { auth?: { uid: string } | null }): string {
  try {
    return requireUserId(request.auth?.uid);
  } catch {
    throw new HttpsError("unauthenticated", "Sign in to use the finance assistant.");
  }
}

function assertConfigured(secret: { value(): string }): string {
  const key = secret.value();
  if (!key) throw new HttpsError("failed-precondition", "AI is not configured yet. Ask the account owner to configure the server API key.");
  return key;
}

async function enforceUserRateLimit(uid: string): Promise<void> {
  const reference = getFirestore().collection("_aiUsage").doc(uid);
  const limited = await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const next = takeAIRequestSlot(snapshot.exists ? snapshot.data() : undefined, Date.now());
    if (next) transaction.set(reference, next);
    return next === null;
  });
  if (limited) throw new HttpsError("resource-exhausted", "AI request limit reached. Try again shortly.");
}

async function responseText(response: Response): Promise<any> {
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new HttpsError("unavailable", "The AI provider returned an unreadable response.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new HttpsError("resource-exhausted", "AI request limit reached. Try again shortly.");
    throw new HttpsError("unavailable", "The AI provider is temporarily unavailable.");
  }
  return body;
}

export const generateGemini = onCall({ region: "us-central1", secrets: [GEMINI_API_KEY], timeoutSeconds: 30 }, async (request) => {
  const uid = requireSignedIn(request);
  let prompt: string;
  try {
    prompt = validateBoundedText(request.data?.prompt, MAX_PROMPT_LENGTH);
  } catch (error) {
    if (error instanceof AIRequestValidationError) throw new HttpsError("invalid-argument", "The AI request is empty or exceeds the allowed length.");
    throw error;
  }
  const apiKey = assertConfigured(GEMINI_API_KEY);
  await enforceUserRateLimit(uid);
  let response: Response;
  try {
    response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: request.data?.temperature === 0.5 ? 0.5 : 0.7,
          maxOutputTokens: request.data?.maxOutputTokens === 512 ? 512 : 2048,
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new HttpsError("unavailable", "Could not reach the AI provider. Check your connection and try again.");
  }
  const body = await responseText(response);
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  return { text: typeof text === "string" ? text : "Unable to get an AI response." };
});

export const generateAnthropic = onCall({ region: "us-central1", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30 }, async (request) => {
  const uid = requireSignedIn(request);
  const apiKey = assertConfigured(ANTHROPIC_API_KEY);
  let messages: { role: "user" | "assistant"; content: string }[];
  let context = "";
  try {
    messages = validateChatMessages(request.data?.messages);
    if (request.data?.context != null) context = validateBoundedText(JSON.stringify(sanitizeAIContext(request.data.context)), MAX_PROMPT_LENGTH);
  } catch (error) {
    if (error instanceof AIRequestValidationError) throw new HttpsError("invalid-argument", "The conversation is invalid or exceeds the allowed length.");
    throw error;
  }
  await enforceUserRateLimit(uid);
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: `You are a smart finance assistant for a loan management business. Help track collections, answer questions about customers, dues, and loan status, and give actionable insights. Be concise, friendly, and professional.${context ? `\n\nCurrent dashboard context: ${context}` : ""}`,
        messages,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new HttpsError("unavailable", "Could not reach the AI provider. Check your connection and try again.");
  }
  const body = await responseText(response);
  const text = body?.content?.[0]?.text;
  return { text: typeof text === "string" ? text : "Unable to get an AI response." };
});
