import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createEmotionMcpServer } from "./mcp-server.js";
import { StateManager } from "../state/state-manager.js";
import { DEFAULT_CONFIG } from "../types.js";

describe("mcp-server", () => {
  let tmpDir: string;
  let manager: StateManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "emotion-mcp-test-"));
    manager = new StateManager(path.join(tmpDir, "emotion-engine.json"), DEFAULT_CONFIG);
  });

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("createEmotionMcpServer", () => {
    it("returns server config with tools and resources", () => {
      const config = createEmotionMcpServer(manager);
      expect(config.name).toBe("emotion-engine");
      expect(config.tools).toBeDefined();
      expect(config.tools.length).toBeGreaterThanOrEqual(3);
      expect(config.resources).toBeDefined();
      expect(config.resources.length).toBeGreaterThanOrEqual(2);
    });

    it("query_emotion tool returns current state", async () => {
      const config = createEmotionMcpServer(manager);
      const queryTool = config.tools.find((t) => t.name === "query_emotion");
      expect(queryTool).toBeDefined();

      const result = await queryTool!.handler({});
      expect(result).toBeDefined();
      const data = JSON.parse(result.content);
      expect(data.dimensions).toBeDefined();
      expect(data.basicEmotions).toBeDefined();
    });

    it("modify_emotion tool applies stimulus", async () => {
      const config = createEmotionMcpServer(manager);
      const modifyTool = config.tools.find((t) => t.name === "modify_emotion");
      expect(modifyTool).toBeDefined();

      const result = await modifyTool!.handler({
        emotion: "happy",
        intensity: 0.7,
        trigger: "test",
      });
      const data = JSON.parse(result.content);
      expect(data.applied).toBe(true);
    });

    it("set_personality tool updates traits", async () => {
      const config = createEmotionMcpServer(manager);
      const setTrait = config.tools.find((t) => t.name === "set_personality");
      expect(setTrait).toBeDefined();

      const result = await setTrait!.handler({ trait: "openness", value: 0.9 });
      const data = JSON.parse(result.content);
      expect(data.personality.openness).toBe(0.9);
    });

    it("emotion_state resource returns formatted state", async () => {
      const config = createEmotionMcpServer(manager);
      const stateResource = config.resources.find((r) => r.uri === "emotion://state");
      expect(stateResource).toBeDefined();

      const content = await stateResource!.read();
      const data = JSON.parse(content);
      expect(data.dimensions).toBeDefined();
    });

    it("emotion_personality resource returns profile", async () => {
      const config = createEmotionMcpServer(manager);
      const personalityResource = config.resources.find((r) => r.uri === "emotion://personality");
      expect(personalityResource).toBeDefined();

      const content = await personalityResource!.read();
      const data = JSON.parse(content);
      expect(data.openness).toBeDefined();
    });
  });
});
