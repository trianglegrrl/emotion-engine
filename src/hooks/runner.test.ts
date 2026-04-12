/**
 * Tests for HookRunner — the central integration point for Claude Code hooks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResolvedConfig } from "../config/resolve-config.js";
import type { EmotionEngineState, ClassificationResult, UserStyleProfile, UserStyleTracker } from "../types.js";
import { DEFAULT_CONFIG, DEFAULT_STYLE_PROFILE } from "../types.js";
import { buildEmptyState } from "../state/state-file.js";
import type { StyleProfileConfig } from "../config/style-config.js";
import { DEFAULT_STYLE_CONFIG } from "../config/style-config.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../classify/claude-classify.js", () => ({
  classifyEmotion: vi.fn(),
}));

vi.mock("../classify/style-profiler.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../classify/style-profiler.js")>();
  return {
    ...actual,
    runProfiling: vi.fn(),
  };
});

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
import { runProfiling } from "../classify/style-profiler.js";
import { readStateFile, writeStateFile } from "../state/state-file.js";
import { HookRunner } from "./runner.js";

const mockClassify = vi.mocked(classifyEmotion);
const mockRunProfiling = vi.mocked(runProfiling);
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
  overrides: Partial<ClassificationResult & { usage?: import("../types.js").ClassificationUsage }> = {},
): ClassificationResult & { usage?: import("../types.js").ClassificationUsage } {
  return {
    label: "joy",
    intensity: 0.7,
    reason: "user expressed happiness",
    confidence: 0.9,
    ...overrides,
  };
}

function makeMatureStyleProfile(overrides: Partial<UserStyleProfile> = {}): UserStyleProfile {
  return {
    ...DEFAULT_STYLE_PROFILE,
    sampleSize: 20, // above default maturity threshold of 10
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeTracker(overrides: Partial<UserStyleTracker> = {}): UserStyleTracker {
  return {
    profile: { ...DEFAULT_STYLE_PROFILE, lastUpdated: new Date().toISOString() },
    messagesSinceLastProfile: 0,
    ...overrides,
  };
}

function makeUsage(overrides: Partial<import("../types.js").ClassificationUsage> = {}): import("../types.js").ClassificationUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.001,
    durationMs: 200,
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

  // -------------------------------------------------------------------------
  // Style Profiling & Token Tracking
  // -------------------------------------------------------------------------

  describe("style profiling integration", () => {
    it("handleUserPrompt increments messagesSinceLastProfile", async () => {
      const config = makeConfig({ syncUserClassification: false, userEmotions: false });
      const runner = new HookRunner(config);

      const initialState = buildEmptyState();
      mockReadState.mockResolvedValue(initialState);

      await runner.handleUserPrompt({
        session_id: "sess-style-1",
        user_message: "hello",
      });

      expect(mockWriteState).toHaveBeenCalled();
      const savedState = mockWriteState.mock.calls[0][1] as EmotionEngineState;
      expect(savedState.userStyles["sess-style-1"]).toBeDefined();
      expect(savedState.userStyles["sess-style-1"].messagesSinceLastProfile).toBe(1);
    });

    it("handleUserPrompt passes style profile to classification when mature", async () => {
      const config = makeConfig({
        syncUserClassification: true,
        userEmotions: true,
      });
      const styleConfig: StyleProfileConfig = { ...DEFAULT_STYLE_CONFIG, profileMaturityThreshold: 5 };
      const runner = new HookRunner(config, styleConfig);

      const matureProfile = makeMatureStyleProfile({ sampleSize: 10 });
      const initialState = buildEmptyState();
      const stateWithTracker: EmotionEngineState = {
        ...initialState,
        userStyles: {
          "sess-style-2": {
            profile: matureProfile,
            messagesSinceLastProfile: 3,
          },
        },
      };
      mockReadState.mockResolvedValue(stateWithTracker);
      mockClassify.mockResolvedValue(makeClassificationResult());

      await runner.handleUserPrompt({
        session_id: "sess-style-2",
        user_message: "I love this feature!",
      });

      expect(mockClassify).toHaveBeenCalledWith(
        "I love this feature!",
        expect.objectContaining({
          role: "user",
          style: matureProfile,
          maturityThreshold: 5,
        }),
      );
    });

    it("handleUserPrompt does NOT pass style when immature", async () => {
      const config = makeConfig({
        syncUserClassification: true,
        userEmotions: true,
      });
      const runner = new HookRunner(config);

      const immatureProfile = { ...DEFAULT_STYLE_PROFILE, sampleSize: 2, lastUpdated: new Date().toISOString() };
      const initialState = buildEmptyState();
      const stateWithTracker: EmotionEngineState = {
        ...initialState,
        userStyles: {
          "sess-style-3": {
            profile: immatureProfile,
            messagesSinceLastProfile: 1,
          },
        },
      };
      mockReadState.mockResolvedValue(stateWithTracker);
      mockClassify.mockResolvedValue(makeClassificationResult());

      await runner.handleUserPrompt({
        session_id: "sess-style-3",
        user_message: "testing",
      });

      expect(mockClassify).toHaveBeenCalledWith(
        "testing",
        expect.not.objectContaining({ style: expect.anything() }),
      );
    });

    it("handleUserPrompt stores sourceExcerpt on stimulus", async () => {
      const config = makeConfig({
        syncUserClassification: true,
        userEmotions: true,
      });
      const runner = new HookRunner(config);

      mockClassify.mockResolvedValue(makeClassificationResult());

      await runner.handleUserPrompt({
        session_id: "sess-excerpt",
        user_message: "I am so happy today!",
      });

      expect(mockWriteState).toHaveBeenCalled();
      const savedState = mockWriteState.mock.calls[0][1] as EmotionEngineState;
      const userBucket = savedState.users["sess-excerpt"];
      expect(userBucket).toBeDefined();
      expect(userBucket.latest?.sourceExcerpt).toBe("I am so happy today!");
      expect(userBucket.history[0]?.sourceExcerpt).toBe("I am so happy today!");
    });

    it("handleUserPrompt updates tokenUsage aggregate", async () => {
      const config = makeConfig({
        syncUserClassification: true,
        userEmotions: true,
      });
      const runner = new HookRunner(config);

      const usage = makeUsage();
      mockClassify.mockResolvedValue(makeClassificationResult({ usage }));

      await runner.handleUserPrompt({
        session_id: "sess-tokens",
        user_message: "hello world",
      });

      expect(mockWriteState).toHaveBeenCalled();
      const savedState = mockWriteState.mock.calls[0][1] as EmotionEngineState;
      expect(savedState.tokenUsage.totalInput).toBe(100);
      expect(savedState.tokenUsage.totalOutput).toBe(50);
      expect(savedState.tokenUsage.totalCostUsd).toBeCloseTo(0.001);
      expect(savedState.tokenUsage.classificationCount).toBe(1);
    });

    it("handleStop triggers profiling after profilingInterval messages", async () => {
      const config = makeConfig({ agentEmotions: false });
      const styleConfig: StyleProfileConfig = { ...DEFAULT_STYLE_CONFIG, profilingInterval: 5 };
      const runner = new HookRunner(config, styleConfig);

      const tracker = makeTracker({ messagesSinceLastProfile: 5 });
      const initialState: EmotionEngineState = {
        ...buildEmptyState(),
        userStyles: { "sess-prof": tracker },
      };
      mockReadState.mockResolvedValue(initialState);

      const profiledProfile = makeMatureStyleProfile({ sampleSize: 5 });
      const profilingUsage = makeUsage({ inputTokens: 200, outputTokens: 100, costUsd: 0.002 });
      mockRunProfiling.mockResolvedValue({ profile: profiledProfile, usage: profilingUsage });

      await runner.handleStop({
        session_id: "sess-prof",
      });

      expect(mockRunProfiling).toHaveBeenCalledWith(
        expect.any(Array),
        tracker.profile,
        styleConfig,
        config.model,
      );
    });

    it("handleStop resets messagesSinceLastProfile after profiling", async () => {
      const config = makeConfig({ agentEmotions: false });
      const styleConfig: StyleProfileConfig = { ...DEFAULT_STYLE_CONFIG, profilingInterval: 5 };
      const runner = new HookRunner(config, styleConfig);

      const tracker = makeTracker({ messagesSinceLastProfile: 7 });
      const initialState: EmotionEngineState = {
        ...buildEmptyState(),
        userStyles: { "sess-reset": tracker },
      };
      mockReadState.mockResolvedValue(initialState);

      const profiledProfile = makeMatureStyleProfile({ sampleSize: 7 });
      mockRunProfiling.mockResolvedValue({ profile: profiledProfile, usage: makeUsage() });

      await runner.handleStop({
        session_id: "sess-reset",
      });

      expect(mockWriteState).toHaveBeenCalled();
      const savedState = mockWriteState.mock.calls[0][1] as EmotionEngineState;
      expect(savedState.userStyles["sess-reset"].messagesSinceLastProfile).toBe(0);
      expect(savedState.userStyles["sess-reset"].profile).toEqual(profiledProfile);
    });

    it("handleStop updates tokenUsage for profiling call", async () => {
      const config = makeConfig({ agentEmotions: false });
      const styleConfig: StyleProfileConfig = { ...DEFAULT_STYLE_CONFIG, profilingInterval: 3 };
      const runner = new HookRunner(config, styleConfig);

      const tracker = makeTracker({ messagesSinceLastProfile: 3 });
      const initialState: EmotionEngineState = {
        ...buildEmptyState(),
        userStyles: { "sess-prof-tokens": tracker },
      };
      mockReadState.mockResolvedValue(initialState);

      const profilingUsage = makeUsage({ inputTokens: 300, outputTokens: 150, costUsd: 0.003 });
      mockRunProfiling.mockResolvedValue({
        profile: makeMatureStyleProfile(),
        usage: profilingUsage,
      });

      await runner.handleStop({
        session_id: "sess-prof-tokens",
      });

      expect(mockWriteState).toHaveBeenCalled();
      const savedState = mockWriteState.mock.calls[0][1] as EmotionEngineState;
      expect(savedState.tokenUsage.totalInput).toBe(300);
      expect(savedState.tokenUsage.totalOutput).toBe(150);
      expect(savedState.tokenUsage.totalCostUsd).toBeCloseTo(0.003);
      expect(savedState.tokenUsage.classificationCount).toBe(1);
    });
  });
});
