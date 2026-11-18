import { describe, expect, it } from "vitest";
import { FOCUS_PRESETS, meetsViralGate, pickLenses, VIRAL_LENSES, VIRAL_STANDARD, VIRAL_TOPICS } from "@/lib/viral-topics";

describe("viral topics", () => {
  it("ships a curated, unique and well-formed library", () => {
    expect(VIRAL_TOPICS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(VIRAL_TOPICS.map((t) => t.id)).size).toBe(VIRAL_TOPICS.length);
    expect(new Set(VIRAL_TOPICS.map((t) => t.title.toLowerCase())).size).toBe(VIRAL_TOPICS.length);
    for (const t of VIRAL_TOPICS) {
      expect(t.source).toMatch(/^https:\/\//);
      expect(t.fact.length).toBeGreaterThan(40);
      expect(t.title.split(/\s+/).length).toBeGreaterThanOrEqual(4);       // hook titles, not one-word headings
      expect(t.title).not.toMatch(/^(how|why|what)\b/i);                    // never a textbook explainer
    }
  });
  it("gates topics on curiosity, surprise and visual action", () => {
    expect(meetsViralGate({ curiosity: 16, surprise: 15, visual: 14 })).toBe(true);
    expect(meetsViralGate({ curiosity: 16, surprise: 9, visual: 14 })).toBe(false);
    expect(meetsViralGate({ curiosity: 10, surprise: 18, visual: 18 })).toBe(false);
  });
  it("samples different angles each time without repeats", () => {
    const a = pickLenses(4, () => 0.1), b = pickLenses(4, () => 0.9);
    expect(new Set(a).size).toBe(4); expect(a).not.toEqual(b);
    for (const l of [...a, ...b]) expect(VIRAL_LENSES).toContain(l);
  });
  it("rejects textbook topics in the prompt and offers focus presets", () => {
    expect(VIRAL_STANDARD).toMatch(/REJECT/); expect(VIRAL_STANDARD).toMatch(/Why the sky is blue/);
    expect(FOCUS_PRESETS.length).toBeGreaterThanOrEqual(6);
  });
});
