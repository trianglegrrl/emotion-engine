/**
 * Pre-defined OCEAN personality presets based on internationally known
 * historical figures. Diverse across time, region, and domain.
 * Research: Perplexity API (see docs/personality-presets-research.md).
 */

import type { EmotionEngineState, OCEANProfile } from "../types.js";
import {
  computeBaseline,
  computeDimensionDecayRates,
  computeEmotionDecayRates,
} from "../model/personality.js";

export interface PersonalityPreset {
  id: string;
  name: string;
  shortDescription: string;
  ocean: OCEANProfile;
  rationale: string;
}

function clampOcean(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampProfile(profile: OCEANProfile): OCEANProfile {
  return {
    openness: clampOcean(profile.openness),
    conscientiousness: clampOcean(profile.conscientiousness),
    extraversion: clampOcean(profile.extraversion),
    agreeableness: clampOcean(profile.agreeableness),
    neuroticism: clampOcean(profile.neuroticism),
  };
}

const PRESETS: readonly PersonalityPreset[] = [
  {
    id: "einstein",
    name: "Albert Einstein",
    shortDescription: "Theoretical physicist (Germany/US, 20th c.)",
    ocean: { openness: 0.95, conscientiousness: 0.9, extraversion: 0.4, agreeableness: 0.5, neuroticism: 0.3 },
    rationale: "Biographical analyses: extreme curiosity, persistence, introspective; low extraversion.",
  },
  {
    id: "marie-curie",
    name: "Marie Curie",
    shortDescription: "Physicist and chemist (Poland/France, 19th–20th c.)",
    ocean: { openness: 0.9, conscientiousness: 0.95, extraversion: 0.3, agreeableness: 0.6, neuroticism: 0.5 },
    rationale: "Perseverance, solitary focus; biographical synthesis (Nobel, PMC).",
  },
  {
    id: "mandela",
    name: "Nelson Mandela",
    shortDescription: "Anti-apartheid leader, President of South Africa (20th c.)",
    ocean: { openness: 0.9, conscientiousness: 0.9, extraversion: 0.85, agreeableness: 0.9, neuroticism: 0.1 },
    rationale: "Leadership analyses: forgiveness, charisma, consensus-building, emotional stability.",
  },
  {
    id: "wangari-maathai",
    name: "Wangari Maathai",
    shortDescription: "Environmentalist and Nobel Peace laureate (Kenya, 20th c.)",
    ocean: { openness: 0.9, conscientiousness: 0.9, extraversion: 0.7, agreeableness: 0.4, neuroticism: 0.3 },
    rationale: "Green Belt Movement founder; visionary, relentless, confrontational; resilient (Unbowed, USF, Washington History).",
  },
  {
    id: "frida-kahlo",
    name: "Frida Kahlo",
    shortDescription: "Painter (Mexico, 20th c.)",
    ocean: { openness: 0.9, conscientiousness: 0.58, extraversion: 0.5, agreeableness: 0.75, neuroticism: 0.8 },
    rationale: "Art and writings: high openness and neuroticism, moderate others (sarahransomeart, truity).",
  },
  {
    id: "confucius",
    name: "Confucius",
    shortDescription: "Philosopher and teacher (Ancient China)",
    ocean: { openness: 0.6, conscientiousness: 0.9, extraversion: 0.4, agreeableness: 0.9, neuroticism: 0.2 },
    rationale: "Teachings (li, ren); cerebralquotient, Simply Psychology.",
  },
  {
    id: "simon-bolivar",
    name: "Simón Bolívar",
    shortDescription: "Liberator and revolutionary (South America, 19th c.)",
    ocean: { openness: 0.9, conscientiousness: 0.85, extraversion: 0.8, agreeableness: 0.4, neuroticism: 0.7 },
    rationale: "Enlightenment reader, visionary; iron will, charismatic; prideful, mood swings (Britannica, EBSCO).",
  },
  {
    id: "sitting-bull",
    name: "Sitting Bull",
    shortDescription: "Lakota leader and resistance figure (Indigenous Americas, 19th c.)",
    ocean: { openness: 0.4, conscientiousness: 0.9, extraversion: 0.6, agreeableness: 0.2, neuroticism: 0.3 },
    rationale: "Traditional, steadfast; tenacious leadership; defiant sovereignty, calm under pressure (NPS, Course Hero).",
  },
  {
    id: "sejong",
    name: "Sejong the Great",
    shortDescription: "King and scholar, creator of Hangul (Korea, 15th c.)",
    ocean: { openness: 0.9, conscientiousness: 0.95, extraversion: 0.4, agreeableness: 0.9, neuroticism: 0.2 },
    rationale: "Scholarly dedication, Hangul for literacy; humble, benevolent; Confucian virtues (Asia Society, Weebly).",
  },
  {
    id: "tagore",
    name: "Rabindranath Tagore",
    shortDescription: "Poet and philosopher, Nobel laureate (India, 20th c.)",
    ocean: { openness: 0.9, conscientiousness: 0.65, extraversion: 0.6, agreeableness: 0.85, neuroticism: 0.35 },
    rationale: "Biographical: very high openness/agreeableness (tagoreanworld, wikipedia).",
  },
];

export function listPresets(): readonly PersonalityPreset[] {
  return PRESETS;
}

export function getPreset(id: string): PersonalityPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function isPresetValid(preset: PersonalityPreset): boolean {
  if (!preset.id || !preset.name || !preset.shortDescription || !preset.ocean || !preset.rationale) {
    return false;
  }
  const { ocean } = preset;
  const traits = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;
  for (const t of traits) {
    const v = ocean[t];
    if (typeof v !== "number" || v < 0 || v > 1) return false;
  }
  return true;
}

/**
 * Apply a preset's OCEAN profile to state. Recomputes baseline and decay rates.
 * @throws if preset id is unknown
 */
export function applyPresetToState(state: EmotionEngineState, presetId: string): EmotionEngineState {
  const preset = getPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown personality preset: ${presetId}`);
  }
  const personality = clampProfile(preset.ocean);
  const baseline = computeBaseline(personality);
  const decayRates = computeDimensionDecayRates(personality);
  const emotionDecayRates = computeEmotionDecayRates(personality);
  return {
    ...state,
    personality,
    baseline,
    decayRates,
    emotionDecayRates,
    meta: { ...state.meta, totalUpdates: state.meta.totalUpdates + 1 },
  };
}
