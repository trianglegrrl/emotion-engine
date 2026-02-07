import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDashboardHandler, buildDashboardHtml } from "./dashboard.js";
import { StateManager } from "../state/state-manager.js";
import { DEFAULT_CONFIG } from "../types.js";

describe("dashboard", () => {
  let tmpDir: string;
  let manager: StateManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "emotion-dash-test-"));
    manager = new StateManager(path.join(tmpDir, "emotion-engine.json"), DEFAULT_CONFIG);
  });

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("buildDashboardHtml", () => {
    it("produces valid HTML with emotion data", async () => {
      let state = await manager.getState();
      state = manager.applyStimulus(state, "happy", 0.7, "test");
      const html = buildDashboardHtml(state);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Emotion Engine");
      expect(html).toContain("pleasure");
      expect(html).toContain("arousal");
    });

    it("includes glassmorphism styles", async () => {
      const state = await manager.getState();
      const html = buildDashboardHtml(state);
      expect(html).toContain("backdrop-filter");
      expect(html).toContain("rgba");
    });

    it("includes personality section", async () => {
      const state = await manager.getState();
      const html = buildDashboardHtml(state);
      expect(html).toContain("openness");
      expect(html).toContain("neuroticism");
    });
  });

  describe("createDashboardHandler", () => {
    it("returns a handler function", () => {
      const handler = createDashboardHandler(manager);
      expect(typeof handler).toBe("function");
    });

    it("responds with HTML content", async () => {
      const handler = createDashboardHandler(manager);
      let statusCode = 0;
      let body = "";
      const headers: Record<string, string> = {};

      const mockRes = {
        writeHead(code: number, hdrs: Record<string, string>) {
          statusCode = code;
          Object.assign(headers, hdrs);
        },
        end(content: string) {
          body = content;
        },
      };

      const mockReq = { url: "/emotion-dashboard", headers: { host: "localhost" } };
      await handler(mockReq as any, mockRes as any);

      expect(statusCode).toBe(200);
      expect(headers["content-type"]).toContain("text/html");
      expect(body).toContain("<!DOCTYPE html>");
    });

    it("responds with JSON when ?format=json", async () => {
      const handler = createDashboardHandler(manager);
      let statusCode = 0;
      let body = "";

      const mockReq = { url: "/emotion-dashboard?format=json", headers: { host: "localhost" } };
      const mockRes = {
        writeHead(code: number) { statusCode = code; },
        end(content: string) { body = content; },
      };

      await handler(mockReq as any, mockRes as any);

      expect(statusCode).toBe(200);
      const data = JSON.parse(body);
      expect(data.dimensions).toBeDefined();
    });
  });
});
