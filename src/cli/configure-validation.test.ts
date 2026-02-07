/**
 * TDD: validation helpers for configure wizard.
 * Validated fixture data: numbers within schema bounds.
 */

import { describe, it, expect } from "vitest";
import {
  validateConfigNumber,
  validateOceanProfile,
  getConfigNumberBounds,
} from "./configure-validation.js";
import type { OCEANProfile } from "../types.js";

describe("configure-validation", () => {
  describe("getConfigNumberBounds", () => {
    it("returns min/max for halfLifeHours", () => {
      const b = getConfigNumberBounds("halfLifeHours");
      expect(b).toBeDefined();
      expect(b!.min).toBe(0.1);
      expect(b!.max).toBeUndefined();
    });

    it("returns 0-1 for confidenceMin", () => {
      const b = getConfigNumberBounds("confidenceMin");
      expect(b?.min).toBe(0);
      expect(b?.max).toBe(1);
    });

    it("returns 0-1 for ruminationThreshold", () => {
      const b = getConfigNumberBounds("ruminationThreshold");
      expect(b?.min).toBe(0);
      expect(b?.max).toBe(1);
    });

    it("returns undefined for unknown key", () => {
      expect(getConfigNumberBounds("unknownKey")).toBeUndefined();
    });
  });

  describe("validateConfigNumber", () => {
    it("accepts value within range", () => {
      expect(validateConfigNumber("halfLifeHours", 1)).toBeUndefined();
      expect(validateConfigNumber("confidenceMin", 0.5)).toBeUndefined();
      expect(validateConfigNumber("ruminationThreshold", 0.8)).toBeUndefined();
    });

    it("returns error when below minimum", () => {
      const err = validateConfigNumber("halfLifeHours", 0.05);
      expect(err).toBeDefined();
      expect(err).toContain("0.1");
    });

    it("returns error when above maximum", () => {
      const err = validateConfigNumber("confidenceMin", 1.5);
      expect(err).toBeDefined();
      expect(err).toContain("1");
    });

    it("returns error for unknown key", () => {
      const err = validateConfigNumber("unknownKey" as never, 1);
      expect(err).toBeDefined();
    });
  });

  describe("validateOceanProfile", () => {
    const validProfile: OCEANProfile = {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    };

    it("accepts valid profile (all 0-1)", () => {
      expect(validateOceanProfile(validProfile)).toBeUndefined();
      expect(validateOceanProfile({ ...validProfile, openness: 0, neuroticism: 1 })).toBeUndefined();
    });

    it("returns error when trait below 0", () => {
      const err = validateOceanProfile({ ...validProfile, openness: -0.1 });
      expect(err).toBeDefined();
      expect(err).toMatch(/openness|0/);
    });

    it("returns error when trait above 1", () => {
      const err = validateOceanProfile({ ...validProfile, agreeableness: 1.1 });
      expect(err).toBeDefined();
      expect(err).toMatch(/agreeableness|1/);
    });

    it("returns error when trait is not a number", () => {
      const bad = { ...validProfile, extraversion: "high" as unknown as number };
      const err = validateOceanProfile(bad);
      expect(err).toBeDefined();
    });
  });
});
