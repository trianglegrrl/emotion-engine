import { describe, it, expect } from "vitest";
import { DEFAULT_STYLE_CONFIG, type StyleProfileConfig } from "./style-config.js";

describe("StyleProfileConfig", () => {
  describe("DEFAULT_STYLE_CONFIG", () => {
    it("has profilingInterval of 10", () => {
      expect(DEFAULT_STYLE_CONFIG.profilingInterval).toBe(10);
    });

    it("has maxSampleSize of 100", () => {
      expect(DEFAULT_STYLE_CONFIG.maxSampleSize).toBe(100);
    });

    it("has stalenessThresholdDays of 30", () => {
      expect(DEFAULT_STYLE_CONFIG.stalenessThresholdDays).toBe(30);
    });

    it("has stalenessResetSampleSize of 30", () => {
      expect(DEFAULT_STYLE_CONFIG.stalenessResetSampleSize).toBe(30);
    });

    it("has profileMaturityThreshold of 10", () => {
      expect(DEFAULT_STYLE_CONFIG.profileMaturityThreshold).toBe(10);
    });

    it("has excerptTokenLimit of 200", () => {
      expect(DEFAULT_STYLE_CONFIG.excerptTokenLimit).toBe(200);
    });

    it("has emaBaseWeight of 5", () => {
      expect(DEFAULT_STYLE_CONFIG.emaBaseWeight).toBe(5);
    });

    it("has emaMaxWeight of 0.5", () => {
      expect(DEFAULT_STYLE_CONFIG.emaMaxWeight).toBe(0.5);
    });
  });

  describe("partial overrides via spread", () => {
    it("overrides only specified fields", () => {
      const custom: StyleProfileConfig = {
        ...DEFAULT_STYLE_CONFIG,
        profilingInterval: 5,
        maxSampleSize: 50,
      };
      expect(custom.profilingInterval).toBe(5);
      expect(custom.maxSampleSize).toBe(50);
      // unchanged fields retain defaults
      expect(custom.stalenessThresholdDays).toBe(30);
      expect(custom.stalenessResetSampleSize).toBe(30);
      expect(custom.profileMaturityThreshold).toBe(10);
      expect(custom.excerptTokenLimit).toBe(200);
      expect(custom.emaBaseWeight).toBe(5);
      expect(custom.emaMaxWeight).toBe(0.5);
    });

    it("can override a single field", () => {
      const custom: StyleProfileConfig = {
        ...DEFAULT_STYLE_CONFIG,
        emaMaxWeight: 0.8,
      };
      expect(custom.emaMaxWeight).toBe(0.8);
      expect(custom.profilingInterval).toBe(10);
    });
  });
});
