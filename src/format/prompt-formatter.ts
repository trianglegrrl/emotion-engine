/**
 * Format emotional state for system prompt context injection.
 *
 * Produces an `<emotion_state>` XML block that gets prepended to the
 * agent's system prompt, giving it emotional context.
 *
 * Enhanced from emotion-state-1's buildEmotionBlock with dimensional context.
 */

import type {
  DimensionalState,
  EmotionEngineState,
  EmotionStimulus,
} from "../types.js";
import { BASIC_EMOTION_NAMES, DIMENSION_NAMES, OCEAN_TRAITS } from "../types.js";

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

const _INTENSITY_WORDS: Record<string, string> = {
  low: "mildly",
  medium: "moderately",
  high: "strongly",
};

function intensityWord(intensity: number): string {
  if (intensity < 0.33) return "mildly";
  if (intensity < 0.66) return "moderately";
  return "strongly";
}

/**
 * Format an ISO timestamp to a compact human-readable string.
 */
export function formatTimestamp(timestamp: string, timeZone?: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")} ${lookup("hour")}:${lookup("minute")}`;
}

function formatEntry(entry: EmotionStimulus, timeZone?: string): string {
  const ts = formatTimestamp(entry.timestamp, timeZone);
  const word = intensityWord(entry.intensity);
  const reason = entry.trigger.trim().endsWith(".")
    ? entry.trigger.trim()
    : `${entry.trigger.trim()}.`;
  return `${ts}: Felt ${word} ${entry.label} because ${reason}`;
}

// ---------------------------------------------------------------------------
// Dimension Summary
// ---------------------------------------------------------------------------

/**
 * Produce a compact summary of dimensions that deviate significantly
 * from their baseline.
 */
export function formatDimensionSummary(
  dimensions: DimensionalState,
  baseline: DimensionalState,
): string {
  const THRESHOLD = 0.15;
  const deviations: string[] = [];

  for (const name of DIMENSION_NAMES) {
    const delta = dimensions[name] - baseline[name];
    if (Math.abs(delta) >= THRESHOLD) {
      const direction = delta > 0 ? "elevated" : "lowered";
      deviations.push(`${name}: ${direction} (${dimensions[name].toFixed(2)})`);
    }
  }

  return deviations.join(", ");
}

// ---------------------------------------------------------------------------
// Trend Computation
// ---------------------------------------------------------------------------

function computeDominantLabel(
  entries: EmotionStimulus[],
  now: Date,
  halfLifeHours: number,
  windowHours: number,
): string {
  const weights: Record<string, number> = {};
  const nowMs = now.getTime();

  for (const entry of entries) {
    const ts = new Date(entry.timestamp).getTime();
    if (Number.isNaN(ts)) continue;
    const ageHours = (nowMs - ts) / 3_600_000;
    if (ageHours < 0 || ageHours > windowHours) continue;
    const weight = Math.pow(0.5, ageHours / halfLifeHours);
    weights[entry.label] = (weights[entry.label] || 0) + weight;
  }

  let topLabel = "neutral";
  let topWeight = 0;
  for (const [label, weight] of Object.entries(weights)) {
    if (weight > topWeight) {
      topWeight = weight;
      topLabel = label;
    }
  }

  return topWeight > 0 ? topLabel : "neutral";
}

// ---------------------------------------------------------------------------
// Main Block Builder
// ---------------------------------------------------------------------------

export interface FormatOptions {
  maxUserEntries: number;
  maxAgentEntries: number;
  halfLifeHours: number;
  trendWindowHours: number;
  timeZone?: string;
  otherAgents?: Array<{ id: string; latest: EmotionStimulus }>;
  /** Show agent emotional state section (default: true). */
  agentEmotions: boolean;
  /** Show user emotional state section (default: false). */
  userEmotions: boolean;
}

const PREAMBLE =
  "The following is your emotional context from OpenFeelz. " +
  "<agent_emotional_state> is YOUR state. " +
  "<user_emotional_state> is the HUMAN's state. " +
  "Do not confuse them.";

/**
 * Build the `<openfeelz>` block for system prompt context prepend.
 *
 * Contains explicit `<agent_emotional_state>` and `<user_emotional_state>`
 * subsections with ownership comments so the agent never confuses its own
 * emotions with the user's.
 *
 * Returns an empty string when both sections are disabled or when enabled
 * sections have nothing to show.
 */
