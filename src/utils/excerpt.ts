/**
 * Build a message excerpt: first N + last N tokens.
 * Uses whitespace split as a simple token approximation.
 */
export function buildExcerpt(text: string, tokenLimit: number): string {
  if (!text) return ""
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length <= tokenLimit * 2) return text.trim()
  const first = tokens.slice(0, tokenLimit)
  const last = tokens.slice(-tokenLimit)
  return [...first, "[...]", ...last].join(" ")
}
