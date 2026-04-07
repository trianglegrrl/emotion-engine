/**
 * Tests for excerpt builder — first N + last N token extraction.
 */

import { describe, it, expect } from "vitest"
import { buildExcerpt } from "./excerpt.js"

describe("buildExcerpt", () => {
  it("returns short messages unchanged", () => {
    const text = "hello world"
    expect(buildExcerpt(text, 10)).toBe("hello world")
  })

  it("returns empty string for empty input", () => {
    expect(buildExcerpt("", 10)).toBe("")
  })

  it("truncates long messages with first+last tokens and [...] separator", () => {
    // 10 tokens, limit=2 => threshold is 4, so 10 > 4 => truncate
    const text = "one two three four five six seven eight nine ten"
    const result = buildExcerpt(text, 2)
    expect(result).toBe("one two [...] nine ten")
  })

  it("returns whole text at exact boundary (2x limit)", () => {
    // 6 tokens, limit=3 => threshold is 6, so 6 <= 6 => return whole text
    const text = "alpha beta gamma delta epsilon zeta"
    expect(buildExcerpt(text, 3)).toBe(text)
  })

  it("respects custom token limit", () => {
    const tokens = Array.from({ length: 20 }, (_, i) => `w${i}`)
    const text = tokens.join(" ")
    const result = buildExcerpt(text, 5)
    expect(result).toBe("w0 w1 w2 w3 w4 [...] w15 w16 w17 w18 w19")
  })

  it("handles text with varied whitespace", () => {
    const text = "  a  b  c  d  e  f  g  h  i  j  "
    const result = buildExcerpt(text, 2)
    expect(result).toBe("a b [...] i j")
  })
})
