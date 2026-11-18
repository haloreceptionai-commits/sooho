import { describe, expect, it } from "vitest";
import { GOLD_4, GOLD_5, HOOK_PLAYBOOK, RETENTION, goldExamplesFor } from "@/lib/shorts-writer/prompts";

describe("hook and retention prompts", () => {
  it("teaches several hook shapes with hard rules", () => {
    expect(HOOK_PLAYBOOK).toMatch(/IMPOSSIBLE OUTCOME/); expect(HOOK_PLAYBOOK).toMatch(/TRAPPED, SO/); expect(HOOK_PLAYBOOK).toMatch(/NEVER give the reason/);
    expect(RETENTION).toMatch(/MICRO-CLIFFHANGERS/); expect(RETENTION).toMatch(/REPLAY LOOP/); expect(RETENTION).toMatch(/HOOK TO SECOND 8/);
  });
  it("never shows the example that shares the requested topic", () => {
    expect(goldExamplesFor("The Man Who Sold the Eiffel Tower Twice")).not.toContain(GOLD_4);
    expect(goldExamplesFor("The Wave of Molasses That Flooded Boston")).not.toContain(GOLD_5);
  });
  it("shows two examples, the same pair for the same topic, and varies between topics", () => {
    const a = goldExamplesFor("pea whistles"), b = goldExamplesFor("pea whistles");
    expect(a).toHaveLength(2); expect(a).toEqual(b);
    const pairs = new Set(["a", "bridge collapse", "pea whistles", "ancient glass", "a cat in space", "salt", "ink"].map((t) => goldExamplesFor(t).join("|")));
    expect(pairs.size).toBeGreaterThan(1);
  });
  it("gold examples follow the house rules: a hook line first, enough lines, a closing reframe, no questions", () => {
    for (const g of [GOLD_4, GOLD_5]) {
      const lines = g.split("\n");
      expect(lines[0]!.split(/\s+/).length).toBeGreaterThanOrEqual(8); expect(lines[0]!.split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(lines.length).toBeGreaterThanOrEqual(11); expect(lines.at(-1)!.split(/\s+/).length).toBeLessThan(26);
      expect(g).not.toContain("?");
    }
  });
});
