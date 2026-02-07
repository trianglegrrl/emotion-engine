import { describe, it, expect } from "vitest";
import { migrateV1State } from "./migrate-v1.js";

describe("migrate-v1", () => {
  it("converts v1 emotion-state format to v2", () => {
    const v1State = {
      version: 1,
      users: {
        user1: {
          latest: {
            timestamp: "2026-02-06T12:00:00Z",
            label: "happy",
            intensity: "high",
            reason: "good conversation",
            confidence: 0.9,
          },
          history: [
            {
              timestamp: "2026-02-06T12:00:00Z",
              label: "happy",
              intensity: "high",
              reason: "good conversation",
              confidence: 0.9,
            },
            {
              timestamp: "2026-02-06T11:00:00Z",
              label: "frustrated",
              intensity: "medium",
              reason: "debugging",
              confidence: 0.8,
            },
          ],
        },
      },
      agents: {
        main: {
          latest: {
            timestamp: "2026-02-06T12:00:00Z",
            label: "focused",
            intensity: "medium",
            reason: "task at hand",
            confidence: 0.85,
          },
          history: [],
        },
      },
    };

    const v2 = migrateV1State(v1State);

    expect(v2.version).toBe(2);
    expect(v2.personality).toBeDefined();
    expect(v2.dimensions).toBeDefined();
    expect(v2.baseline).toBeDefined();
    expect(v2.decayRates).toBeDefined();
    expect(v2.basicEmotions).toBeDefined();
    expect(v2.rumination.active).toEqual([]);
    expect(v2.users["user1"]).toBeDefined();
    expect(v2.users["user1"].history).toHaveLength(2);
    expect(v2.users["user1"].latest!.intensity).toBe(0.9); // "high" -> 0.9
    expect(v2.agents["main"]).toBeDefined();
  });

  it("converts intensity strings to numbers", () => {
    const v1State = {
      version: 1,
      users: {
        u1: {
          latest: { label: "calm", intensity: "low", reason: "r", confidence: 0.5, timestamp: "" },
          history: [
            { label: "calm", intensity: "low", reason: "r", confidence: 0.5, timestamp: "" },
            { label: "excited", intensity: "medium", reason: "r", confidence: 0.5, timestamp: "" },
            { label: "angry", intensity: "high", reason: "r", confidence: 0.5, timestamp: "" },
          ],
        },
      },
      agents: {},
    };

    const v2 = migrateV1State(v1State);
    expect(v2.users["u1"].history[0].intensity).toBe(0.3); // low
    expect(v2.users["u1"].history[1].intensity).toBe(0.6); // medium
    expect(v2.users["u1"].history[2].intensity).toBe(0.9); // high
  });

  it("handles empty v1 state", () => {
    const v1State = { version: 1, users: {}, agents: {} };
    const v2 = migrateV1State(v1State);
    expect(v2.version).toBe(2);
    expect(Object.keys(v2.users)).toHaveLength(0);
  });

  it("handles null/undefined input gracefully", () => {
    const v2 = migrateV1State(null as any);
    expect(v2.version).toBe(2);
  });
});
