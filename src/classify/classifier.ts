/**
 * Unified emotion classifier.
 *
 * Supports two backends:
 *  1. LLM (OpenAI-compatible) -- structured JSON output
 *  2. External HTTP endpoint -- POST with text + role
 *
 * Falls back to neutral on any failure (no hard crashes in classification).
 */

import type { ClassificationResult } from "../types.js";

/** Options for the classifyEmotion function. */
export interface ClassifyOptions {
  /** OpenAI API key (required if no classifierUrl). */
  apiKey?: string;
  /** OpenAI-compatible base URL. */
  baseUrl?: string;
  /** Model name for LLM classification. */
  model?: string;
  /** External classifier URL (if set, bypasses LLM). */
  classifierUrl?: string;
  /** Available emotion labels. */
  emotionLabels: string[];
  /** Minimum confidence to accept a classification. */
  confidenceMin: number;
  /** Timeout in ms. */
  timeoutMs?: number;
  /** Injectable fetch function (for testing). */
  fetchFn?: typeof fetch;
}

const NEUTRAL_RESULT: ClassificationResult = {
  label: "neutral",
  intensity: 0,
  reason: "classification unavailable",
  confidence: 0,
};

// ---------------------------------------------------------------------------
// Prompt Construction
// ---------------------------------------------------------------------------

/**
 * Build the system + user prompt for LLM classification.
 */
export function buildClassifierPrompt(
  text: string,
  role: string,
  labels: string[],
): string {
  return (
    `You are an emotion classifier. Classify the emotion in this ${role} message.\n\n` +
    `Available labels: ${labels.join(", ")}\n\n` +
    `Return ONLY valid JSON with exactly these keys:\n` +
    `- label: one of the available labels\n` +
    `- intensity: number 0-1 (how strong the emotion is)\n` +
    `- reason: short phrase explaining what triggered the emotion\n` +
    `- confidence: number 0-1 (how confident you are in this classification)\n\n` +
    `Message:\n${text}`
  );
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw LLM response string into a ClassificationResult.
 * Handles JSON wrapped in markdown code blocks.
 */
export function parseClassifierResponse(raw: string): ClassificationResult {
  // Strip markdown code block if present
  let cleaned = raw.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);

  if (
    typeof parsed.label !== "string" ||
    typeof parsed.intensity !== "number" ||
    typeof parsed.reason !== "string" ||
    typeof parsed.confidence !== "number"
  ) {
    throw new Error(
      `Invalid classifier response: missing required fields. Got: ${JSON.stringify(parsed)}`,
    );
  }

  return {
    label: parsed.label,
    intensity: parsed.intensity,
    reason: parsed.reason,
    confidence: parsed.confidence,
  };
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

/**
 * Normalize and validate a classification result.
 * Falls back to neutral if label is unknown or confidence is too low.
 */
export function coerceClassificationResult(
  result: ClassificationResult,
  labels: string[],
  confidenceMin: number,
): ClassificationResult {
  const normalizedLabel = result.label.trim().toLowerCase();
  const isKnown = labels.includes(normalizedLabel);

  if (!isKnown || result.confidence < confidenceMin) {
    return { ...NEUTRAL_RESULT };
  }

  return {
    label: normalizedLabel,
    intensity: Math.max(0, Math.min(1, result.intensity)),
    reason: result.reason.trim() || "unsure",
    confidence: Math.max(0, Math.min(1, result.confidence)),
  };
}

// ---------------------------------------------------------------------------
// Main Classification
// ---------------------------------------------------------------------------

/**
 * Classify the emotion in a text message.
 *
 * Routes to either an external HTTP endpoint or an LLM, depending on config.
 * Falls back to neutral on any failure.
 */
export async function classifyEmotion(
  text: string,
  role: string,
  options: ClassifyOptions,
): Promise<ClassificationResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  try {
    if (options.classifierUrl) {
      return await classifyViaEndpoint(text, role, options.classifierUrl, fetchFn, timeoutMs, options.emotionLabels, options.confidenceMin);
    }

    if (!options.apiKey) {
      throw new Error(
        "Emotion classifier requires either classifierUrl or apiKey. " +
        "Set OPENAI_API_KEY or configure classifierUrl in the emotion-engine plugin config.",
      );
    }

    return await classifyViaLLM(
      text,
      role,
      options.apiKey,
      options.baseUrl ?? "https://api.openai.com/v1",
      options.model ?? "gpt-4o-mini",
      fetchFn,
      timeoutMs,
      options.emotionLabels,
      options.confidenceMin,
    );
  } catch (err) {
    // If it's a configuration error (no apiKey), rethrow
    if (err instanceof Error && err.message.includes("requires either")) {
      throw err;
    }
    console.error("[emotion-engine] Classification failed:", err);
    return { ...NEUTRAL_RESULT };
  }
}

// ---------------------------------------------------------------------------
// Backend: External HTTP Endpoint
// ---------------------------------------------------------------------------

async function classifyViaEndpoint(
  text: string,
  role: string,
  url: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
  labels: string[],
  confidenceMin: number,
): Promise<ClassificationResult> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, role }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Classifier endpoint returned ${response.status}`);
  }

  const raw = (await response.json()) as ClassificationResult;
  return coerceClassificationResult(raw, labels, confidenceMin);
}

// ---------------------------------------------------------------------------
// Backend: OpenAI-compatible LLM
// ---------------------------------------------------------------------------

async function classifyViaLLM(
  text: string,
  role: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
  labels: string[],
  confidenceMin: number,
): Promise<ClassificationResult> {
  const prompt = buildClassifierPrompt(text, role, labels);

  const response = await fetchFn(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!response.ok) {
    throw new Error(`LLM returned ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty LLM response");
  }

  const parsed = parseClassifierResponse(content);
  return coerceClassificationResult(parsed, labels, confidenceMin);
}
