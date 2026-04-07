import type { EmotionEngineConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

export interface ResolvedConfig extends EmotionEngineConfig {
  dataDir: string;
}

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    model: env.CLAUDE_PLUGIN_OPTION_MODEL ?? DEFAULT_CONFIG.model,
    decayPreset:
      (env.CLAUDE_PLUGIN_OPTION_DECAYPRESET as ResolvedConfig["decayPreset"]) ??
      DEFAULT_CONFIG.decayPreset,
    agentEmotions: envBool(
      env.CLAUDE_PLUGIN_OPTION_AGENTEMOTIONS,
      DEFAULT_CONFIG.agentEmotions,
    ),
    userEmotions: envBool(
      env.CLAUDE_PLUGIN_OPTION_USEREMOTIONS,
      DEFAULT_CONFIG.userEmotions,
    ),
    syncUserClassification: envBool(
      env.CLAUDE_PLUGIN_OPTION_SYNCUSERCLASSIFICATION,
      DEFAULT_CONFIG.syncUserClassification,
    ),
    dataDir:
      env.CLAUDE_PLUGIN_DATA ?? env.OPENFEELZ_DATA_DIR ?? "/tmp/openfeelz",
  };
}
