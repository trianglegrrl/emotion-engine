import { describe, it, expect, vi } from "vitest";
import {
  classifyEmotion,
  parseClassifierResponse,
  coerceClassificationResult,
} from "./classifier.js";
import { DEFAULT_CONFIG } from "../types.js";

describe("classifier", () => {
  // -----------------------------------------------------------------------
  // parseClassifierResponse
  // -----------------------------------------------------------------------

  describe("parseClassifierResponse", () => {
    it("parses valid JSON response", () => {
      const raw = JSON.stringify({
        label: "happy",
        intensity: 0.7,
        reason: "user expressed delight",
        confidence: 0.85,
      });
      const result = parseClassifierResponse(raw);
      expect(result.label).toBe("happy");
      expect(result.intensity).toBe(0.7);
      expect(result.reason).toBe("user expressed delight");
      expect(result.confidence).toBe(0.85);
    });

    it("extracts JSON from markdown code block", () => {
      const raw = '```json\n{"label":"sad","intensity":0.5,"reason":"low mood","confidence":0.6}\n```';
      const result = parseClassifierResponse(raw);
      expect(result.label).toBe("sad");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseClassifierResponse("not json")).toThrow();
    });

    it("throws on missing required fields", () => {
      const raw = JSON.stringify({ label: "happy" }); // missing intensity, reason, confidence
      expect(() => parseClassifierResponse(raw)).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // coerceClassificationResult
  // -----------------------------------------------------------------------

  describe("coerceClassificationResult", () => {
    const labels = DEFAULT_CONFIG.emotionLabels;

    it("normalizes label to lowercase", () => {
      const result = coerceClassificationResult(
        { label: "HAPPY", intensity: 0.5, reason: "test", confidence: 0.8 },
        labels,
        0.35,
      );
      expect(result.label).toBe("happy");
    });

    it("falls back to neutral for unknown labels", () => {
      const result = coerceClassificationResult(
        { label: "zzz_unknown", intensity: 0.5, reason: "test", confidence: 0.8 },
        labels,
        0.35,
      );
      expect(result.label).toBe("neutral");
    });

    it("clamps intensity to [0, 1]", () => {
      const result = coerceClassificationResult(
        { label: "happy", intensity: 1.5, reason: "test", confidence: 0.8 },
        labels,
        0.35,
      );
      expect(result.intensity).toBe(1);
    });

    it("falls back to neutral when confidence is below minimum", () => {
      const result = coerceClassificationResult(
        { label: "angry", intensity: 0.8, reason: "test", confidence: 0.1 },
        labels,
        0.35,
      );
      expect(result.label).toBe("neutral");
      expect(result.intensity).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // classifyEmotion -- Anthropic with role: 'agent'
  // -----------------------------------------------------------------------

  describe("classifyEmotion (role: agent)", () => {
    it("calls Anthropic and uses agent prompt", async () => {
      const mockResponse = {
        label: "happy",
        intensity: 0.7,
        reason: "positive greeting",
        confidence: 0.9,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              { type: "text", text: JSON.stringify(mockResponse) },
            ],
          }),
      });

      const result = await classifyEmotion(
        "Hello! Great to see you!",
        {
          apiKey: "sk-ant-test",
          model: "claude-sonnet-4-5-20250514",
          role: "agent",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
          fetchFn: mockFetch,
        },
      );

      expect(result.label).toBe("happy");
      expect(result.intensity).toBe(0.7);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify it called the Anthropic endpoint
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("https://api.anthropic.com/v1/messages");
      expect(callArgs[1].headers["x-api-key"]).toBe("sk-ant-test");
      expect(callArgs[1].headers["anthropic-version"]).toBe("2023-06-01");

      // Verify agent prompt is used
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[0].content).toContain("AI ASSISTANT");
    });
  });

  // -----------------------------------------------------------------------
  // classifyEmotion -- Anthropic with role: 'user'
  // -----------------------------------------------------------------------

  describe("classifyEmotion (role: user)", () => {
    it("calls Anthropic and uses user prompt", async () => {
      const mockResponse = {
        label: "frustrated",
        intensity: 0.6,
        reason: "deployment issues",
        confidence: 0.8,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              { type: "text", text: JSON.stringify(mockResponse) },
            ],
          }),
      });

      const result = await classifyEmotion(
        "This deployment keeps failing!",
        {
          apiKey: "sk-ant-test",
          model: "claude-sonnet-4-5-20250514",
          role: "user",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
          fetchFn: mockFetch,
        },
      );

      expect(result.label).toBe("frustrated");
      expect(result.intensity).toBe(0.6);

      // Verify user prompt is used
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[0].content).toContain("HUMAN USER");
    });
  });

  // -----------------------------------------------------------------------
  // classifyEmotion -- Error handling
  // -----------------------------------------------------------------------

  describe("classifyEmotion (errors)", () => {
    it("returns neutral on fetch failure", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));

      const result = await classifyEmotion(
        "test message",
        {
          apiKey: "test-key",
          model: "claude-sonnet-4-5-20250514",
          role: "agent",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
          fetchFn: mockFetch,
        },
      );

      expect(result.label).toBe("neutral");
      expect(result.intensity).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it("returns neutral on non-ok response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("error"),
      });

      const result = await classifyEmotion(
        "test",
        {
          apiKey: "test-key",
          model: "claude-sonnet-4-5-20250514",
          role: "user",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
          fetchFn: mockFetch,
        },
      );

      expect(result.label).toBe("neutral");
    });

    it("throws when no apiKey provided", async () => {
      await expect(
        classifyEmotion("test", {
          role: "agent",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
        }),
      ).rejects.toThrow();
    });
  });
});
