/**
 * Validation helpers for the configure wizard.
 * Bounds aligned with openclaw.plugin.json configSchema.
 */

import type { OCEANProfile } from "../types.js";
import { OCEAN_TRAITS } from "../types.js";

export type ConfigNumberKey =
  | "confidenceMin"
  | "halfLifeHours"
  | "trendWindowHours"
  | "maxHistory"
  | "ruminationThreshold"
  | "ruminationMaxStages"
  | "decayServiceIntervalMinutes";

const BOUNDS: Record<ConfigNumberKey, { min?: number; max?: number }> = {
  confidenceMin: { min: 0, max: 1 },
  halfLifeHours: { min: 0.1 },
  trendWindowHours: { min: 1 },
  maxHistory: { min: 10 },
  ruminationThreshold: { min: 0, max: 1 },
  ruminationMaxStages: { min: 1, max: 10 },
  decayServiceIntervalMinutes: { min: 1 },
};

export function getConfigNumberBounds(
  key: ConfigNumberKey | string,
): { min?: number; max?: number } | undefined {
  return BOUNDS[key as ConfigNumberKey];
}

/**
 * Validate a numeric config value. Returns error message or undefined if valid.
 */
export function validateConfigNumber(
  key: ConfigNumberKey | string,
  value: number,
): string | undefined {
  const bounds = getConfigNumberBounds(key);
  if (!bounds) {
    return `Unknown config key: ${key}`;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    return `Value must be a number`;
  }
  if (bounds.min !== undefined && value < bounds.min) {
    return `Must be at least ${bounds.min}`;
  }
  if (bounds.max !== undefined && value > bounds.max) {
    return `Must be at most ${bounds.max}`;
  }
  return undefined;
}

/**
 * Validate OCEAN profile (each trait 0-1). Returns error message or undefined if valid.
 */
export function validateOceanProfile(profile: OCEANProfile): string | undefined {
  for (const trait of OCEAN_TRAITS) {
    const v = profile[trait];
    if (typeof v !== "number" || Number.isNaN(v)) {
      return `${trait} must be a number`;
    }
    if (v < 0 || v > 1) {
      return `${trait} must be between 0 and 1 (got ${v})`;
    }
  }
  return undefined;
}
