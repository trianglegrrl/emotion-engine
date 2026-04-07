/**
 * Anthropic-only emotion classifier.
 *
 * Uses the Anthropic Messages API with role-specific prompts
 * (agent vs user) for emotion classification.
 *
 * Falls back to neutral on any failure (no hard crashes in classification).
 */

import fs from "node:fs";
import path from "node:path";
import type { ClassificationResult } from "../types.js";
import { CLASSIFY_SYSTEM, buildAgentPrompt, buildUserPrompt } from "./prompts.js";

/** Options for the classifyEmotion function. */
export interface ClassifyOptions {
  /** Anthropic API key. */
  apiKey?: string;
  /** Model name for LLM classification. */
  model?: string;
  /** Whether classifying an agent or user message. */
  role: "agent" | "user";
  /** Available emotion labels. */
  emotionLabels: string[];
  /** Minimum confidence to accept a classification. */
  confidenceMin: number;
  /** Timeout in ms. */
  timeoutMs?: number;
  /** Injectable fetch function (for testing). */
  fetchFn?: typeof fetch;
  /** Path to classification log file (JSONL). */
  classificationLogPath?: string;
}

const NEUTRAL_RESULT: ClassificationResult = {
  label: "neutral",
  intensity: 0,
  reason: "classification unavailable",
  confidence: 0,
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Log a classification attempt to JSONL file.
 */
function logClassification(
  logPath: string | undefined,
  data: {
    timestamp: string;
    role: string;
    text: string;
    model: string;
    provider: string;
    result?: ClassificationResult;
    success: boolean;
    error?: string;
    responseTimeMs?: number;
  }
): void {
  if (!logPath) return;

  try {
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const entry = {
      ...data,
      textExcerpt: data.text.slice(0, 200) + (data.text.length > 200 ? "..." : ""),
    };
    delete (entry as any).text; // Don't log full text for privacy

    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("[openfeelz] Failed to write classification log:", err);
  }
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
 * Classify the emotion in a text message via the Anthropic Messages API.
 *
 * Uses role-specific prompts (agent vs user) for better accuracy.
 * Falls back to neutral on any failure.
 */
export async function classifyEmotion(
  text: string,
  options: ClassifyOptions,
): Promise<ClassificationResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10000;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const model = options.model ?? "claude-sonnet-4-5-20250514";

  try {
    if (!options.apiKey) {
      const error = "Emotion classifier requires an apiKey. " +
        "Configure apiKey or set ANTHROPIC_API_KEY in environment or auth-profiles.json.";

      console.error(`[openfeelz] ${error}`);

      logClassification(options.classificationLogPath, {
        timestamp,
        role: options.role,
        text,
        model,
        provider: "anthropic",
        success: false,
        error,
      });

      throw new Error(error);
    }

    console.log(`[openfeelz] Classifying ${options.role} emotion with anthropic/${model}`);

    const userPrompt = options.role === "agent"
      ? buildAgentPrompt(text, options.emotionLabels)
      : buildUserPrompt(text, options.emotionLabels);

    const result = await classifyViaAnthropic(
      userPrompt, options.apiKey, model, fetchFn, timeoutMs,
      options.emotionLabels, options.confidenceMin,
    );

    logClassification(options.classificationLogPath, {
      timestamp,
      role: options.role,
      text,
      model,
      provider: "anthropic",
      result,
      success: true,
      responseTimeMs: Date.now() - startTime,
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // If it's a configuration error (no apiKey), rethrow
    if (err instanceof Error && err.message.includes("requires an apiKey")) {
      throw err;
    }

    console.error("[openfeelz] Classification failed:", err);

    logClassification(options.classificationLogPath, {
      timestamp,
      role: options.role,
      text,
      model,
      provider: "anthropic",
      success: false,
      error: errorMessage,
      responseTimeMs: Date.now() - startTime,
    });

    return { ...NEUTRAL_RESULT };
  }
}

// ---------------------------------------------------------------------------
// Backend: Anthropic Messages API
// ---------------------------------------------------------------------------

async function classifyViaAnthropic(
  userPrompt: string,
  apiKey: string,
  model: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
  labels: string[],
  confidenceMin: number,
): Promise<ClassificationResult> {
  const response = await fetchFn(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      system: CLASSIFY_SYSTEM,
      messages: [
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[openfeelz] Anthropic classification API error:", response.status, body.slice(0, 800));
    throw new Error(`Anthropic returned ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    console.error("[openfeelz] Anthropic classification returned no text block; content length:", data.content?.length ?? 0);
    throw new Error("Empty Anthropic response");
  }

  const parsed = parseClassifierResponse(textBlock.text);
  return coerceClassificationResult(parsed, labels, confidenceMin);
}
