/**
 * Tests for claude-classify — emotion classification via claude -p.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { DEFAULT_CONFIG } from "../types.js"
import type { ClassificationUsage } from "../types.js"

// ---------------------------------------------------------------------------
// Mock the shared claude-cli utility
// ---------------------------------------------------------------------------

const { mockCallClaude } = vi.hoisted(() => ({
  mockCallClaude: vi.fn(),
}))

vi.mock("../utils/claude-cli.js", () => ({
  callClaude: mockCallClaude,
}))

import {
  classifyEmotion,
  parseClassificationResult,
  coerceResult,
} from "./claude-classify.js"

/** Helper to set up a successful callClaude mock response. */
function mockCallClaudeSuccess(result: string, usage?: Partial<ClassificationUsage>): void {
  mockCallClaude.mockResolvedValue({
    result,
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
      durationMs: usage?.durationMs ?? 0,
    },
  })
}

/** Helper to set up a failing callClaude mock. */
function mockCallClaudeError(err: Error): void {
  mockCallClaude.mockRejectedValue(err)
}

// ---------------------------------------------------------------------------
// parseClassificationResult
// ---------------------------------------------------------------------------

describe("parseClassificationResult", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      label: "happy",
      intensity: 0.7,
      reason: "user expressed delight",
      confidence: 0.85,
    })
    const result = parseClassificationResult(raw)
    expect(result.label).toBe("happy")
    expect(result.intensity).toBe(0.7)
    expect(result.reason).toBe("user expressed delight")
    expect(result.confidence).toBe(0.85)
  })

  it("extracts JSON from markdown code block", () => {
    const raw =
      '```json\n{"label":"sad","intensity":0.5,"reason":"low mood","confidence":0.6}\n```'
    const result = parseClassificationResult(raw)
    expect(result.label).toBe("sad")
    expect(result.intensity).toBe(0.5)
  })

  it("extracts JSON from code block without language tag", () => {
    const raw =
      '```\n{"label":"calm","intensity":0.3,"reason":"relaxed tone","confidence":0.7}\n```'
    const result = parseClassificationResult(raw)
    expect(result.label).toBe("calm")
  })

  it("throws on invalid JSON", () => {
    expect(() => parseClassificationResult("not json")).toThrow()
  })

  it("throws on missing required fields", () => {
    const raw = JSON.stringify({ label: "happy" })
    expect(() => parseClassificationResult(raw)).toThrow(
      /Invalid classification response/,
    )
  })
})

// ---------------------------------------------------------------------------
// coerceResult
// ---------------------------------------------------------------------------

describe("coerceResult", () => {
  const labels = DEFAULT_CONFIG.emotionLabels

  it("normalizes label to lowercase", () => {
    const result = coerceResult(
      { label: "HAPPY", intensity: 0.5, reason: "test", confidence: 0.8 },
      labels,
      0.35,
    )
    expect(result.label).toBe("happy")
  })

  it("falls back to neutral for unknown labels", () => {
    const result = coerceResult(
      {
        label: "zzz_unknown",
        intensity: 0.5,
        reason: "test",
        confidence: 0.8,
      },
      labels,
      0.35,
    )
    expect(result.label).toBe("neutral")
    expect(result.intensity).toBe(0)
  })

  it("clamps intensity to [0, 1]", () => {
    const result = coerceResult(
      { label: "happy", intensity: 1.5, reason: "test", confidence: 0.8 },
      labels,
      0.35,
    )
    expect(result.intensity).toBe(1)
  })

  it("clamps negative intensity to 0", () => {
    const result = coerceResult(
      { label: "happy", intensity: -0.5, reason: "test", confidence: 0.8 },
      labels,
      0.35,
    )
    expect(result.intensity).toBe(0)
  })

  it("falls back to neutral when confidence is below minimum", () => {
    const result = coerceResult(
      { label: "angry", intensity: 0.8, reason: "test", confidence: 0.1 },
      labels,
      0.35,
    )
    expect(result.label).toBe("neutral")
    expect(result.intensity).toBe(0)
  })

  it("replaces empty reason with 'unsure'", () => {
    const result = coerceResult(
      { label: "happy", intensity: 0.5, reason: "  ", confidence: 0.8 },
      labels,
      0.35,
    )
    expect(result.reason).toBe("unsure")
  })
})

// ---------------------------------------------------------------------------
// classifyEmotion — integration (mocked callClaude)
// ---------------------------------------------------------------------------

describe("classifyEmotion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("parses a successful claude -p response with usage", async () => {
    mockCallClaudeSuccess(
      JSON.stringify({
        label: "happy",
        intensity: 0.7,
        reason: "positive greeting",
        confidence: 0.9,
      }),
      {
        inputTokens: 150,
        outputTokens: 30,
        costUsd: 0.0001,
        durationMs: 1200,
      },
    )

    const result = await classifyEmotion("Hello! Great to see you!", {
      role: "agent",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
      model: "haiku",
    })

    expect(result.label).toBe("happy")
    expect(result.intensity).toBe(0.7)
    expect(result.confidence).toBe(0.9)
    expect(result.usage).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      costUsd: 0.0001,
      durationMs: 1200,
    })
  })

  it("uses user prompt for role: user", async () => {
    mockCallClaudeSuccess(
      JSON.stringify({
        label: "frustrated",
        intensity: 0.6,
        reason: "deployment issues",
        confidence: 0.8,
      }),
    )

    const result = await classifyEmotion("This deployment keeps failing!", {
      role: "user",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("frustrated")
    expect(result.intensity).toBe(0.6)
  })

  it("returns neutral when callClaude throws an error", async () => {
    mockCallClaudeError(new Error("claude -p returned error: Something went wrong"))

    const result = await classifyEmotion("test", {
      role: "agent",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("neutral")
    expect(result.intensity).toBe(0)
    expect(result.confidence).toBe(0)
  })

  it("returns neutral when spawn emits error", async () => {
    mockCallClaudeError(new Error("command not found: claude"))

    const result = await classifyEmotion("test", {
      role: "agent",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("neutral")
    expect(result.intensity).toBe(0)
    expect(result.confidence).toBe(0)
  })

  it("returns neutral when result is invalid JSON", async () => {
    mockCallClaudeSuccess("not valid json at all")

    const result = await classifyEmotion("test", {
      role: "agent",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("neutral")
  })

  it("handles result with markdown-wrapped JSON", async () => {
    mockCallClaudeSuccess(
      '```json\n{"label":"excited","intensity":0.8,"reason":"great news","confidence":0.95}\n```',
    )

    const result = await classifyEmotion("This is amazing news!", {
      role: "user",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("excited")
    expect(result.intensity).toBe(0.8)
  })
})

// Integration tests are in claude-classify.integration.test.ts
// (separate file to avoid vi.mock poisoning real spawn calls)