export function formatEmotionBlock(
  state: EmotionEngineState,
  userKey: string,
  agentId: string,
  options: FormatOptions,
): string {
  const agentSection = options.agentEmotions
    ? buildAgentSection(state, agentId, options)
    : null;

  const userSection = options.userEmotions
    ? buildUserSection(state, userKey, options)
    : null;

  if (agentSection === null && userSection === null) {
    return "";
  }

  const lines: string[] = [PREAMBLE, "", "<openfeelz>"];

  if (agentSection !== null) {
    lines.push(agentSection);
  }
  if (userSection !== null) {
    if (agentSection !== null) lines.push("");
    lines.push(userSection);
  }

  lines.push("</openfeelz>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Section builders (private)
// ---------------------------------------------------------------------------

function buildAgentSection(
  state: EmotionEngineState,
  agentId: string,
  options: FormatOptions,
): string | null {
  const agentBucket = state.agents[agentId];
  const agentEntries =
    agentBucket?.history?.slice(0, options.maxAgentEntries) ?? [];

  const inner: string[] = [];

  // Personality traits
  const personalityTraits = OCEAN_TRAITS.map(
    (t) => `${t}: ${state.personality[t].toFixed(2)}`,
  ).join(", ");
  inner.push("    <personality>");
  inner.push(`      ${personalityTraits}`);
  inner.push("    </personality>");

  // Dimensional deviations
  const dimDeviations: string[] = [];
  for (const name of DIMENSION_NAMES) {
    const val = state.dimensions[name];
    const base = state.baseline[name];
    const delta = val - base;
    if (Math.abs(delta) >= 0.15) {
      const direction = delta > 0 ? "elevated" : "lowered";
      dimDeviations.push(
        `${name}: ${direction} (${val.toFixed(2)}, baseline: ${base.toFixed(2)})`,
      );
    }
  }
  if (dimDeviations.length > 0) {
    inner.push("    <dimensions>");
    for (const line of dimDeviations) {
      inner.push(`      ${line}`);
    }
    inner.push("    </dimensions>");
  }

  // Basic emotions
  const basicAbove = BASIC_EMOTION_NAMES.filter(
    (name) => state.basicEmotions[name] > 0.01,
  );
  if (basicAbove.length > 0) {
    inner.push("    <basic_emotions>");
    for (const name of basicAbove) {
      inner.push(`      ${name}: ${state.basicEmotions[name].toFixed(2)}`);
    }
    inner.push("    </basic_emotions>");
  }

  // Agent recent emotions
  if (agentEntries.length > 0) {
    inner.push("    <your_recent_emotions>");
    for (const entry of agentEntries) {
      inner.push(`      ${formatEntry(entry, options.timeZone)}`);
    }
    inner.push("    </your_recent_emotions>");
  }

  // Personality is always present, so agent section is never empty when enabled
  const lines: string[] = [];
  lines.push(
    "  <!-- YOUR (the AI agent's) emotional state. This is YOUR internal state, not the user's. -->",
  );
  lines.push("  <agent_emotional_state>");
  lines.push(...inner);
  lines.push("  </agent_emotional_state>");

  return lines.join("\n");
}

function buildUserSection(
  state: EmotionEngineState,
  userKey: string,
  options: FormatOptions,
): string | null {
  const now = new Date();
  const userBucket = state.users[userKey];
  const userEntries =
    userBucket?.history?.slice(0, options.maxUserEntries) ?? [];

  if (userEntries.length === 0) {
    return null;
  }

  const inner: string[] = [];

  // Recent emotions
  inner.push("    <recent_emotions>");
  for (const entry of userEntries) {
    inner.push(`      ${formatEntry(entry, options.timeZone)}`);
  }
  inner.push("    </recent_emotions>");

  // Trend
  const userTrend = computeDominantLabel(
    userBucket?.history ?? [],
    now,
    options.halfLifeHours,
    options.trendWindowHours,
  );
  if (userTrend !== "neutral") {
    inner.push(
      `    <trend>mostly ${userTrend} (last ${options.trendWindowHours}h)</trend>`,
    );
  }

  const lines: string[] = [];
  lines.push(
    "  <!-- The HUMAN USER's emotional state (classified from their messages). This is NOT your emotion. -->",
  );
  lines.push("  <user_emotional_state>");
  lines.push(...inner);
  lines.push("  </user_emotional_state>");

  return lines.join("\n");
}
