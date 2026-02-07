/**
 * Extract plain text from OpenClaw message content for use in hooks/tools.
 *
 * OpenClaw can send content as:
 * - string (simple messages)
 * - array of content blocks (e.g. [{ type: "text", text: "..." }])
 * - other (object/undefined) in some code paths
 *
 * Semantics match OpenClaw core's extractSessionText (memory/session-files.ts)
 * so plugin behavior is consistent with core message handling.
 */

export function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as { type?: unknown; text?: unknown };
    if (record.type !== "text" || typeof record.text !== "string") {
      continue;
    }
    const trimmed = String(record.text).trim();
    if (trimmed) {
      parts.push(trimmed);
    }
  }
  return parts.join(" ");
}
