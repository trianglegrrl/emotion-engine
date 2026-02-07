/**
 * Core emotion model: dimensional state + basic emotions.
 *
 * Provides factory functions, clamping, primary emotion detection,
 * intensity calculation, and delta application.
 */

import type {
  BasicEmotionName,
  BasicEmotions,
  DimensionName,
  DimensionalState,
} from "../types.js";
import {
  BASIC_EMOTION_NAMES,
  BIPOLAR_DIMENSIONS,
  DIMENSION_NAMES,
} from "../types.js";

/** Threshold below which we consider an emotion "neutral". */
const PRIMARY_EMOTION_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/** Create a neutral dimensional state (PAD at 0, extensions at 0.5). */
export function createDefaultDimensionalState(): DimensionalState {
  return {
    pleasure: 0,
    arousal: 0,
    dominance: 0,
    connection: 0.5,
    curiosity: 0.5,
    energy: 0.5,
    trust: 0.5,
  };
}

/** Create a zeroed-out basic emotions object. */
export function createDefaultBasicEmotions(): BasicEmotions {
  return {
    happiness: 0,
    sadness: 0,
    anger: 0,
    fear: 0,
    disgust: 0,
    surprise: 0,
  };
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

/** Clamp a single dimension value to its valid range. */
export function clampDimension(name: DimensionName, value: number): number {
  if ((BIPOLAR_DIMENSIONS as readonly string[]).includes(name)) {
    return Math.max(-1, Math.min(1, value));
  }
  return Math.max(0, Math.min(1, value));
}

/** Clamp a single emotion value to [0, 1]. */
export function clampEmotion(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Clamp all dimensions to their valid ranges. Returns a new object. */
export function clampDimensionalState(state: DimensionalState): DimensionalState {
  const result = { ...state };
  for (const name of DIMENSION_NAMES) {
    result[name] = clampDimension(name, result[name]);
  }
  return result;
}

/** Clamp all basic emotions to [0, 1]. Returns a new object. */
export function clampBasicEmotions(emotions: BasicEmotions): BasicEmotions {
  const result = { ...emotions };
  for (const name of BASIC_EMOTION_NAMES) {
    result[name] = clampEmotion(result[name]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Primary Emotion Detection
// ---------------------------------------------------------------------------

/**
 * Determine the primary (dominant) emotion.
 * Returns "neutral" if all emotions are below threshold.
 * Ties are broken alphabetically for determinism.
 */
export function computePrimaryEmotion(emotions: BasicEmotions): BasicEmotionName | "neutral" {
  let maxName: BasicEmotionName | "neutral" = "neutral";
  let maxValue = PRIMARY_EMOTION_THRESHOLD;

  for (const name of BASIC_EMOTION_NAMES) {
    const value = emotions[name];
    if (value > maxValue || (value === maxValue && maxName !== "neutral" && name < maxName)) {
      maxValue = value;
      maxName = name;
    }
  }

  return maxName;
}

// ---------------------------------------------------------------------------
// Overall Intensity
// ---------------------------------------------------------------------------

/**
 * Compute overall emotional intensity as the RMS of all basic emotions.
 * Returns a value in [0, 1].
 */
export function computeOverallIntensity(emotions: BasicEmotions): number {
  let sumSq = 0;
  for (const name of BASIC_EMOTION_NAMES) {
    sumSq += emotions[name] * emotions[name];
  }
  const rms = Math.sqrt(sumSq / BASIC_EMOTION_NAMES.length);
  return Math.min(1, rms);
}

// ---------------------------------------------------------------------------
// Delta Application
// ---------------------------------------------------------------------------

/**
 * Apply a delta to a single dimension, returning a new state.
 * The original state is not mutated.
 */
export function applyDimensionDelta(
  state: DimensionalState,
  dimension: DimensionName,
  delta: number,
): DimensionalState {
  const result = { ...state };
  result[dimension] = clampDimension(dimension, result[dimension] + delta);
  return result;
}

/**
 * Apply a delta to a single basic emotion, returning a new object.
 * The original is not mutated.
 */
export function applyEmotionDelta(
  emotions: BasicEmotions,
  emotion: BasicEmotionName,
  delta: number,
): BasicEmotions {
  const result = { ...emotions };
  result[emotion] = clampEmotion(result[emotion] + delta);
  return result;
}
