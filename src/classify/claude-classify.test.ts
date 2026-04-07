/**
 * Tests for claude-classify — emotion classification via claude -p.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { EventEmitter } from "node:events"
import { Readable, Writable } from "node:stream"
import { DEFAULT_CONFIG } from "../types.js"

// ---------------------------------------------------------------------------
// Mock node:child_process spawn
// ---------------------------------------------------------------------------

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}))

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}))

import {
  classifyEmotion,
  parseClassificationResult,
  coerceResult,
} from "./claude-classify.js"

/** Create a fake child process that emits stdout data and closes. */
function createFakeChild(stdout: string, exitCode: number = 0): EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
} {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: Readable
    stderr: Readable
  }
  child.stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  child.stdout = new Readable({ read() {} })
  child.stderr = new Readable({ read() {} })

  // Push stdout data and close on next tick
  process.nextTick(() => {
    child.stdout.push(Buffer.from(stdout))
    child.stdout.push(null)
    child.stderr.push(null)
  })

  // Emit close after streams drain
  setTimeout(() => {
    child.emit("close", exitCode)
  }, 5)

  return child
}

/** Create a fake child process that emits an error. */
function createFakeChildError(err: Error): EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
} {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: Readable
    stderr: Readable
  }
  child.stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
  child.stdout = new Readable({ read() {} })
  child.stderr = new Readable({ read() {} })

  process.nextTick(() => {
    child.emit("error", err)
  })

  return child
}

function mockSpawnSuccess(stdout: string): void {
  mockSpawn.mockReturnValue(createFakeChild(stdout))
}

function mockSpawnError(err: Error): void {
  mockSpawn.mockReturnValue(createFakeChildError(err))
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
// classifyEmotion — integration (mocked spawn)
// ---------------------------------------------------------------------------

describe("classifyEmotion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("parses a successful claude -p response with usage", async () => {
    const claudeResponse = {
      type: "result",
      is_error: false,
      result: JSON.stringify({
        label: "happy",
        intensity: 0.7,
        reason: "positive greeting",
        confidence: 0.9,
      }),
      modelUsage: {
        "claude-3-5-haiku-20241022": {
          inputTokens: 150,
          outputTokens: 30,
        },
      },
      total_cost_usd: 0.0001,
      duration_ms: 1200,
    }

    mockSpawnSuccess(JSON.stringify(claudeResponse))

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
    const claudeResponse = {
      type: "result",
      is_error: false,
      result: JSON.stringify({
        label: "frustrated",
        intensity: 0.6,
        reason: "deployment issues",
        confidence: 0.8,
      }),
      modelUsage: {},
      total_cost_usd: 0,
      duration_ms: 800,
    }

    mockSpawnSuccess(JSON.stringify(claudeResponse))

    const result = await classifyEmotion("This deployment keeps failing!", {
      role: "user",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("frustrated")
    expect(result.intensity).toBe(0.6)
  })

  it("returns neutral when claude -p returns an error response", async () => {
    const claudeResponse = {
      type: "result",
      is_error: true,
      result: "Something went wrong",
      modelUsage: {},
    }

    mockSpawnSuccess(JSON.stringify(claudeResponse))

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
    mockSpawnError(new Error("command not found: claude"))

    const result = await classifyEmotion("test", {
      role: "agent",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("neutral")
    expect(result.intensity).toBe(0)
    expect(result.confidence).toBe(0)
  })

  it("returns neutral when stdout is invalid JSON", async () => {
    mockSpawnSuccess("not valid json at all")

    const result = await classifyEmotion("test", {
      role: "agent",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("neutral")
  })

  it("handles result with markdown-wrapped JSON", async () => {
    const claudeResponse = {
      type: "result",
      is_error: false,
      result:
        '```json\n{"label":"excited","intensity":0.8,"reason":"great news","confidence":0.95}\n```',
      modelUsage: {},
      total_cost_usd: 0,
      duration_ms: 500,
    }

    mockSpawnSuccess(JSON.stringify(claudeResponse))

    const result = await classifyEmotion("This is amazing news!", {
      role: "user",
      emotionLabels: DEFAULT_CONFIG.emotionLabels,
      confidenceMin: 0.35,
    })

    expect(result.label).toBe("excited")
    expect(result.intensity).toBe(0.8)
  })
})
