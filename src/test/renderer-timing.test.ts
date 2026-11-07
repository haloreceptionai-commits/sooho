import { describe, it, expect } from "vitest";
import { timeline } from "@/lib/renderer";

describe("narration timeline", () => {
  it("splits one recording across its scenes in order, covering the whole take", () => {
    const tl = timeline([{ scenes: [0, 1], dur: 4, start: 1 }], ["one two three", "four five six"]);
    expect(tl[0]!.start).toBe(1);
    expect(tl[0]!.end).toBeCloseTo(tl[1]!.start);
    expect(tl[1]!.end).toBeCloseTo(5);
    expect(tl[0]!.words.map((w) => w.text)).toEqual(["one", "two", "three"]);
  });
  it("gives longer words more time", () => {
    const tl = timeline([{ scenes: [0], dur: 3, start: 0 }], ["a extraordinarily"]);
    const [a, b] = tl[0]!.words;
    expect(b!.t1 - b!.t0).toBeGreaterThan(a!.t1 - a!.t0);
  });
});

import { paceRate } from "@/lib/renderer";
describe("Atlas pace fitting", () => {
  it("speeds a slow 40s take of 76 words to ~30s (153 wpm)", () => expect(paceRate(40, (76 * 60) / 153)).toBeCloseTo(1.34, 1));
  it("never stretches beyond natural limits", () => expect(paceRate(100, 30)).toBe(1.45));
});
