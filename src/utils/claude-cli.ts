/**
 * Shared utilities for invoking claude -p (Claude Code's non-interactive CLI mode).
 *
 * Extracted from classify/claude-classify.ts so that both the emotion classifier
 * and the style profiler can reuse the same spawn + parse logic.
 */

import { spawn } from "node:child_process"
import type { ClassificationUsage } from "../types.js"

// ---------------------------------------------------------------------------
// Low-level spawn helper
// ---------------------------------------------------------------------------

/**
 * Run a command with stdin input and capture stdout.
 * Uses spawn to pipe input to stdin (execFile doesn't support `input`).
 */
export function spawnWithInput(
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
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse the outer JSON envelope from `claude -p --output-format json`.
 * Checks for errors and returns the `result` string.
 *
 * @throws {Error} if the response indicates an error or is not a result type.
 */
export function parseClaudeResponse(stdout: string): string {
  const response = JSON.parse(stdout)

  if (response.is_error || response.type !== "result") {
    const message = typeof response.result === "string"
      ? response.result
      : JSON.stringify(response.result)
    throw new Error(`claude -p returned error: ${message}`)
  }

  return response.result
}

/**
 * Extract token usage from a parsed claude -p JSON response.
 * Sums across all model entries in `modelUsage`.
 */
export function extractUsageFromResponse(response: Record<string, unknown>): ClassificationUsage {
  const modelEntries = Object.values(
    (response.modelUsage ?? {}) as Record<string, Record<string, number>>,
  ) as Array<Record<string, number>>

  return {
    inputTokens: modelEntries.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0),
    outputTokens: modelEntries.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
    costUsd: (response.total_cost_usd as number) ?? 0,
    durationMs: (response.duration_ms as number) ?? 0,
  }
}

// ---------------------------------------------------------------------------
// High-level helper
// ---------------------------------------------------------------------------

export interface CallClaudeOptions {
  model?: string
  timeoutMs?: number
}

export interface CallClaudeResult {
  result: string
  usage: ClassificationUsage
}

/**
 * High-level: send a prompt to `claude -p`, parse the response, and return
 * the result text plus token usage.
 */
export async function callClaude(
  prompt: string,
  options: CallClaudeOptions = {},
): Promise<CallClaudeResult> {
  const model = options.model ?? "haiku"
  const timeoutMs = options.timeoutMs ?? 30_000

  const { stdout } = await spawnWithInput(
    "claude",
    ["-p", "--model", model, "--output-format", "json", "--max-turns", "1"],
    prompt,
    timeoutMs,
  )

  const response = JSON.parse(stdout)
  const result = parseClaudeResponse(stdout)
  const usage = extractUsageFromResponse(response)

  return { result, usage }
}
