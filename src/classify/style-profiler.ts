/**
 * Style profiler: EMA-based blending of observed communication style
 * dimensions, staleness checking, and LLM-driven profiling via claude -p.
 */

import type {
  UserStyleProfile,
  UserStyleTracker,
  ClassificationUsage,
  EmotionStimulus,
} from "../types.js"
import { DEFAULT_STYLE_PROFILE } from "../types.js"
import type { StyleProfileConfig } from "../config/style-config.js"
import { callClaude } from "../utils/claude-cli.js"
import { buildProfilingPrompt } from "./style-profiler-prompt.js"

// ---------------------------------------------------------------------------
// Observed style (raw LLM output)
// ---------------------------------------------------------------------------

export interface ObservedStyle {
  hyperboleTendency: number
  casualProfanity: number
  emotionalExpressiveness: number
  sarcasmFrequency: number
}

/** The four blendable dimension keys. */
const STYLE_DIMENSIONS: ReadonlyArray<keyof ObservedStyle> = [
  'hyperboleTendency',
  'casualProfanity',
  'emotionalExpressiveness',
  'sarcasmFrequency',
] as const

// ---------------------------------------------------------------------------
// createDefaultTracker
// ---------------------------------------------------------------------------

/** Returns a fresh tracker with default profile values and zero message counter. */
export function createDefaultTracker(): UserStyleTracker {
  return {
    profile: { ...DEFAULT_STYLE_PROFILE, lastUpdated: new Date().toISOString() },
    messagesSinceLastProfile: 0,
  }
}

// ---------------------------------------------------------------------------
// checkStaleness
// ---------------------------------------------------------------------------

/**
 * If the profile is older than `stalenessThresholdDays` AND its sampleSize
 * exceeds `stalenessResetSampleSize`, cap sampleSize so that new observations
 * carry more weight. Returns a new profile object (no mutation).
 */
export function checkStaleness(
  profile: UserStyleProfile,
  config: StyleProfileConfig,
): UserStyleProfile {
  const ageMs = Date.now() - new Date(profile.lastUpdated).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  if (ageDays > config.stalenessThresholdDays && profile.sampleSize > config.stalenessResetSampleSize) {
    return { ...profile, sampleSize: config.stalenessResetSampleSize }
  }

  return profile
}

// ---------------------------------------------------------------------------
// blendProfile (EMA)
// ---------------------------------------------------------------------------

/**
 * Blend observed style values into the existing profile using an exponential
 * moving average. Dimensions listed in `userOverrides` are left unchanged.
 * Returns a new profile (immutable).
 */
export function blendProfile(
  existing: UserStyleProfile,
  observed: ObservedStyle,
  messageCount: number,
  config: StyleProfileConfig,
): UserStyleProfile {
  const weight = Math.min(
    config.emaMaxWeight,
    config.emaBaseWeight / (existing.sampleSize + config.emaBaseWeight),
  )

  const blended: Record<string, number> = {}

  for (const dim of STYLE_DIMENSIONS) {
    if (existing.userOverrides.includes(dim)) {
      blended[dim] = existing[dim]
    } else {
      blended[dim] = existing[dim] * (1 - weight) + observed[dim] * weight
    }
  }

  return {
    ...existing,
    hyperboleTendency: blended.hyperboleTendency,
    casualProfanity: blended.casualProfanity,
    emotionalExpressiveness: blended.emotionalExpressiveness,
    sarcasmFrequency: blended.sarcasmFrequency,
    sampleSize: existing.sampleSize + messageCount,
    lastUpdated: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// runProfiling
// ---------------------------------------------------------------------------

export interface ProfilingResult {
  profile: UserStyleProfile
  usage?: ClassificationUsage
}

/**
 * Full profiling pipeline:
 * 1. Build prompt from history + current profile
 * 2. Call claude -p to get observed style values
 * 3. Check staleness on current profile
 * 4. Blend observed values into (possibly refreshed) profile
 */
export async function runProfiling(
  history: EmotionStimulus[],
  currentProfile: UserStyleProfile,
  config: StyleProfileConfig,
  model?: string,
): Promise<ProfilingResult> {
  const prompt = buildProfilingPrompt(
    history.map((s) => ({
      label: s.label,
      intensity: s.intensity,
      trigger: s.trigger,
      sourceExcerpt: s.sourceExcerpt,
    })),
    currentProfile,
  )

  const { result, usage } = await callClaude(prompt, { model: model ?? 'haiku' })

  const observed = parseObservedStyle(result)
  const refreshed = checkStaleness(currentProfile, config)
  const blended = blendProfile(refreshed, observed, history.length, config)

  return { profile: blended, usage }
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/**
 * Parse raw LLM output into an ObservedStyle.
 * Handles optional markdown code fences.
 */
function parseObservedStyle(raw: string): ObservedStyle {
  let cleaned = raw.trim()
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  }

  const parsed = JSON.parse(cleaned)

  return {
    hyperboleTendency: Number(parsed.hyperboleTendency) || 0,
    casualProfanity: Number(parsed.casualProfanity) || 0,
    emotionalExpressiveness: Number(parsed.emotionalExpressiveness) || 0,
    sarcasmFrequency: Number(parsed.sarcasmFrequency) || 0,
  }
}
