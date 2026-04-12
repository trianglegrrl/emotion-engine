/**
 * State Helper CLI: entry point for all state reads and mutations.
 *
 * Called by slash command markdown files. Ensures decay is always applied
 * before returning state. Reads config from CLAUDE_PLUGIN_OPTION_* env vars.
 *
 * Output contract:
 *  - Success: exit 0, JSON stdout: { ok: true, data: { ... } }
 *  - Error:   exit 1, JSON stdout: { ok: false, error: "message", code: "ERROR_CODE" }
 */

import type {
  BasicEmotions,
  DimensionName,
  DimensionalState,
  EmotionEngineState,
  EmotionStimulus,
  OCEANProfile,
  OCEANTrait,
  UserStyleProfile,
} from "../types.js";
import { DIMENSION_NAMES, OCEAN_TRAITS, DEFAULT_STYLE_PROFILE } from "../types.js";
import { createDefaultTracker } from "../classify/style-profiler.js";
import {
  computePrimaryEmotion,
  computeOverallIntensity,
} from "../model/emotion-model.js";
import { StateManager } from "../state/state-manager.js";
import { resolveConfig } from "../config/resolve-config.js";
import path from "node:path";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SuccessResult<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ErrorResult {
  readonly ok: false;
  readonly error: string;
  readonly code: string;
}

type ActionResult<T> = SuccessResult<T> | ErrorResult;

function success<T>(data: T): SuccessResult<T> {
  return { ok: true, data };
}

function error(message: string, code: string): ErrorResult {
  return { ok: false, error: message, code };
}

// ---------------------------------------------------------------------------
// Argv parsing
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  readonly action: string;
  readonly flags: Readonly<Record<string, string>>;
}

