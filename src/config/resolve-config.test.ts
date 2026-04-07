import { describe, it, expect } from "vitest";
import { resolveConfig } from "./resolve-config.js";

describe("resolveConfig", () => {
  it("returns defaults when no env vars set", () => {
    const config = resolveConfig({});
    expect(config.model).toBe("claude-haiku-4-5-20251001");
    expect(config.decayPreset).toBe("slow");
    expect(config.agentEmotions).toBe(true);
    expect(config.userEmotions).toBe(false);
    expect(config.syncUserClassification).toBe(false);
  });

  it("reads CLAUDE_PLUGIN_OPTION_* env vars", () => {
    const env = {
      CLAUDE_PLUGIN_OPTION_DECAYPRESET: "turn",
      CLAUDE_PLUGIN_OPTION_AGENTEMOTIONS: "false",
      CLAUDE_PLUGIN_OPTION_USEREMOTIONS: "true",
      CLAUDE_PLUGIN_OPTION_SYNCUSERCLASSIFICATION: "true",
      CLAUDE_PLUGIN_OPTION_MODEL: "claude-haiku-4-5-20251001",
    };
    const config = resolveConfig(env);
    expect(config.decayPreset).toBe("turn");
    expect(config.agentEmotions).toBe(false);
    expect(config.userEmotions).toBe(true);
    expect(config.syncUserClassification).toBe(true);
  });

  it("reads ANTHROPIC_API_KEY from env", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-test" };
    const config = resolveConfig(env);
    expect(config.apiKey).toBe("sk-ant-test");
  });

  it("resolves data dir from CLAUDE_PLUGIN_DATA", () => {
    const env = { CLAUDE_PLUGIN_DATA: "/tmp/openfeelz-data" };
    const config = resolveConfig(env);
    expect(config.dataDir).toBe("/tmp/openfeelz-data");
  });
});
