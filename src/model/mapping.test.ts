import { describe, it, expect } from "vitest";
import {
  getEmotionMapping,
  applyEmotionMapping,
  ALL_EMOTION_MAPPINGS,
} from "./mapping.js";
import { createDefaultDimensionalState, createDefaultBasicEmotions } from "./emotion-model.js";

describe("mapping", () => {
  // -----------------------------------------------------------------------
  // getEmotionMapping
  // -----------------------------------------------------------------------

  describe("getEmotionMapping", () => {
    it("returns a mapping for known emotions", () => {
      const mapping = getEmotionMapping("happy");
      expect(mapping).toBeDefined();
      expect(mapping!.dimensions.pleasure).toBeGreaterThan(0);
    });

    it("handles aliases (joy -> happiness mapping)", () => {
      const joy = getEmotionMapping("joy");
      const happy = getEmotionMapping("happy");
      expect(joy).toBeDefined();
      expect(happy).toBeDefined();
      // Both should increase pleasure
      expect(joy!.dimensions.pleasure).toBeGreaterThan(0);
      expect(happy!.dimensions.pleasure).toBeGreaterThan(0);
    });

    it("returns undefined for unknown emotions", () => {
      expect(getEmotionMapping("zzz_unknown_zzz")).toBeUndefined();
    });

    it("is case-insensitive", () => {
      expect(getEmotionMapping("ANGRY")).toBeDefined();
      expect(getEmotionMapping("Angry")).toBeDefined();
      expect(getEmotionMapping("angry")).toBeDefined();
    });

    it("maps anger to negative pleasure and positive arousal", () => {
      const mapping = getEmotionMapping("angry")!;
      expect(mapping.dimensions.pleasure).toBeLessThan(0);
      expect(mapping.dimensions.arousal).toBeGreaterThan(0);
      expect(mapping.emotions.anger).toBeGreaterThan(0);
    });

    it("maps sadness to negative pleasure and negative arousal", () => {
      const mapping = getEmotionMapping("sad")!;
      expect(mapping.dimensions.pleasure).toBeLessThan(0);
      expect(mapping.dimensions.arousal).toBeLessThan(0);
    });

    it("maps fear to negative pleasure and positive arousal", () => {
      const mapping = getEmotionMapping("fearful")!;
      expect(mapping.dimensions.pleasure).toBeLessThan(0);
      expect(mapping.dimensions.arousal).toBeGreaterThan(0);
      expect(mapping.emotions.fear).toBeGreaterThan(0);
    });

    it("maps curiosity to positive curiosity dimension", () => {
      const mapping = getEmotionMapping("curious")!;
      expect(mapping.dimensions.curiosity).toBeGreaterThan(0);
    });

    it("maps connected to positive connection dimension", () => {
      const mapping = getEmotionMapping("connected")!;
      expect(mapping.dimensions.connection).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // ALL_EMOTION_MAPPINGS
  // -----------------------------------------------------------------------

  describe("ALL_EMOTION_MAPPINGS", () => {
    it("has at least 15 emotion mappings", () => {
      expect(Object.keys(ALL_EMOTION_MAPPINGS).length).toBeGreaterThanOrEqual(15);
    });

    it("all non-neutral mappings have at least one dimension or emotion delta", () => {
      for (const [label, mapping] of Object.entries(ALL_EMOTION_MAPPINGS)) {
        if (label === "neutral") continue;
        const hasDim = Object.values(mapping.dimensions).some((v) => v !== 0);
        const hasEmo = Object.values(mapping.emotions).some((v) => v !== 0);
        expect(hasDim || hasEmo, `Mapping for "${label}" has no effects`).toBe(true);
      }
    });

    it("neutral mapping has no effects", () => {
      const mapping = ALL_EMOTION_MAPPINGS["neutral"];
      expect(Object.keys(mapping.dimensions)).toHaveLength(0);
      expect(Object.keys(mapping.emotions)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // applyEmotionMapping
  // -----------------------------------------------------------------------

  describe("applyEmotionMapping", () => {
    it("applies dimension and emotion deltas scaled by intensity", () => {
      const dims = createDefaultDimensionalState();
      const emos = createDefaultBasicEmotions();
      const { dimensions, emotions } = applyEmotionMapping(dims, emos, "happy", 1.0);

      expect(dimensions.pleasure).toBeGreaterThan(dims.pleasure);
      expect(emotions.happiness).toBeGreaterThan(emos.happiness);
    });

    it("scales deltas by intensity", () => {
      const dims = createDefaultDimensionalState();
      const emos = createDefaultBasicEmotions();

      const full = applyEmotionMapping(dims, emos, "happy", 1.0);
      const half = applyEmotionMapping(dims, emos, "happy", 0.5);

      // Half intensity should produce smaller changes
      expect(full.dimensions.pleasure - dims.pleasure).toBeGreaterThan(
        half.dimensions.pleasure - dims.pleasure,
      );
    });

    it("returns unchanged state for unknown emotion", () => {
      const dims = createDefaultDimensionalState();
      const emos = createDefaultBasicEmotions();
      const { dimensions, emotions } = applyEmotionMapping(dims, emos, "zzz_unknown", 1.0);

      expect(dimensions).toEqual(dims);
      expect(emotions).toEqual(emos);
    });

    it("clamps results to valid ranges", () => {
      const dims = { ...createDefaultDimensionalState(), pleasure: 0.9 };
      const emos = { ...createDefaultBasicEmotions(), happiness: 0.9 };
      const { dimensions, emotions } = applyEmotionMapping(dims, emos, "happy", 1.0);

      expect(dimensions.pleasure).toBeLessThanOrEqual(1);
      expect(emotions.happiness).toBeLessThanOrEqual(1);
    });

    it("does not mutate originals", () => {
      const dims = createDefaultDimensionalState();
      const emos = createDefaultBasicEmotions();
      applyEmotionMapping(dims, emos, "angry", 0.8);
      expect(dims.pleasure).toBe(0);
      expect(emos.anger).toBe(0);
    });
  });
});
