import { describe, it, expect } from "vitest";
import {
  createDefaultDimensionalState,
  createDefaultBasicEmotions,
  clampDimension,
  clampEmotion,
  clampDimensionalState,
  clampBasicEmotions,
  computePrimaryEmotion,
  computeOverallIntensity,
  applyDimensionDelta,
  applyEmotionDelta,
} from "./emotion-model.js";

describe("emotion-model", () => {
  // -----------------------------------------------------------------------
  // Factory functions
  // -----------------------------------------------------------------------

  describe("createDefaultDimensionalState", () => {
    it("returns all dimensions at neutral values", () => {
      const state = createDefaultDimensionalState();
      expect(state.pleasure).toBe(0);
      expect(state.arousal).toBe(0);
      expect(state.dominance).toBe(0);
      expect(state.connection).toBe(0.5);
      expect(state.curiosity).toBe(0.5);
      expect(state.energy).toBe(0.5);
      expect(state.trust).toBe(0.5);
    });
  });

  describe("createDefaultBasicEmotions", () => {
    it("returns all emotions at zero", () => {
      const emotions = createDefaultBasicEmotions();
      expect(emotions.happiness).toBe(0);
      expect(emotions.sadness).toBe(0);
      expect(emotions.anger).toBe(0);
      expect(emotions.fear).toBe(0);
      expect(emotions.disgust).toBe(0);
      expect(emotions.surprise).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Clamping
  // -----------------------------------------------------------------------

  describe("clampDimension", () => {
    it("clamps bipolar dimensions to [-1, 1]", () => {
      expect(clampDimension("pleasure", 1.5)).toBe(1);
      expect(clampDimension("pleasure", -1.5)).toBe(-1);
      expect(clampDimension("arousal", 0.5)).toBe(0.5);
      expect(clampDimension("dominance", -0.3)).toBe(-0.3);
    });

    it("clamps unipolar dimensions to [0, 1]", () => {
      expect(clampDimension("connection", 1.5)).toBe(1);
      expect(clampDimension("connection", -0.5)).toBe(0);
      expect(clampDimension("curiosity", 0.7)).toBe(0.7);
      expect(clampDimension("energy", 0)).toBe(0);
      expect(clampDimension("trust", 1)).toBe(1);
    });
  });

  describe("clampEmotion", () => {
    it("clamps to [0, 1]", () => {
      expect(clampEmotion(1.5)).toBe(1);
      expect(clampEmotion(-0.5)).toBe(0);
      expect(clampEmotion(0.7)).toBe(0.7);
    });
  });

  describe("clampDimensionalState", () => {
    it("clamps all dimensions to their valid ranges", () => {
      const state = {
        pleasure: 2,
        arousal: -2,
        dominance: 0.5,
        connection: -0.1,
        curiosity: 1.1,
        energy: 0.5,
        trust: 0.8,
      };
      const clamped = clampDimensionalState(state);
      expect(clamped.pleasure).toBe(1);
      expect(clamped.arousal).toBe(-1);
      expect(clamped.dominance).toBe(0.5);
      expect(clamped.connection).toBe(0);
      expect(clamped.curiosity).toBe(1);
      expect(clamped.energy).toBe(0.5);
      expect(clamped.trust).toBe(0.8);
    });
  });

  describe("clampBasicEmotions", () => {
    it("clamps all emotions to [0, 1]", () => {
      const emotions = {
        happiness: 1.5,
        sadness: -0.5,
        anger: 0.3,
        fear: 0,
        disgust: 1,
        surprise: 2,
      };
      const clamped = clampBasicEmotions(emotions);
      expect(clamped.happiness).toBe(1);
      expect(clamped.sadness).toBe(0);
      expect(clamped.anger).toBe(0.3);
      expect(clamped.fear).toBe(0);
      expect(clamped.disgust).toBe(1);
      expect(clamped.surprise).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Primary Emotion Detection
  // -----------------------------------------------------------------------

  describe("computePrimaryEmotion", () => {
    it("returns the emotion with the highest value", () => {
      const emotions = {
        happiness: 0.2,
        sadness: 0.1,
        anger: 0.8,
        fear: 0.3,
        disgust: 0.0,
        surprise: 0.1,
      };
      expect(computePrimaryEmotion(emotions)).toBe("anger");
    });

    it("returns 'neutral' when all emotions are zero", () => {
      const emotions = createDefaultBasicEmotions();
      expect(computePrimaryEmotion(emotions)).toBe("neutral");
    });

    it("returns 'neutral' when max emotion is below threshold", () => {
      const emotions = {
        happiness: 0.04,
        sadness: 0.03,
        anger: 0.02,
        fear: 0.01,
        disgust: 0.0,
        surprise: 0.0,
      };
      expect(computePrimaryEmotion(emotions)).toBe("neutral");
    });

    it("picks the first alphabetically when there is a tie", () => {
      const emotions = {
        happiness: 0.5,
        sadness: 0.5,
        anger: 0.0,
        fear: 0.0,
        disgust: 0.0,
        surprise: 0.0,
      };
      // Both at 0.5 -- alphabetical: happiness before sadness
      expect(computePrimaryEmotion(emotions)).toBe("happiness");
    });
  });

  // -----------------------------------------------------------------------
  // Overall Intensity
  // -----------------------------------------------------------------------

  describe("computeOverallIntensity", () => {
    it("returns 0 when all emotions are zero", () => {
      const emotions = createDefaultBasicEmotions();
      expect(computeOverallIntensity(emotions)).toBe(0);
    });

    it("returns the RMS of all emotion values", () => {
      const emotions = {
        happiness: 0.6,
        sadness: 0.0,
        anger: 0.0,
        fear: 0.0,
        disgust: 0.0,
        surprise: 0.8,
      };
      // RMS = sqrt((0.36 + 0 + 0 + 0 + 0 + 0.64) / 6) = sqrt(1/6) ≈ 0.4082
      const intensity = computeOverallIntensity(emotions);
      expect(intensity).toBeCloseTo(0.4082, 3);
    });

    it("is clamped to [0, 1]", () => {
      const emotions = {
        happiness: 1,
        sadness: 1,
        anger: 1,
        fear: 1,
        disgust: 1,
        surprise: 1,
      };
      expect(computeOverallIntensity(emotions)).toBeLessThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Delta Application
  // -----------------------------------------------------------------------

  describe("applyDimensionDelta", () => {
    it("adds delta and clamps result", () => {
      const state = createDefaultDimensionalState();
      const updated = applyDimensionDelta(state, "pleasure", 0.3);
      expect(updated.pleasure).toBe(0.3);
      // Other dimensions unchanged
      expect(updated.arousal).toBe(0);
      expect(updated.connection).toBe(0.5);
    });

    it("clamps to upper bound", () => {
      const state = createDefaultDimensionalState();
      const updated = applyDimensionDelta(state, "trust", 0.8);
      expect(updated.trust).toBe(1); // 0.5 + 0.8 = 1.3, clamped to 1
    });

    it("clamps bipolar to lower bound", () => {
      const state = createDefaultDimensionalState();
      const updated = applyDimensionDelta(state, "pleasure", -1.5);
      expect(updated.pleasure).toBe(-1);
    });

    it("clamps unipolar to zero", () => {
      const state = createDefaultDimensionalState();
      const updated = applyDimensionDelta(state, "energy", -0.8);
      expect(updated.energy).toBe(0); // 0.5 - 0.8 = -0.3, clamped to 0
    });

    it("does not mutate original state", () => {
      const state = createDefaultDimensionalState();
      applyDimensionDelta(state, "pleasure", 0.5);
      expect(state.pleasure).toBe(0); // original unchanged
    });
  });

  describe("applyEmotionDelta", () => {
    it("adds delta and clamps result", () => {
      const emotions = createDefaultBasicEmotions();
      const updated = applyEmotionDelta(emotions, "happiness", 0.7);
      expect(updated.happiness).toBe(0.7);
      expect(updated.sadness).toBe(0); // unchanged
    });

    it("clamps to [0, 1]", () => {
      const emotions = createDefaultBasicEmotions();
      const updated = applyEmotionDelta(emotions, "anger", 1.5);
      expect(updated.anger).toBe(1);
    });

    it("does not mutate original", () => {
      const emotions = createDefaultBasicEmotions();
      applyEmotionDelta(emotions, "happiness", 0.5);
      expect(emotions.happiness).toBe(0);
    });
  });
});
