import { describe, it, expect } from "vitest";
import { analyzeScript, countWords, optimizeScript, extractSfx, PACING_MIN, PACING_MAX } from "@/lib/viral-brain";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("viral brain", () => {
  it("flags hooks longer than 12 words", () => {
    const a = analyzeScript("The rails snapped in the summer heat while the whole town watched it happen live. More.");
    expect(a.hook.underLimit).toBe(false);
  });

  it("accepts a 12-word-or-less hook", () => {
    expect(analyzeScript("The rails snapped in the summer heat. More text.").hook.underLimit).toBe(true);
  });

  it("flags greetings in the hook", () => {
    expect(analyzeScript("Hey guys, today we talk about rails. More.").hook.noFluff).toBe(false);
  });

  it("pacing is ideal only within 195–215 words", () => {
    expect(analyzeScript(words(194)).pacing.status).toBe("short");
    expect(analyzeScript(words(195)).pacing.status).toBe("ideal");
    expect(analyzeScript(words(215)).pacing.status).toBe("ideal");
    expect(analyzeScript(words(216)).pacing.status).toBe("long");
  });

  it("bracketed cues don't count as narration words", () => {
    expect(countWords("[SFX: big boom] one two")).toBe(2);
  });

  it("optimizer output lands in the 60-second window and hits all beats", () => {
    const out = optimizeScript("Railroad tracks have small gaps between rails. Steel expands in heat.", "Railroad tracks");
    const n = countWords(out);
    expect(n).toBeGreaterThanOrEqual(PACING_MIN);
    expect(n).toBeLessThanOrEqual(PACING_MAX + 20);
    expect(analyzeScript(out).beats.every((b) => b.score > 0)).toBe(true);
  });

  it("extracts SFX cues for impact words", () => {
    expect(extractSfx("Then the track snapped into the sea.").hits.length).toBeGreaterThan(0);
  });
});
