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

export function buildUserPrompt(text: string, labels: string[]): string {
  return (
    "Classify the emotion expressed by this HUMAN USER in their message. " +
    "Focus on what the human is feeling — frustration, curiosity, excitement, etc. " +
    "Look for emotional signals in tone, word choice, punctuation, and context.\n\n" +
    `Available labels: ${labels.join(", ")}\n\n` +
    'Return ONLY JSON: {"label": "...", "intensity": 0-1, "reason": "short phrase", "confidence": 0-1}\n\n' +
    `User message:\n${text}`
  )
}
