import { describe, it, expect, vi } from "vitest";
import {
  classifyEmotion,
  buildClassifierPrompt,
  parseClassifierResponse,
  coerceClassificationResult,
} from "./classifier.js";
import type { ClassificationResult } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

describe("classifier", () => {
  // -----------------------------------------------------------------------
  // buildClassifierPrompt
  // -----------------------------------------------------------------------

  describe("buildClassifierPrompt", () => {
    it("includes the role in the prompt", () => {
      const prompt = buildClassifierPrompt("Hello world", "user", DEFAULT_CONFIG.emotionLabels);
      expect(prompt).toContain("user");
      expect(prompt).toContain("Hello world");
    });

    it("includes available emotion labels", () => {
      const labels = ["happy", "sad", "angry"];
      const prompt = buildClassifierPrompt("test", "assistant", labels);
      expect(prompt).toContain("happy");
      expect(prompt).toContain("sad");
      expect(prompt).toContain("angry");
    });

    it("asks for JSON output", () => {
      const prompt = buildClassifierPrompt("test", "user", DEFAULT_CONFIG.emotionLabels);
      expect(prompt.toLowerCase()).toContain("json");
    });
  });

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
  // classifyEmotion (integration with mock fetch)
  // -----------------------------------------------------------------------

  describe("classifyEmotion", () => {
    it("calls LLM when no classifierUrl is set", async () => {
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
            choices: [
              { message: { content: JSON.stringify(mockResponse) } },
            ],
          }),
      });

      const result = await classifyEmotion(
        "Hello! Great to see you!",
        "user",
        {
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
          fetchFn: mockFetch,
        },
      );

      expect(result.label).toBe("happy");
      expect(result.intensity).toBe(0.7);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("calls external endpoint when classifierUrl is set", async () => {
      const mockResponse = {
        label: "frustrated",
        intensity: 0.6,
        reason: "deployment issues",
        confidence: 0.8,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await classifyEmotion(
        "This deployment keeps failing",
        "user",
        {
          classifierUrl: "https://classifier.example.com/classify",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
          fetchFn: mockFetch,
        },
      );

      expect(result.label).toBe("frustrated");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://classifier.example.com/classify",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns neutral on fetch failure", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));

      const result = await classifyEmotion(
        "test message",
        "user",
        {
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
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
        statusText: "Internal Server Error",
      });

      const result = await classifyEmotion(
        "test",
        "user",
        {
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
          fetchFn: mockFetch,
        },
      );

      expect(result.label).toBe("neutral");
    });

    it("throws when no apiKey and no classifierUrl", async () => {
      await expect(
        classifyEmotion("test", "user", {
          emotionLabels: DEFAULT_CONFIG.emotionLabels,
          confidenceMin: 0.35,
        }),
      ).rejects.toThrow();
    });
  });
});
