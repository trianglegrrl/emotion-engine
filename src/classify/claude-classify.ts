/**
 * Emotion classifier using claude -p (Claude Code's non-interactive CLI mode).
 *
 * No API key needed — piggybacks on Claude Code's own auth.
 * Falls back to neutral on any failure (no hard crashes in classification).
 */

import { spawn } from "node:child_process"
import type { ClassificationResult } from "../types.js"
import { buildAgentPrompt, buildUserPrompt } from "./prompts.js"

/**
 * Run a command with stdin input and capture stdout.
 * Uses spawn to pipe input to stdin (execFile doesn't support `input`).
 */
function spawnWithInput(
  cmd: string,
  args: string[],
  input: string,
  timeoutMs: number,
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk))

    child.on("error", reject)
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8")
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8")
        reject(new Error(`claude -p exited with code ${code}: ${stderr.slice(0, 200)}`))
        return
      }
      resolve({ stdout })
    })

    child.stdin.write(input)
    child.stdin.end()
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassificationUsage {
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
}

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
    const { stdout } = await spawnWithInput(
      "claude",
      ["-p", "--model", model, "--output-format", "json", "--max-turns", "1"],
      prompt,
      timeoutMs,
    )

    // Parse the outer claude -p JSON response
    const response = JSON.parse(stdout)

    if (response.is_error || response.type !== "result") {
      console.error("[openfeelz] claude -p returned error:", response.result)
      return { ...NEUTRAL_RESULT }
    }

    // Extract usage from modelUsage
    const modelEntries = Object.values(response.modelUsage ?? {}) as Array<
      Record<string, number>
    >
    const usage: ClassificationUsage = {
      inputTokens: modelEntries.reduce(
        (sum, m) => sum + (m.inputTokens ?? 0),
        0,
      ),
      outputTokens: modelEntries.reduce(
        (sum, m) => sum + (m.outputTokens ?? 0),
        0,
      ),
      costUsd: response.total_cost_usd ?? 0,
      durationMs: response.duration_ms ?? 0,
    }

    // Parse the classification from the result field
    const parsed = parseClassificationResult(response.result)
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
