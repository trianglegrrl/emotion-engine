/**
 * Tests for HookRunner — the central integration point for Claude Code hooks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResolvedConfig } from "../config/resolve-config.js";
import type { EmotionEngineState, ClassificationResult } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { buildEmptyState } from "../state/state-file.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../classify/claude-classify.js", () => ({
  classifyEmotion: vi.fn(),
}));

vi.mock("../state/state-file.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/state-file.js")>();
  return {
    ...actual,
    readStateFile: vi.fn(() => Promise.resolve(actual.buildEmptyState())),
    writeStateFile: vi.fn(() => Promise.resolve()),
    acquireLock: vi.fn(() => Promise.resolve(true)),
    releaseLock: vi.fn(() => Promise.resolve()),
  };
});

import { classifyEmotion } from "../classify/claude-classify.js";
import { readStateFile, writeStateFile } from "../state/state-file.js";
import { HookRunner } from "./runner.js";

const mockClassify = vi.mocked(classifyEmotion);
const mockReadState = vi.mocked(readStateFile);
const mockWriteState = vi.mocked(writeStateFile);

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    dataDir: "/tmp/openfeelz-test",
    ...overrides,
  };
}

function makeClassificationResult(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return {
    label: "joy",
    intensity: 0.7,
    reason: "user expressed happiness",
    confidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HookRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadState.mockResolvedValue(buildEmptyState());
    mockWriteState.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // 1. handleSessionStart returns additionalContext with <openfeelz> block
  // -------------------------------------------------------------------------
  it("handleSessionStart returns additionalContext with openfeelz block", async () => {
    const config = makeConfig({ agentEmotions: true });
    const runner = new HookRunner(config);

    const result = await runner.handleSessionStart({
      session_id: "sess-1",
    });

    expect(result).toHaveProperty("hookSpecificOutput");
    const output = result.hookSpecificOutput!;
    expect(output.hookEventName).toBe("SessionStart");
    expect(output.additionalContext).toContain("<openfeelz>");
    expect(output.additionalContext).toContain("</openfeelz>");
  });

  // -------------------------------------------------------------------------
  // 2. handleSessionStart returns empty when both features disabled
  // -------------------------------------------------------------------------
  it("handleSessionStart returns empty when both features disabled", async () => {
    const config = makeConfig({
      agentEmotions: false,
      userEmotions: false,
    });
    const runner = new HookRunner(config);

    const result = await runner.handleSessionStart({
      session_id: "sess-2",
    });

    expect(result).toEqual({});
  });

  // -------------------------------------------------------------------------
  // 3. handleUserPrompt increments turnCount for turn preset
  // -------------------------------------------------------------------------
  it("handleUserPrompt increments turnCount for turn preset", async () => {
    const config = makeConfig({ decayPreset: "turn" });
    const runner = new HookRunner(config);

    const initialState = buildEmptyState();
    initialState.turnCount = 5;
    mockReadState.mockResolvedValue(initialState);

    await runner.handleUserPrompt({
      session_id: "sess-3",
    });

    // Verify state was saved with incremented turnCount
    expect(mockWriteState).toHaveBeenCalled();
    const savedState = mockWriteState.mock.calls[0][1] as EmotionEngineState;
    expect(savedState.turnCount).toBe(6);
  });

  // -------------------------------------------------------------------------
  // 4. handleUserPrompt classifies user message when sync + userEmotions
  // -------------------------------------------------------------------------
  it("handleUserPrompt classifies user message when sync + userEmotions enabled", async () => {
    const config = makeConfig({
      syncUserClassification: true,
      userEmotions: true,
    });
    const runner = new HookRunner(config);

    mockClassify.mockResolvedValue(makeClassificationResult());

    await runner.handleUserPrompt({
      session_id: "sess-4",
      user_message: "I am so happy today!",
    });

    expect(mockClassify).toHaveBeenCalledWith(
      "I am so happy today!",
      expect.objectContaining({ role: "user" }),
    );
  });

  // -------------------------------------------------------------------------
  // 5. handleUserPrompt does NOT classify when sync disabled
  // -------------------------------------------------------------------------
  it("handleUserPrompt does NOT classify when sync disabled", async () => {
    const config = makeConfig({
      syncUserClassification: false,
      userEmotions: true,
    });
    const runner = new HookRunner(config);

    await runner.handleUserPrompt({
      session_id: "sess-5",
      user_message: "I am so happy today!",
    });

    expect(mockClassify).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. handleUserPrompt returns additionalContext
  // -------------------------------------------------------------------------
  it("handleUserPrompt returns additionalContext", async () => {
    const config = makeConfig({ agentEmotions: true });
    const runner = new HookRunner(config);

    const result = await runner.handleUserPrompt({
      session_id: "sess-6",
    });

    expect(result).toHaveProperty("hookSpecificOutput");
    const output = result.hookSpecificOutput!;
    expect(output.hookEventName).toBe("UserPromptSubmit");
    expect(output.additionalContext).toContain("<openfeelz>");
  });

  // -------------------------------------------------------------------------
  // 7. handleStop classifies assistant message when agentEmotions enabled
  // -------------------------------------------------------------------------
  it("handleStop classifies assistant message when agentEmotions enabled", async () => {
    const config = makeConfig({ agentEmotions: true });
    const runner = new HookRunner(config);

    mockClassify.mockResolvedValue(makeClassificationResult({ label: "curiosity" }));

    await runner.handleStop({
      session_id: "sess-7",
      last_assistant_message: "That is a fascinating problem!",
    });

    expect(mockClassify).toHaveBeenCalledWith(
      "That is a fascinating problem!",
      expect.objectContaining({ role: "agent" }),
    );
    // Verify state was saved
    expect(mockWriteState).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. handleStop skips gracefully when last_assistant_message missing
  // -------------------------------------------------------------------------
  it("handleStop skips gracefully when last_assistant_message missing", async () => {
    const config = makeConfig({ agentEmotions: true });
    const runner = new HookRunner(config);

    const result = await runner.handleStop({
      session_id: "sess-8",
    });

    expect(mockClassify).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  // -------------------------------------------------------------------------
  // 9. handleStop returns empty object (no additionalContext)
  // -------------------------------------------------------------------------
  it("handleStop returns empty object", async () => {
    const config = makeConfig({ agentEmotions: true });
    const runner = new HookRunner(config);

    mockClassify.mockResolvedValue(makeClassificationResult());

    const result = await runner.handleStop({
      session_id: "sess-9",
      last_assistant_message: "Done!",
    });

    expect(result).toEqual({});
  });

  // -------------------------------------------------------------------------
  // 10. Error handling: handler returns {} on error
  // -------------------------------------------------------------------------
  it("handler returns {} on error", async () => {
    const config = makeConfig();
    const runner = new HookRunner(config);

    mockReadState.mockRejectedValue(new Error("disk exploded"));

    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runner.handleSessionStart({
      session_id: "sess-10",
    });

    expect(result).toEqual({});
    expect(stderrSpy).toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Subagent state path resolution
  // -------------------------------------------------------------------------
  it("resolves subagent state path when agent_id provided", async () => {
    const config = makeConfig({ agentEmotions: true });
    const runner = new HookRunner(config);

    await runner.handleSessionStart({
      session_id: "sess-sub",
      agent_id: "task-agent-42",
    });

    // readStateFile should have been called with the subagent path
    expect(mockReadState).toHaveBeenCalledWith(
      expect.stringContaining("agents/task-agent-42.json"),
    );
  });
});
