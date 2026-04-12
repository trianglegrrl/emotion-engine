import { describe, it, expect } from "vitest";
import { formatEmotionBlock, formatTimestamp, formatDimensionSummary } from "./prompt-formatter.js";
import { buildEmptyState } from "../state/state-file.js";
import type { EmotionStimulus } from "../types.js";

function makeStimulus(overrides: Partial<EmotionStimulus> = {}): EmotionStimulus {
  return {
    id: "test-1",
    timestamp: "2026-02-06T12:00:00Z",
    label: "happy",
    intensity: 0.7,
    trigger: "positive conversation",
    confidence: 0.9,
    sourceRole: "user",
    ...overrides,
  };
}

describe("prompt-formatter", () => {
  describe("formatTimestamp", () => {
    it("formats ISO timestamp to readable date", () => {
      const formatted = formatTimestamp("2026-02-06T12:00:00Z");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("02");
      expect(formatted).toContain("06");
    });

    it("returns original string on invalid date", () => {
      expect(formatTimestamp("not-a-date")).toBe("not-a-date");
    });

    it("respects timezone when provided", () => {
      const formatted = formatTimestamp("2026-02-06T12:00:00Z", "America/Los_Angeles");
      // LA is UTC-8, so 12:00 UTC = 04:00 LA
      expect(formatted).toContain("04");
    });
  });

  describe("formatDimensionSummary", () => {
    it("produces a compact summary of non-neutral dimensions", () => {
      const state = buildEmptyState();
      state.dimensions.pleasure = 0.6;
      state.dimensions.arousal = -0.3;
      state.dimensions.curiosity = 0.8;
      const summary = formatDimensionSummary(state.dimensions, state.baseline);
      expect(summary).toContain("pleasure");
      expect(summary).toContain("curiosity");
    });

    it("returns empty string when all dimensions are at baseline", () => {
      const state = buildEmptyState();
      const summary = formatDimensionSummary(state.dimensions, state.baseline);
      expect(summary).toBe("");
    });
  });

  describe("formatEmotionBlock", () => {
    // Default options helper — agent emotions on, user emotions off
    const defaultOpts = {
      maxUserEntries: 3,
      maxAgentEntries: 2,
      halfLifeHours: 12,
      trendWindowHours: 24,
      agentEmotions: true,
      userEmotions: false,
    };

    // -------------------------------------------------------------------
    // New format: <openfeelz> with agent/user subsections
    // -------------------------------------------------------------------

    it("agent-only mode (default): wraps in <openfeelz>, has <agent_emotional_state>, no <user_emotional_state>", () => {
      const state = buildEmptyState();
      state.basicEmotions.happiness = 0.35;
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
        userEmotions: false,
      });
      expect(block).toContain("<openfeelz>");
      expect(block).toContain("</openfeelz>");
      expect(block).toContain("<agent_emotional_state>");
      expect(block).toContain("</agent_emotional_state>");
      // Preamble mentions <user_emotional_state> as instruction text,
      // but the actual XML closing tag should not be present.
      expect(block).not.toContain("</user_emotional_state>");
      expect(block).not.toContain("<emotion_state>");
    });

    it("user-only mode: has <user_emotional_state>, no <agent_emotional_state> section", () => {
      const state = buildEmptyState();
      state.users["user1"] = {
        history: [makeStimulus({ sourceRole: "user" })],
        latest: makeStimulus({ sourceRole: "user" }),
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: false,
        userEmotions: true,
      });
      expect(block).toContain("<openfeelz>");
      expect(block).toContain("<user_emotional_state>");
      expect(block).toContain("</user_emotional_state>");
      // The preamble text mentions <agent_emotional_state> as instruction,
      // but the actual XML section/closing tag should not be present.
      expect(block).not.toContain("</agent_emotional_state>");
    });

    it("both enabled: both sections present", () => {
      const state = buildEmptyState();
      state.basicEmotions.happiness = 0.35;
      state.users["user1"] = {
        history: [makeStimulus({ sourceRole: "user" })],
        latest: makeStimulus({ sourceRole: "user" }),
      };
      state.agents["agent1"] = {
        history: [makeStimulus({ sourceRole: "assistant", label: "focused" })],
        latest: makeStimulus({ sourceRole: "assistant", label: "focused" }),
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
        userEmotions: true,
      });
      expect(block).toContain("<agent_emotional_state>");
      expect(block).toContain("<user_emotional_state>");
    });

    it("both disabled: returns empty string", () => {
      const state = buildEmptyState();
      state.basicEmotions.happiness = 0.35;
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: false,
        userEmotions: false,
      });
      expect(block).toBe("");
    });

    it("preamble text present when block is non-empty", () => {
      const state = buildEmptyState();
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
      });
      expect(block).toContain("Do not confuse them");
    });

    it("ownership comments present: YOUR (the AI agent's) and HUMAN USER", () => {
      const state = buildEmptyState();
      state.users["user1"] = {
        history: [makeStimulus({ sourceRole: "user" })],
        latest: makeStimulus({ sourceRole: "user" }),
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
        userEmotions: true,
      });
      expect(block).toContain("YOUR (the AI agent's)");
      expect(block).toContain("HUMAN USER");
    });

    it("no old <emotion_state> tags", () => {
      const state = buildEmptyState();
      state.basicEmotions.happiness = 0.35;
      state.users["user1"] = {
        history: [makeStimulus({ sourceRole: "user" })],
        latest: makeStimulus({ sourceRole: "user" }),
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
        userEmotions: true,
      });
      expect(block).not.toContain("<emotion_state>");
      expect(block).not.toContain("</emotion_state>");
    });

    // -------------------------------------------------------------------
    // Agent section contents
    // -------------------------------------------------------------------

    it("includes personality in agent section", () => {
      const state = buildEmptyState();
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
      });
      expect(block).toContain("<personality>");
      expect(block).toContain("openness:");
      expect(block).toContain("</personality>");
    });

    it("includes basic_emotions when any above threshold", () => {
      const state = buildEmptyState();
      state.basicEmotions.happiness = 0.45;
      state.basicEmotions.anger = 0.12;
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
      });
      expect(block).toContain("<basic_emotions>");
      expect(block).toContain("happiness: 0.45");
      expect(block).toContain("anger: 0.12");
      expect(block).toContain("</basic_emotions>");
    });

    it("omits basic_emotions when all below threshold", () => {
      const state = buildEmptyState();
      state.basicEmotions.happiness = 0.01;
      state.basicEmotions.sadness = 0.005;
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
      });
      expect(block).not.toContain("<basic_emotions>");
    });

    it("dimensions section shows baseline values for deviations", () => {
      const state = buildEmptyState();
      state.dimensions.pleasure = 0.6;
      state.baseline.pleasure = 0.05;
      state.dimensions.curiosity = 0.8;
      state.baseline.curiosity = 0.5;
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
      });
      expect(block).toContain("<dimensions>");
      expect(block).toContain("pleasure:");
      expect(block).toContain("elevated");
      expect(block).toContain("baseline: 0.05");
      expect(block).toContain("baseline: 0.50");
      expect(block).toContain("</dimensions>");
    });

    it("includes agent recent emotions in <your_recent_emotions>", () => {
      const state = buildEmptyState();
      state.agents["agent1"] = {
        history: [makeStimulus({ sourceRole: "assistant", label: "focused" })],
        latest: makeStimulus({ sourceRole: "assistant", label: "focused" }),
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
      });
      expect(block).toContain("<your_recent_emotions>");
      expect(block).toContain("focused");
      expect(block).toContain("</your_recent_emotions>");
    });

    // -------------------------------------------------------------------
    // User section contents
    // -------------------------------------------------------------------

    it("includes user recent emotions in <recent_emotions>", () => {
      const state = buildEmptyState();
      state.users["user1"] = {
        history: [makeStimulus({ sourceRole: "user" })],
        latest: makeStimulus({ sourceRole: "user" }),
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: false,
        userEmotions: true,
      });
      expect(block).toContain("<recent_emotions>");
      expect(block).toContain("happy");
      expect(block).toContain("</recent_emotions>");
    });

    it("includes trend in user section", () => {
      const now = new Date();
      const state = buildEmptyState();
      state.users["user1"] = {
        history: [
          makeStimulus({
            sourceRole: "user",
            label: "frustrated",
            intensity: 0.7,
            timestamp: now.toISOString(),
          }),
          makeStimulus({
            id: "test-2",
            sourceRole: "user",
            label: "frustrated",
            intensity: 0.6,
            timestamp: new Date(now.getTime() - 3600000).toISOString(),
          }),
        ],
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: false,
        userEmotions: true,
      });
      expect(block).toContain("<trend>");
      expect(block).toContain("mostly frustrated");
      expect(block).toContain("</trend>");
    });

    it("user emotions enabled but no user data returns empty string", () => {
      const state = buildEmptyState();
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: false,
        userEmotions: true,
      });
      expect(block).toBe("");
    });

    // -------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------

    it("limits entries to maxUserEntries / maxAgentEntries", () => {
      const state = buildEmptyState();
      state.users["user1"] = {
        history: Array.from({ length: 10 }, (_, i) =>
          makeStimulus({ id: `s${i}`, timestamp: new Date(2026, 1, 6, i).toISOString() }),
        ),
      };
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: false,
        userEmotions: true,
        maxUserEntries: 2,
      });
      const matches = block.match(/Felt /g);
      expect(matches).toBeDefined();
      expect(matches!.length).toBeLessThanOrEqual(2);
    });

    it("returns empty string when agentEmotions enabled but nothing to show (no personality is always shown)", () => {
      // With agentEmotions on, personality is always present, so it should NOT be empty
      const state = buildEmptyState();
      const block = formatEmotionBlock(state, "user1", "agent1", {
        ...defaultOpts,
        agentEmotions: true,
        userEmotions: false,
      });
      expect(block).not.toBe("");
      expect(block).toContain("<personality>");
    });
  });
});
