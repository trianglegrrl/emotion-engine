/**
 * Builds the LLM prompt for analyzing a user's communication style.
 *
 * Takes classified message history and the current style profile,
 * producing a prompt with anchored scales for each style dimension.
 */

import type { EmotionStimulus, UserStyleProfile } from "../types.js"

type HistoryEntry = Pick<EmotionStimulus, 'label' | 'intensity' | 'trigger' | 'sourceExcerpt'>

const SCALE_ANCHORS = `
Anchored scales (0.0 to 1.0):

hyperboleTendency:
  0.0-0.2 = Very literal, precise language
  0.2-0.4 = Mostly literal with occasional emphasis
  0.4-0.6 = Moderate use of exaggeration
  0.6-0.8 = Frequently hyperbolic
  0.8-1.0 = Extremely hyperbolic, constant exaggeration

casualProfanity:
  0.0-0.2 = Never swears
  0.2-0.4 = Rare mild language
  0.4-0.6 = Occasional casual swearing
  0.6-0.8 = Regular profanity in casual speech
  0.8-1.0 = Profanity is just vocabulary

emotionalExpressiveness:
  0.0-0.2 = Very understated, minimal emotional signals
  0.2-0.4 = Restrained but detectable emotion
  0.4-0.6 = Moderate expressiveness
  0.6-0.8 = Openly expressive
  0.8-1.0 = Very dramatic, intense emotional expression

sarcasmFrequency:
  0.0-0.2 = Almost always literal
  0.2-0.4 = Occasional light irony
  0.4-0.6 = Regular sarcastic remarks
  0.6-0.8 = Frequently sarcastic
  0.8-1.0 = Heavy sarcasm, default communication mode
`.trim()

function formatHistory(history: ReadonlyArray<HistoryEntry>): string {
  return history
    .map((entry, i) =>
      `${i + 1}. "${entry.sourceExcerpt ?? ''}" — ${entry.label} (intensity: ${entry.intensity})`
    )
    .join('\n')
}

function formatCurrentProfile(profile: UserStyleProfile): string {
  return [
    `hyperboleTendency: ${profile.hyperboleTendency}`,
    `casualProfanity: ${profile.casualProfanity}`,
    `emotionalExpressiveness: ${profile.emotionalExpressiveness}`,
    `sarcasmFrequency: ${profile.sarcasmFrequency}`,
  ].join('\n')
}

export function buildProfilingPrompt(
  history: ReadonlyArray<HistoryEntry>,
  currentProfile: UserStyleProfile,
): string {
  return [
    'You are analyzing a person\'s communication style based on their recent messages. Be non-judgmental and kind in your analysis.',
    '',
    'Recent message history:',
    formatHistory(history),
    '',
    'Current profile values:',
    formatCurrentProfile(currentProfile),
    '',
    SCALE_ANCHORS,
    '',
    'Return ONLY JSON, no markdown: {"hyperboleTendency": number, "casualProfanity": number, "emotionalExpressiveness": number, "sarcasmFrequency": number}',
  ].join('\n')
}
