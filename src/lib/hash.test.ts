import { describe, expect, it } from "vitest";
import { canonicalJson, groundQuote, hashJson, normalizeForMatch } from "./hash";
import type { Turn } from "./types";

const turns: Turn[] = [
  { index: 0, role: "agent", text: "Namaste, main ek AI assistant hoon.", startMs: 0, endMs: 3000 },
  { index: 1, role: "user", text: "Haan boliye.", startMs: 3000, endMs: 4500 },
  { index: 2, role: "agent", text: "Aapke 48,000 rupaye due hain.", startMs: 4500, endMs: 8000 },
];

describe("canonicalJson", () => {
  it("is stable across key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }));
  });
});

describe("normalizeForMatch", () => {
  it("removes punctuation and collapses whitespace", () => {
    expect(normalizeForMatch("  Aapke   ₹48,000 due hain. ")).toBe("aapke ₹48 000 due hain");
  });
});

describe("groundQuote", () => {
  it("accepts a verbatim agent quote", () => {
    const result = groundQuote("Aapke 48,000 rupaye due hain", turns);
    expect(result.ok).toBe(true);
    expect(result.turnIndex).toBe(2);
    expect(result.startMs).toBe(4500);
  });

  it("accepts a quote that differs only in punctuation and case", () => {
    const result = groundQuote("aapke 48,000 rupaye DUE hain.", turns);
    expect(result.ok).toBe(true);
  });

  it("rejects a paraphrase", () => {
    const result = groundQuote("Aap par 48 hazar rupaye ka loan hai", turns);
    expect(result.ok).toBe(false);
  });

  it("rejects a quote that only exists in a user turn", () => {
    const result = groundQuote("Haan boliye", turns);
    expect(result.ok).toBe(false);
  });

  it("rejects a quote shorter than eight characters", () => {
    expect(groundQuote("haan", turns).ok).toBe(false);
  });
});
