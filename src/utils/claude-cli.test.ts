/**
 * Tests for shared claude -p CLI utilities.
 * Unit tests with fake data — no real subprocess invocations.
 */

import { describe, it, expect } from "vitest"
import { parseClaudeResponse, extractUsageFromResponse } from "./claude-cli.js"

// ---------------------------------------------------------------------------
// parseClaudeResponse
// ---------------------------------------------------------------------------

describe("parseClaudeResponse", () => {
  it("returns the result string from a successful response", () => {
    const stdout = JSON.stringify({
      type: "result",
      is_error: false,
      result: '{"label":"happy","intensity":0.7}',
    })
    expect(parseClaudeResponse(stdout)).toBe('{"label":"happy","intensity":0.7}')
  })

  it("throws when response is_error is true", () => {
    const stdout = JSON.stringify({
      type: "result",
      is_error: true,
      result: "Something went wrong",
    })
    expect(() => parseClaudeResponse(stdout)).toThrow(/claude -p returned error/)
  })

  it("throws when response type is not 'result'", () => {
    const stdout = JSON.stringify({
      type: "error",
      is_error: false,
      result: "unexpected type",
    })
    expect(() => parseClaudeResponse(stdout)).toThrow(/claude -p returned error/)
  })

  it("throws on invalid JSON", () => {
    expect(() => parseClaudeResponse("not json")).toThrow()
  })

  it("handles result field that is not a string", () => {
    const stdout = JSON.stringify({
      type: "result",
      is_error: true,
      result: { nested: "object" },
    })
    expect(() => parseClaudeResponse(stdout)).toThrow(/claude -p returned error/)
  })
})

// ---------------------------------------------------------------------------
// extractUsageFromResponse
// ---------------------------------------------------------------------------

describe("extractUsageFromResponse", () => {
  it("sums token counts across model entries", () => {
    const response = {
      modelUsage: {
        "claude-3-5-haiku-20241022": {
          inputTokens: 100,
          outputTokens: 20,
        },
        "claude-3-5-sonnet-20241022": {
          inputTokens: 50,
          outputTokens: 10,
        },
      },
      total_cost_usd: 0.0005,
      duration_ms: 1500,
    }

    const usage = extractUsageFromResponse(response)
    expect(usage.inputTokens).toBe(150)
    expect(usage.outputTokens).toBe(30)
    expect(usage.costUsd).toBe(0.0005)
    expect(usage.durationMs).toBe(1500)
  })

  it("returns zeros when modelUsage is empty", () => {
    const response = {
      modelUsage: {},
      total_cost_usd: 0,
      duration_ms: 0,
    }

    const usage = extractUsageFromResponse(response)
    expect(usage.inputTokens).toBe(0)
    expect(usage.outputTokens).toBe(0)
    expect(usage.costUsd).toBe(0)
    expect(usage.durationMs).toBe(0)
  })

  it("handles missing modelUsage gracefully", () => {
    const response = {}

    const usage = extractUsageFromResponse(response)
    expect(usage.inputTokens).toBe(0)
    expect(usage.outputTokens).toBe(0)
    expect(usage.costUsd).toBe(0)
    expect(usage.durationMs).toBe(0)
  })

  it("handles missing cost and duration fields", () => {
    const response = {
      modelUsage: {
        "claude-3-5-haiku-20241022": {
          inputTokens: 100,
          outputTokens: 20,
        },
      },
    }

    const usage = extractUsageFromResponse(response)
    expect(usage.inputTokens).toBe(100)
    expect(usage.outputTokens).toBe(20)
    expect(usage.costUsd).toBe(0)
    expect(usage.durationMs).toBe(0)
  })
})
