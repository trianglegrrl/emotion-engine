import { describe, it, expect } from "vitest";
import { extractMessageText } from "./message-content.js";

describe("extractMessageText", () => {
  it("returns trimmed string for string content", () => {
    expect(extractMessageText("  hello  ")).toBe("hello");
    expect(extractMessageText("simple")).toBe("simple");
  });

  it("returns joined text for array of text blocks", () => {
    expect(
      extractMessageText([{ type: "text", text: "one" }, { type: "text", text: "two" }]),
    ).toBe("one two");
    expect(extractMessageText([{ type: "text", text: "  only  " }])).toBe("only");
  });

  it("ignores non-text blocks and invalid entries", () => {
    expect(
      extractMessageText([
        { type: "image", url: "x" },
        { type: "text", text: "ok" },
      ]),
    ).toBe("ok");
    expect(extractMessageText([null, { type: "text", text: "a" }, undefined])).toBe("a");
  });

  it("returns empty string for non-string non-array", () => {
    expect(extractMessageText(null)).toBe("");
    expect(extractMessageText(undefined)).toBe("");
    expect(extractMessageText(123)).toBe("");
    expect(extractMessageText({ type: "text", text: "no" })).toBe("");
  });

  it("returns empty string for empty or whitespace-only", () => {
    expect(extractMessageText("")).toBe("");
    expect(extractMessageText("   ")).toBe("");
    expect(extractMessageText([])).toBe("");
  });
});