/** Parse process.argv into action + flags. No external deps. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const args = argv.slice(2);
  const action = args[0] ?? "";
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }

  return { action, flags };
}

// ---------------------------------------------------------------------------
// Internal: load + decay helper
// ---------------------------------------------------------------------------

async function loadDecayedState(manager: StateManager): Promise<EmotionEngineState> {
  const state = await manager.getState();
  return manager.applyDecay(state);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const VALID_FORMATS = ["full", "summary", "dimensions", "emotions"] as const;
type QueryFormat = (typeof VALID_FORMATS)[number];

interface FullQueryData {
  readonly dimensions: DimensionalState;
  readonly basicEmotions: BasicEmotions;
  readonly personality: OCEANProfile;
  readonly primaryEmotion: string;
  readonly overallIntensity: number;
  readonly recentStimuli: readonly EmotionStimulus[];
  readonly rumination: EmotionEngineState["rumination"];
  readonly tokenUsage?: EmotionEngineState["tokenUsage"];
}

interface SummaryQueryData {
  readonly primaryEmotion: string;
  readonly overallIntensity: number;
  readonly dimensions: DimensionalState;
  readonly basicEmotions: BasicEmotions;
}

/** Query state with optional format flag. */
export async function queryState(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<FullQueryData | SummaryQueryData | DimensionalState | BasicEmotions>> {
  const format = (flags.format ?? "full") as string;

  if (!VALID_FORMATS.includes(format as QueryFormat)) {
    return error(
      `Invalid format "${format}". Valid: ${VALID_FORMATS.join(", ")}`,
      "INVALID_FORMAT",
    );
  }

  const state = await loadDecayedState(manager);
  const primaryEmotion = computePrimaryEmotion(state.basicEmotions);
  const overallIntensity = computeOverallIntensity(state.basicEmotions);

  switch (format as QueryFormat) {
    case "full":
      return success({
        dimensions: state.dimensions,
        basicEmotions: state.basicEmotions,
        personality: state.personality,
        primaryEmotion,
        overallIntensity,
        recentStimuli: state.recentStimuli,
        rumination: state.rumination,
        tokenUsage: state.tokenUsage,
      });

    case "summary":
      return success({
        primaryEmotion,
        overallIntensity,
        dimensions: state.dimensions,
        basicEmotions: state.basicEmotions,
      });

    case "dimensions":
      return success(state.dimensions);

    case "emotions":
      return success(state.basicEmotions);

    default:
      return error(`Unknown format: ${format}`, "INVALID_FORMAT");
  }
}

/** Reset dimensions to baseline, optionally only specific dimensions. */
export async function resetState(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ message: string; dimensionsReset: readonly string[] }>> {
  const dimStr = flags.dimensions;
  let dimensions: DimensionName[] | undefined;

  if (dimStr) {
    const names = dimStr.split(",").map((s) => s.trim());
    const invalid = names.filter(
      (n) => !DIMENSION_NAMES.includes(n as DimensionName),
    );
    if (invalid.length > 0) {
      return error(
        `Invalid dimension(s): ${invalid.join(", ")}. Valid: ${DIMENSION_NAMES.join(", ")}`,
        "INVALID_DIMENSION",
      );
    }
    dimensions = names as DimensionName[];
  }

  const state = await loadDecayedState(manager);
  const updated = manager.resetToBaseline(state, dimensions);
  await manager.saveState(updated);

  const resetList = dimensions ?? [...DIMENSION_NAMES];
  return success({
    message: `Emotional state reset to baseline for: ${resetList.join(", ")}`,
    dimensionsReset: resetList,
  });
}

/** Set a single dimension to an absolute value. */
export async function setDimensionAction(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ dimension: DimensionName; value: number; dimensions: DimensionalState }>> {
  const dimension = flags.dimension;
  const valueStr = flags.value;

  if (!dimension) {
    return error("Missing --dimension flag", "MISSING_PARAM");
  }
  if (!valueStr) {
    return error("Missing --value flag", "MISSING_PARAM");
  }
  if (!DIMENSION_NAMES.includes(dimension as DimensionName)) {
    return error(
      `Invalid dimension "${dimension}". Valid: ${DIMENSION_NAMES.join(", ")}`,
      "INVALID_DIMENSION",
    );
  }

  const value = Number(valueStr);
  if (Number.isNaN(value)) {
    return error(`Invalid value "${valueStr}": must be a number`, "INVALID_VALUE");
  }

  const state = await loadDecayedState(manager);
  const updated = manager.setDimension(state, dimension as DimensionName, value);
  await manager.saveState(updated);

  return success({
    dimension: dimension as DimensionName,
    value: updated.dimensions[dimension as DimensionName],
    dimensions: updated.dimensions,
  });
}

/** Apply a delta to a single dimension. */
export async function applyDimensionDeltaAction(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ dimension: DimensionName; delta: number; value: number; dimensions: DimensionalState }>> {
  const dimension = flags.dimension;
  const deltaStr = flags.delta;

  if (!dimension) {
    return error("Missing --dimension flag", "MISSING_PARAM");
  }
  if (!deltaStr) {
    return error("Missing --delta flag", "MISSING_PARAM");
  }
  if (!DIMENSION_NAMES.includes(dimension as DimensionName)) {
    return error(
      `Invalid dimension "${dimension}". Valid: ${DIMENSION_NAMES.join(", ")}`,
      "INVALID_DIMENSION",
    );
  }

  const delta = Number(deltaStr);
  if (Number.isNaN(delta)) {
    return error(`Invalid delta "${deltaStr}": must be a number`, "INVALID_VALUE");
  }

  const state = await loadDecayedState(manager);
  const updated = manager.applyDimensionDeltaMethod(state, dimension as DimensionName, delta);
  await manager.saveState(updated);

  return success({
    dimension: dimension as DimensionName,
    delta,
    value: updated.dimensions[dimension as DimensionName],
    dimensions: updated.dimensions,
  });
}

/** Set a single personality trait. */
export async function setPersonalityTrait(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ personality: OCEANProfile; traitSet: string; value: number }>> {
  const trait = flags.trait;
  const valueStr = flags.value;

  if (!trait) {
    return error("Missing --trait flag", "MISSING_PARAM");
  }
  if (!valueStr) {
    return error("Missing --value flag", "MISSING_PARAM");
  }

  if (!OCEAN_TRAITS.includes(trait as OCEANTrait)) {
    return error(
      `Invalid trait "${trait}". Valid: ${OCEAN_TRAITS.join(", ")}`,
      "INVALID_TRAIT",
    );
  }

  const value = Number(valueStr);
  if (Number.isNaN(value)) {
    return error(`Invalid value "${valueStr}": must be a number`, "INVALID_VALUE");
  }

  const state = await loadDecayedState(manager);
  const updated = manager.setPersonalityTrait(state, trait as OCEANTrait, value);
  await manager.saveState(updated);

  return success({
    personality: updated.personality,
    traitSet: trait,
    value: updated.personality[trait as OCEANTrait],
  });
}

/** Get current personality profile. */
export async function getPersonality(
  manager: StateManager,
): Promise<ActionResult<OCEANProfile>> {
  const state = await loadDecayedState(manager);
  return success(state.personality);
}

const VALID_PRESETS = ["slow", "fast", "turn"] as const;

/** Set decay preset (informational -- actual config change is external). */
export function setDecayPreset(
  flags: Readonly<Record<string, string | undefined>>,
): ActionResult<{ preset: string; message: string }> {
  const preset = flags.preset;

  if (!preset) {
    return error("Missing --preset flag", "MISSING_PARAM");
  }

  if (!VALID_PRESETS.includes(preset as (typeof VALID_PRESETS)[number])) {
    return error(
      `Invalid preset "${preset}". Valid: ${VALID_PRESETS.join(", ")}`,
      "INVALID_PRESET",
    );
  }

  return success({
    preset,
    message: "Decay preset changed. Restart session for effect.",
  });
}

/** Apply an emotional stimulus. */
export async function applyStimulusAction(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<
  ActionResult<{
    primaryEmotion: string;
    overallIntensity: number;
    stimulusApplied: { emotion: string; intensity: number; trigger: string };
  }>
> {
  const emotion = flags.emotion;
  const intensityStr = flags.intensity;
  const trigger = flags.trigger ?? "";

  if (!emotion) {
    return error("Missing --emotion flag", "MISSING_PARAM");
  }
  if (!intensityStr) {
    return error("Missing --intensity flag", "MISSING_PARAM");
  }

  const intensity = Number(intensityStr);
  if (Number.isNaN(intensity)) {
    return error(
      `Invalid intensity "${intensityStr}": must be a number`,
      "INVALID_VALUE",
    );
  }

  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  const state = await loadDecayedState(manager);
  const updated = manager.applyStimulus(state, emotion, clampedIntensity, trigger);
  await manager.saveState(updated);

  return success({
    primaryEmotion: computePrimaryEmotion(updated.basicEmotions),
    overallIntensity: computeOverallIntensity(updated.basicEmotions),
    stimulusApplied: { emotion, intensity: clampedIntensity, trigger },
  });
}

/** Return recent stimuli history. */
export async function historyAction(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ stimuli: readonly EmotionStimulus[]; count: number }>> {
  const limitStr = flags.limit;
  const limit = limitStr ? Number(limitStr) : 20;

  const state = await loadDecayedState(manager);
  const stimuli = state.recentStimuli.slice(0, limit);

  return success({ stimuli, count: stimuli.length });
}

// ---------------------------------------------------------------------------
// Style profile actions
// ---------------------------------------------------------------------------

const VALID_STYLE_DIMENSIONS = [
  "hyperboleTendency",
  "casualProfanity",
  "emotionalExpressiveness",
  "sarcasmFrequency",
] as const;

type StyleDimensionName = (typeof VALID_STYLE_DIMENSIONS)[number];

/** Get a user's style profile (defaults to DEFAULT_STYLE_PROFILE for unknown users). */
export async function getStyleAction(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ profile: UserStyleProfile }>> {
  const user = flags.user ?? "unknown";
  const state = await loadDecayedState(manager);
  const profile = state.userStyles[user]?.profile ?? {
    ...DEFAULT_STYLE_PROFILE,
    lastUpdated: new Date().toISOString(),
  };
  return success({ profile });
}

/** Set a single style dimension for a user. */
export async function setStyleAction(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ profile: UserStyleProfile; dimensionSet: string; value: number }>> {
  const dimension = flags.dimension;
  const valueStr = flags.value;
  const user = flags.user ?? "unknown";

  if (!dimension || !VALID_STYLE_DIMENSIONS.includes(dimension as StyleDimensionName)) {
    return error(
      `Invalid dimension "${dimension ?? ""}". Valid: ${VALID_STYLE_DIMENSIONS.join(", ")}`,
      "INVALID_DIMENSION",
    );
  }

  if (!valueStr) {
    return error("Missing --value flag", "MISSING_PARAM");
  }

  const value = Number(valueStr);
  if (Number.isNaN(value) || value < 0 || value > 1) {
    return error(
      `Invalid value "${valueStr}": must be a number between 0 and 1`,
      "INVALID_VALUE",
    );
  }

  const state = await loadDecayedState(manager);
  const existing = state.userStyles[user] ?? createDefaultTracker();
  const existingProfile = existing.profile;

  const updatedOverrides = existingProfile.userOverrides.includes(dimension)
    ? [...existingProfile.userOverrides]
    : [...existingProfile.userOverrides, dimension];

  const updatedProfile: UserStyleProfile = {
    ...existingProfile,
    [dimension]: value,
    userOverrides: updatedOverrides,
    lastUpdated: new Date().toISOString(),
  };

  const updatedState: EmotionEngineState = {
    ...state,
    userStyles: {
      ...state.userStyles,
      [user]: { ...existing, profile: updatedProfile },
    },
  };

  await manager.saveState(updatedState);

  return success({ profile: updatedProfile, dimensionSet: dimension, value });
}

/** Reset a user's style profile to defaults. */
export async function resetStyleAction(
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
): Promise<ActionResult<{ profile: UserStyleProfile; message: string }>> {
  const user = flags.user ?? "unknown";
  const state = await loadDecayedState(manager);
  const freshTracker = createDefaultTracker();

  const updatedState: EmotionEngineState = {
    ...state,
    userStyles: {
      ...state.userStyles,
      [user]: freshTracker,
    },
  };

  await manager.saveState(updatedState);

  return success({
    profile: freshTracker.profile,
    message: "Style profile reset to defaults",
  });
}

// ---------------------------------------------------------------------------
// CLI router
// ---------------------------------------------------------------------------

type ActionHandler = (
  manager: StateManager,
  flags: Readonly<Record<string, string | undefined>>,
) => Promise<ActionResult<unknown>> | ActionResult<unknown>;

const ACTION_MAP: Readonly<Record<string, ActionHandler>> = {
  query: queryState,
  reset: resetState,
  "set-dimension": setDimensionAction,
  "apply-dimension-delta": applyDimensionDeltaAction,
  "set-personality": setPersonalityTrait,
  "get-personality": (mgr) => getPersonality(mgr),
  "set-decay": (_mgr, flags) => setDecayPreset(flags),
  "apply-stimulus": applyStimulusAction,
  history: historyAction,
  "get-style": getStyleAction,
  "set-style": setStyleAction,
  "reset-style": resetStyleAction,
};

/** Route parsed args to the correct action handler. Exported for testing. */
export async function runAction(
  manager: StateManager,
  parsed: ParsedArgs,
): Promise<ActionResult<unknown>> {
  const handler = ACTION_MAP[parsed.action];
  if (!handler) {
    return error(
      `Unknown action "${parsed.action}". Valid: ${Object.keys(ACTION_MAP).join(", ")}`,
      "UNKNOWN_ACTION",
    );
  }
  return handler(manager, parsed.flags);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function main(argv: readonly string[] = process.argv): Promise<void> {
  try {
    const config = resolveConfig();
    const statePath = path.join(config.dataDir, "state.json");
    const manager = new StateManager(statePath, config);

    const parsed = parseArgs(argv);
    const result = await runAction(manager, parsed);

    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode = result.ok ? 0 : 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      JSON.stringify({ ok: false, error: message, code: "INTERNAL_ERROR" }) + "\n",
    );
    process.exitCode = 1;
  }
}

// Run if executed directly
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("state-helper.js") ||
    process.argv[1].endsWith("state-helper.ts"));

if (isDirectRun) {
  main();
}
