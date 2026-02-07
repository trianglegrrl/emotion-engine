/**
 * Simplified rumination engine.
 *
 * When an emotion exceeds a threshold, it enters "rumination" --
 * a multi-stage process where the emotion continues to influence state
 * over subsequent interactions, with diminishing intensity.
 *
 * Ported from ros_emotion/rumination_engine.py, simplified for
 * non-realtime (event-driven) processing.
 */

import type {
  BasicEmotions,
  DimensionalState,
  EmotionStimulus,
  RuminationEntry,
  RuminationState,
} from "../types.js";
import { applyEmotionMapping } from "./mapping.js";

/** Minimum intensity to keep a rumination entry alive. */
const MIN_INTENSITY = 0.05;

/** Scale factor for rumination effects (weaker than direct stimuli). */
const RUMINATION_EFFECT_SCALE = 0.3;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an empty rumination state. */
export function createEmptyRuminationState(): RuminationState {
  return { active: [] };
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/**
 * Determine whether a new stimulus should trigger rumination.
 *
 * @param intensity - The stimulus intensity
 * @param threshold - The intensity threshold to trigger rumination
 * @param probability - Personality-influenced probability (0-1)
 * @returns true if rumination should start
 */
export function shouldStartRumination(
  intensity: number,
  threshold: number,
  probability: number,
): boolean {
  if (probability <= 0) return false;
  if (intensity <= threshold) return false;
  // Deterministic for probability >= 1, otherwise probabilistic
  // For TDD predictability, we use a deterministic check:
  // probability of 1 always triggers, probability < 1 requires intensity > threshold + (1-p)*0.3
  if (probability >= 1) return true;
  // Scale: higher probability means lower additional threshold needed
  const adjustedThreshold = threshold + (1 - probability) * 0.3;
  return intensity > adjustedThreshold;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start ruminating on a stimulus. Adds it to the active list.
 * Does not add duplicates (by stimulus ID).
 * Returns a new state; does not mutate input.
 */
export function startRumination(
  state: RuminationState,
  stimulus: EmotionStimulus,
): RuminationState {
  // Don't add duplicates
  if (state.active.some((e) => e.stimulusId === stimulus.id)) {
    return state;
  }

  const entry: RuminationEntry = {
    stimulusId: stimulus.id,
    label: stimulus.label,
    stage: 0,
    intensity: stimulus.intensity,
    lastStageTimestamp: new Date().toISOString(),
  };

  return {
    active: [...state.active, entry],
  };
}

/**
 * Advance all active ruminations by one stage.
 * Removes entries that exceed maxStages or drop below MIN_INTENSITY.
 * Returns a new state; does not mutate input.
 *
 * @param state - Current rumination state
 * @param maxStages - Maximum number of stages before expiry
 * @param decayFactor - Intensity multiplier per stage (e.g., 0.8)
 */
export function advanceRumination(
  state: RuminationState,
  maxStages: number,
  decayFactor: number,
): RuminationState {
  const now = new Date().toISOString();
  const active: RuminationEntry[] = [];

  for (const entry of state.active) {
    const nextStage = entry.stage + 1;
    const nextIntensity = entry.intensity * decayFactor;

    if (nextStage >= maxStages || nextIntensity < MIN_INTENSITY) {
      // Entry expired
      continue;
    }

    active.push({
      ...entry,
      stage: nextStage,
      intensity: nextIntensity,
      lastStageTimestamp: now,
    });
  }

  return { active };
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/**
 * Apply the emotional effects of all active ruminations to current state.
 * Effects are scaled by each entry's intensity and the global rumination scale.
 * Returns new objects; does not mutate inputs.
 */
export function applyRuminationEffects(
  rumination: RuminationState,
  dimensions: DimensionalState,
  emotions: BasicEmotions,
): { dimensions: DimensionalState; emotions: BasicEmotions } {
  let dims = { ...dimensions };
  let emos = { ...emotions };

  for (const entry of rumination.active) {
    const effectIntensity = entry.intensity * RUMINATION_EFFECT_SCALE;
    const result = applyEmotionMapping(dims, emos, entry.label, effectIntensity);
    dims = result.dimensions;
    emos = result.emotions;
  }

  return { dimensions: dims, emotions: emos };
}
