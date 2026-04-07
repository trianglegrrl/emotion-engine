import type { UserStyleProfile } from '../types.js'

function describeValue(
  value: number,
  lowDesc: string,
  modDesc: string,
  highDesc: string,
  veryHighDesc: string,
): string {
  if (value >= 0.8) return veryHighDesc
  if (value >= 0.6) return highDesc
  if (value >= 0.3) return modDesc
  return lowDesc
}

function buildStyleSection(style: UserStyleProfile): string {
  const hyperbole = describeValue(
    style.hyperboleTendency,
    'they rarely exaggerate',
    'they sometimes exaggerate',
    'they frequently exaggerate for effect — dramatic language often means mild feelings',
    'they almost always exaggerate — take dramatic language with a grain of salt',
  )
  const profanity = describeValue(
    style.casualProfanity,
    'they rarely use profanity',
    'they sometimes use profanity',
    'they frequently use profanity casually — swearing often carries little emotional weight',
    'they almost always use profanity — swearing is part of their normal vocabulary',
  )
  const expressiveness = describeValue(
    style.emotionalExpressiveness,
    'they express emotions subtly',
    'they are moderately expressive',
    'they are highly expressive — strong language often reflects moderate feelings',
    'they are extremely expressive — intense phrasing is their baseline',
  )
  const sarcasm = describeValue(
    style.sarcasmFrequency,
    'they rarely use sarcasm',
    'they sometimes use sarcasm',
    'they frequently use sarcasm — apparent sentiments may be inverted',
    'they almost always use sarcasm — assume statements may mean the opposite',
  )

  return (
    "IMPORTANT - This user's communication style profile:\n" +
    `- Hyperbole tendency: ${style.hyperboleTendency}/1.0 (${hyperbole})\n` +
    `- Casual profanity: ${style.casualProfanity}/1.0 (${profanity})\n` +
    `- Emotional expressiveness: ${style.emotionalExpressiveness}/1.0 (${expressiveness})\n` +
    `- Sarcasm frequency: ${style.sarcasmFrequency}/1.0 (${sarcasm})\n` +
    '\nCalibrate your intensity ratings accordingly. A message like "BRO WHAT THE FUCK" from this user likely indicates mild surprise or amusement, not rage.\n\n'
  )
}

export const CLASSIFY_SYSTEM =
  "You are an emotion classifier. You return ONLY valid JSON. " +
  "No markdown, no explanation, just a single JSON object."

export function buildAgentPrompt(text: string, labels: string[]): string {
  return (
    "Classify the emotional tone of this AI ASSISTANT response. " +
    "Focus on the assistant's stance, engagement level, and emotional coloring — " +
    "not the content it's describing, but how it's expressing itself.\n\n" +
    `Available labels: ${labels.join(", ")}\n\n` +
    'Return ONLY JSON: {"label": "...", "intensity": 0-1, "reason": "short phrase", "confidence": 0-1}\n\n' +
    `Assistant message:\n${text}`
  )
}

export function buildUserPrompt(
  text: string,
  labels: string[],
  style?: UserStyleProfile,
  maturityThreshold: number = 10,
): string {
  const styleSection =
    style && style.sampleSize >= maturityThreshold
      ? buildStyleSection(style)
      : ''

  return (
    "Classify the emotion expressed by this HUMAN USER in their message. " +
    "Focus on what the human is feeling — frustration, curiosity, excitement, etc. " +
    "Look for emotional signals in tone, word choice, punctuation, and context.\n\n" +
    styleSection +
    `Available labels: ${labels.join(", ")}\n\n` +
    'Return ONLY JSON: {"label": "...", "intensity": 0-1, "reason": "short phrase", "confidence": 0-1}\n\n' +
    `User message:\n${text}`
  )
}
