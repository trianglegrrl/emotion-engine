import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadOtherAgentStates } from "./multi-agent.js";
import { buildEmptyState, writeStateFile } from "./state-file.js";

describe("multi-agent", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "emotion-multi-test-"));
  });

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("loadOtherAgentStates", () => {
    it("returns empty array when agents dir does not exist", async () => {
      const result = await loadOtherAgentStates(tmpDir, "main", 3);
      expect(result).toEqual([]);
    });

    it("loads emotion states from agent JSON files", async () => {
      const agentsDir = path.join(tmpDir, "agents");
      await fs.mkdir(agentsDir, { recursive: true });

      for (const agentId of ["agent1", "agent2"]) {
        const state = buildEmptyState();
        state.agents[agentId] = {
          latest: {
            id: `s-${agentId}`,
            timestamp: new Date().toISOString(),
            label: agentId === "agent1" ? "focused" : "calm",
            intensity: 0.6,
            trigger: "working on task",
            confidence: 0.8,
            sourceRole: "assistant",
          },
          history: [],
        };
        await writeStateFile(path.join(agentsDir, `${agentId}.json`), state);
      }

      const result = await loadOtherAgentStates(tmpDir, "main", 5);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain("agent1");
      expect(result.map((r) => r.id)).toContain("agent2");
    });

    it("excludes the current agent", async () => {
      const agentsDir = path.join(tmpDir, "agents");
      await fs.mkdir(agentsDir, { recursive: true });

      const state = buildEmptyState();
      state.agents["main"] = {
        latest: {
          id: "s0",
          timestamp: new Date().toISOString(),
          label: "happy",
          intensity: 0.5,
          trigger: "test",
          confidence: 0.9,
          sourceRole: "assistant",
        },
        history: [],
      };
      await writeStateFile(path.join(agentsDir, "main.json"), state);

      const result = await loadOtherAgentStates(tmpDir, "main", 5);
      expect(result.map((r) => r.id)).not.toContain("main");
    });

    it("respects maxAgents limit", async () => {
      const agentsDir = path.join(tmpDir, "agents");
      await fs.mkdir(agentsDir, { recursive: true });

      for (let i = 0; i < 5; i++) {
        const state = buildEmptyState();
        state.agents[`agent${i}`] = {
          latest: {
            id: `s${i}`,
            timestamp: new Date().toISOString(),
            label: "calm",
            intensity: 0.3,
            trigger: "test",
            confidence: 0.8,
            sourceRole: "assistant",
          },
          history: [],
        };
        await writeStateFile(
          path.join(agentsDir, `agent${i}.json`),
          state,
        );
      }

      const result = await loadOtherAgentStates(tmpDir, "main", 2);
      expect(result).toHaveLength(2);
    });

    it("skips non-JSON files", async () => {
      const agentsDir = path.join(tmpDir, "agents");
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(path.join(agentsDir, "readme.txt"), "not json");

      const result = await loadOtherAgentStates(tmpDir, "main", 5);
      expect(result).toEqual([]);
    });

    it("skips corrupt state files", async () => {
      const agentsDir = path.join(tmpDir, "agents");
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(path.join(agentsDir, "corrupt.json"), "not valid json{{{");

      const result = await loadOtherAgentStates(tmpDir, "main", 5);
      expect(result).toEqual([]);
    });
  });
});
