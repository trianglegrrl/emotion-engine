/**
 * Integration tests for claude -p classification.
 *
 * These make REAL claude -p calls — no mocks.
 * Skipped unless RUN_INTEGRATION=1 is set.
 * Separate file from unit tests to avoid vi.mock poisoning.
 */

import { describe, it, expect } from "vitest"
import { classifyEmotion } from "./claude-classify.js"

describe.skipIf(!process.env.RUN_INTEGRATION)("integration: real claude -p", () => {
  it("classifies a frustrated message via real claude -p call", async () => {
    const result = await classifyEmotion("I am SO frustrated with this bug!", {
      role: "user",
      emotionLabels: ["neutral", "happy", "frustrated", "angry", "sad", "curious"],
      confidenceMin: 0.3,
      model: "haiku",
    })
    expect(result.label).toBe("frustrated")
    expect(result.intensity).toBeGreaterThan(0.5)
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.usage).toBeDefined()
    expect(result.usage?.inputTokens).toBeGreaterThan(0)
    expect(result.usage?.outputTokens).toBeGreaterThan(0)
    expect(result.usage?.costUsd).toBeGreaterThan(0)
    expect(result.usage?.durationMs).toBeGreaterThan(0)
  }, 60000)

  it("classifies an agent calm response", async () => {
    const result = await classifyEmotion("Let me help you work through this step by step.", {
      role: "agent",
      emotionLabels: ["neutral", "calm", "focused", "happy", "frustrated"],
      confidenceMin: 0.3,
      model: "haiku",
    })
    expect(["calm", "focused", "neutral"]).toContain(result.label)
    expect(result.confidence).toBeGreaterThan(0.3)
    expect(result.usage).toBeDefined()
  }, 60000)

  it("returns neutral for empty text", async () => {
    const result = await classifyEmotion("", {
      role: "user",
      emotionLabels: ["neutral", "happy"],
      confidenceMin: 0.3,
      model: "haiku",
    })
    expect(result.intensity).toBeLessThanOrEqual(0.5)
  }, 60000)
})
