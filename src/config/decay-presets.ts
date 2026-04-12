/**
 * Decay presets: AI-fast (~1h half-life) vs human-like (personality-derived).
 * Used when config.decayPreset is "fast" or "slow"; "turn" uses state rates + overrides.
 */

import type {
  DecayRates,
  EmotionDecayRates,
  EmotionEngineConfig,
  EmotionEngineState,
} from "../types.js";
import { DIMENSION_NAMES, BASIC_EMOTION_NAMES } from "../types.js";

/** Half-life of 1 hour => rate = ln(2) ≈ 0.693 per hour. */
const ONE_HOUR_RATE = Math.log(2);

/** Turn-based decay: half-life of 5 conversation turns. */
export const TURN_HALF_LIFE = 5;
export const DEFAULT_TURN_RATE = Math.LN2 / TURN_HALF_LIFE;

/** Preset identifier for decay speed. */
export type DecayPresetId = "fast" | "slow" | "turn";

/** Dimension decay rates for "fast" preset (~1h half-life for all dimensions). */
export const DECAY_PRESET_FAST_DIMENSIONS: DecayRates = Object.fromEntries(
  DIMENSION_NAMES.map((name) => [name, ONE_HOUR_RATE]),
) as DecayRates;

/** Basic emotion decay rates for "fast" preset (~1h half-life). */
export const DECAY_PRESET_FAST_EMOTIONS: EmotionDecayRates = Object.fromEntries(
  BASIC_EMOTION_NAMES.map((name) => [name, ONE_HOUR_RATE]),
) as EmotionDecayRates;

/**
 * Compute effective decay rates from state, config preset, and overrides.
 * - "fast": use fixed ~1h half-life rates.
 * - "slow": use personality-derived rates from state, merged with config overrides.
 * - "turn": use DEFAULT_TURN_RATE with personality modulation (per-turn units).
 */
export function getEffectiveDecayRates(
  state: EmotionEngineState,
  config: EmotionEngineConfig,
): { dimensionRates: DecayRates; emotionDecayRates: EmotionDecayRates } {
  const preset = config.decayPreset ?? "slow";

  if (preset === "fast") {
    return {
      dimensionRates: { ...DECAY_PRESET_FAST_DIMENSIONS },
      emotionDecayRates: { ...DECAY_PRESET_FAST_EMOTIONS },
    };
  }

  if (preset === "turn") {
    // Start from DEFAULT_TURN_RATE for all, then apply personality modulation
    // via the same ratio that personality applies to time-based rates.
    const dimensionRates = Object.fromEntries(
      DIMENSION_NAMES.map((name) => {
        // Personality multiplier: ratio of personality-derived rate to itself at neutral
        // We use state.decayRates which already has personality modulation baked in.
        // Scale DEFAULT_TURN_RATE by the ratio of state rate to average state rate.
        const personalityMultiplier = state.decayRates[name] > 0
          ? state.decayRates[name] / averageRate(state.decayRates, DIMENSION_NAMES)
          : 1;
        return [name, DEFAULT_TURN_RATE * personalityMultiplier];
      }),
    ) as DecayRates;

    const emotionDecayRates = Object.fromEntries(
      BASIC_EMOTION_NAMES.map((name) => {
        const personalityMultiplier = state.emotionDecayRates[name] > 0
          ? state.emotionDecayRates[name] / averageRate(state.emotionDecayRates, BASIC_EMOTION_NAMES)
          : 1;
        return [name, DEFAULT_TURN_RATE * personalityMultiplier];
      }),
    ) as EmotionDecayRates;

    // Apply overrides
    const overrides = config.decayRateOverrides ?? {};
    for (const name of DIMENSION_NAMES) {
      if (overrides[name] != null) {
        dimensionRates[name] = overrides[name];
      }
    }

    return { dimensionRates, emotionDecayRates };
  }

  // slow: start from state (personality-derived), apply overrides
  const dimensionRates: DecayRates = { ...state.decayRates };
  const overrides = config.decayRateOverrides ?? {};
  for (const name of DIMENSION_NAMES) {
    if (overrides[name] != null) {
      dimensionRates[name] = overrides[name];
    }
  }

  return {
    dimensionRates,
    emotionDecayRates: { ...state.emotionDecayRates },
  };
}

/** Compute average rate across a set of named rates. */
function averageRate<K extends string>(
  rates: Record<K, number>,
  names: readonly K[],
): number {
  const sum = names.reduce((acc, name) => acc + rates[name], 0);
  return sum / names.length || 1;
}
