/**
 * Tests for state-helper action functions.
 *
 * Tests the core logic (not the CLI argv parsing) by calling action
 * functions directly with a real StateManager backed by temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EmotionEngineState } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { StateManager } from "../state/state-manager.js";
import { buildEmptyState, writeStateFile } from "../state/state-file.js";
import {
  queryState,
  resetState,
  setPersonalityTrait,
  getPersonality,
  setDecayPreset,
  applyStimulusAction,
  historyAction,
  parseArgs,
  type SuccessResult,
  type ErrorResult,
} from "./state-helper.js";

function isSuccess<T>(result: SuccessResult<T> | ErrorResult): result is SuccessResult<T> {
  return result.ok === true;
}

function isError(result: SuccessResult<unknown> | ErrorResult): result is ErrorResult {
  return result.ok === false;
}

describe("state-helper", () => {
  let tmpDir: string;
  let statePath: string;
  let manager: StateManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openfeelz-test-"));
    statePath = path.join(tmpDir, "state.json");
    manager = new StateManager(statePath, { ...DEFAULT_CONFIG });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // parseArgs
  // -------------------------------------------------------------------------

  describe("parseArgs", () => {
    it("parses action with no flags", () => {
      const result = parseArgs(["node", "state-helper.js", "query"]);
      expect(result.action).toBe("query");
      expect(result.flags).toEqual({});
    });

    it("parses action with flags", () => {
      const result = parseArgs([
        "node",
        "state-helper.js",
        "set-personality",
        "--trait",
        "openness",
        "--value",
        "0.8",
      ]);
      expect(result.action).toBe("set-personality");
      expect(result.flags.trait).toBe("openness");
      expect(result.flags.value).toBe("0.8");
    });

    it("returns empty action for missing args", () => {
      const result = parseArgs(["node", "state-helper.js"]);
      expect(result.action).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // query
  // -------------------------------------------------------------------------

  describe("queryState", () => {
    it("returns full state with default format", async () => {
      const result = await queryState(manager, {});
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data).toHaveProperty("dimensions");
      expect(result.data).toHaveProperty("basicEmotions");
      expect(result.data).toHaveProperty("personality");
      expect(result.data).toHaveProperty("primaryEmotion");
      expect(result.data).toHaveProperty("overallIntensity");
      expect(result.data).toHaveProperty("recentStimuli");
      expect(result.data).toHaveProperty("rumination");
    });

    it("returns full format explicitly", async () => {
      const result = await queryState(manager, { format: "full" });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data).toHaveProperty("dimensions");
      expect(result.data).toHaveProperty("personality");
    });

    it("returns summary format", async () => {
      const result = await queryState(manager, { format: "summary" });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data).toHaveProperty("primaryEmotion");
      expect(result.data).toHaveProperty("overallIntensity");
      expect(result.data).not.toHaveProperty("rumination");
    });

    it("returns dimensions format", async () => {
      const result = await queryState(manager, { format: "dimensions" });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data).toHaveProperty("pleasure");
      expect(result.data).not.toHaveProperty("basicEmotions");
    });

    it("returns emotions format", async () => {
      const result = await queryState(manager, { format: "emotions" });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data).toHaveProperty("happiness");
      expect(result.data).not.toHaveProperty("dimensions");
    });

    it("rejects invalid format", async () => {
      const result = await queryState(manager, { format: "invalid" });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("INVALID_FORMAT");
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe("resetState", () => {
    it("resets all dimensions to baseline", async () => {
      // First apply a stimulus to change state
      const state = await manager.getState();
      const modified = manager.applyStimulus(state, "happy", 0.9, "test");
      await manager.saveState(modified);

      const result = await resetState(manager, {});
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.message).toContain("reset");
    });

    it("resets specific dimensions", async () => {
      const result = await resetState(manager, { dimensions: "pleasure,arousal" });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.dimensionsReset).toEqual(["pleasure", "arousal"]);
    });

    it("rejects invalid dimension names", async () => {
      const result = await resetState(manager, { dimensions: "invalid_dim" });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("INVALID_DIMENSION");
    });
  });

  // -------------------------------------------------------------------------
  // set-personality
  // -------------------------------------------------------------------------

  describe("setPersonalityTrait", () => {
    it("sets a valid personality trait", async () => {
      const result = await setPersonalityTrait(manager, {
        trait: "openness",
        value: "0.8",
      });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.personality.openness).toBe(0.8);
    });

    it("clamps value to [0, 1]", async () => {
      const result = await setPersonalityTrait(manager, {
        trait: "openness",
        value: "1.5",
      });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.personality.openness).toBe(1);
    });

    it("rejects invalid trait name", async () => {
      const result = await setPersonalityTrait(manager, {
        trait: "invalid",
        value: "0.5",
      });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("INVALID_TRAIT");
    });

    it("rejects missing trait", async () => {
      const result = await setPersonalityTrait(manager, { value: "0.5" });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("MISSING_PARAM");
    });

    it("rejects missing value", async () => {
      const result = await setPersonalityTrait(manager, { trait: "openness" });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("MISSING_PARAM");
    });

    it("rejects non-numeric value", async () => {
      const result = await setPersonalityTrait(manager, {
        trait: "openness",
        value: "abc",
      });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("INVALID_VALUE");
    });
  });

  // -------------------------------------------------------------------------
  // get-personality
  // -------------------------------------------------------------------------

  describe("getPersonality", () => {
    it("returns current personality", async () => {
      const result = await getPersonality(manager);
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data).toHaveProperty("openness");
      expect(result.data).toHaveProperty("conscientiousness");
      expect(result.data).toHaveProperty("extraversion");
      expect(result.data).toHaveProperty("agreeableness");
      expect(result.data).toHaveProperty("neuroticism");
    });
  });

  // -------------------------------------------------------------------------
  // set-decay
  // -------------------------------------------------------------------------

  describe("setDecayPreset", () => {
    it("accepts valid presets", () => {
      for (const preset of ["slow", "fast", "turn"]) {
        const result = setDecayPreset({ preset });
        expect(isSuccess(result)).toBe(true);
      }
    });

    it("rejects invalid preset", () => {
      const result = setDecayPreset({ preset: "invalid" });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("INVALID_PRESET");
    });

    it("rejects missing preset", () => {
      const result = setDecayPreset({});
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("MISSING_PARAM");
    });
  });

  // -------------------------------------------------------------------------
  // apply-stimulus
  // -------------------------------------------------------------------------

  describe("applyStimulusAction", () => {
    it("applies a stimulus and returns updated state", async () => {
      const result = await applyStimulusAction(manager, {
        emotion: "happy",
        intensity: "0.7",
        trigger: "test reason",
      });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data).toHaveProperty("primaryEmotion");
      expect(result.data).toHaveProperty("overallIntensity");
      expect(result.data).toHaveProperty("stimulusApplied");
    });

    it("rejects missing emotion", async () => {
      const result = await applyStimulusAction(manager, {
        intensity: "0.7",
        trigger: "reason",
      });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("MISSING_PARAM");
    });

    it("rejects missing intensity", async () => {
      const result = await applyStimulusAction(manager, {
        emotion: "happy",
        trigger: "reason",
      });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("MISSING_PARAM");
    });

    it("rejects invalid intensity", async () => {
      const result = await applyStimulusAction(manager, {
        emotion: "happy",
        intensity: "abc",
        trigger: "reason",
      });
      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.code).toBe("INVALID_VALUE");
    });

    it("clamps intensity to [0, 1]", async () => {
      const result = await applyStimulusAction(manager, {
        emotion: "happy",
        intensity: "2.0",
        trigger: "reason",
      });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.stimulusApplied.intensity).toBeLessThanOrEqual(1);
    });

    it("defaults trigger to empty string", async () => {
      const result = await applyStimulusAction(manager, {
        emotion: "happy",
        intensity: "0.5",
      });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.stimulusApplied.trigger).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // history
  // -------------------------------------------------------------------------

  describe("historyAction", () => {
    it("returns empty history for fresh state", async () => {
      const result = await historyAction(manager, {});
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.stimuli).toEqual([]);
      expect(result.data.count).toBe(0);
    });

    it("returns stimuli after applying some", async () => {
      // Apply a few stimuli
      const state = await manager.getState();
      const s1 = manager.applyStimulus(state, "happy", 0.5, "first");
      const s2 = manager.applyStimulus(s1, "sad", 0.3, "second");
      await manager.saveState(s2);

      const result = await historyAction(manager, {});
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.count).toBe(2);
    });

    it("respects limit flag", async () => {
      const state = await manager.getState();
      let current = state;
      for (let i = 0; i < 5; i++) {
        current = manager.applyStimulus(current, "happy", 0.5, `stimulus-${i}`);
      }
      await manager.saveState(current);

      const result = await historyAction(manager, { limit: "2" });
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.stimuli.length).toBe(2);
      expect(result.data.count).toBe(2);
    });

    it("defaults limit to 20", async () => {
      const state = await manager.getState();
      let current = state;
      for (let i = 0; i < 25; i++) {
        current = manager.applyStimulus(current, "happy", 0.1, `s-${i}`);
      }
      await manager.saveState(current);

      const result = await historyAction(manager, {});
      expect(isSuccess(result)).toBe(true);
      if (!isSuccess(result)) return;
      expect(result.data.stimuli.length).toBe(20);
    });
  });
});
