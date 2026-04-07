/**
 * Emotion classifier using claude -p (Claude Code's non-interactive CLI mode).
 *
 * No API key needed — piggybacks on Claude Code's own auth.
 * Falls back to neutral on any failure (no hard crashes in classification).
 */

import type { ClassificationResult, ClassificationUsage } from "../types.js"
import { callClaude } from "../utils/claude-cli.js"
import { buildAgentPrompt, buildUserPrompt } from "./prompts.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassifyOptions {
  role: "agent" | "user"
  emotionLabels: string[]
  confidenceMin: number
  model?: string
  timeoutMs?: number
}

export interface ClassifyResult extends ClassificationResult {
  usage?: ClassificationUsage
}

const NEUTRAL_RESULT: ClassifyResult = {
  label: "neutral",
  intensity: 0,
  reason: "classification unavailable",
  confidence: 0,
}

// ---------------------------------------------------------------------------
// Main Classification
// ---------------------------------------------------------------------------

/**
 * Classify emotion via claude -p (Claude Code's non-interactive mode).
 * No API key needed — uses Claude Code's own auth.
 */
export async function classifyEmotion(
  text: string,
  options: ClassifyOptions,
): Promise<ClassifyResult> {
  const model = options.model ?? "haiku"
  const timeoutMs = options.timeoutMs ?? 30_000

  const prompt =
    options.role === "agent"
      ? buildAgentPrompt(text, options.emotionLabels)
      : buildUserPrompt(text, options.emotionLabels)

  try {
    const { result, usage } = await callClaude(prompt, { model, timeoutMs })

    // Parse the classification from the result field
    const parsed = parseClassificationResult(result)
    const coerced = coerceResult(parsed, options.emotionLabels, options.confidenceMin)

    return { ...coerced, usage }
  } catch (err) {
    console.error(
      "[openfeelz] Classification via claude -p failed:",
      err instanceof Error ? err.message : err,
    )
    return { ...NEUTRAL_RESULT }
  }
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse LLM response text into a classification result.
 * Handles JSON wrapped in markdown code blocks.
 */
export function parseClassificationResult(raw: string): ClassificationResult {
  let cleaned = raw.trim()
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  }

  const parsed = JSON.parse(cleaned)

  if (
    typeof parsed.label !== "string" ||
    typeof parsed.intensity !== "number" ||
    typeof parsed.reason !== "string" ||
    typeof parsed.confidence !== "number"
  ) {
    throw new Error(
      `Invalid classification response: missing required fields. Got: ${JSON.stringify(parsed)}`,
    )
  }

  return {
    label: parsed.label,
    intensity: parsed.intensity,
    reason: parsed.reason,
    confidence: parsed.confidence,
  }
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

/**
 * Normalize and validate a classification result.
 * Falls back to neutral if label is unknown or confidence is too low.
 */
export function coerceResult(
  result: ClassificationResult,
  labels: string[],
  confidenceMin: number,
): ClassificationResult {
  const normalizedLabel = result.label.trim().toLowerCase()
  const isKnown = labels.includes(normalizedLabel)

  if (!isKnown || result.confidence < confidenceMin) {
    return { ...NEUTRAL_RESULT }
  }

  return {
    label: normalizedLabel,
    intensity: Math.max(0, Math.min(1, result.intensity)),
    reason: result.reason.trim() || "unsure",
    confidence: Math.max(0, Math.min(1, result.confidence)),
  }
}
