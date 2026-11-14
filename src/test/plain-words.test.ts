import { describe, expect, it } from "vitest";
import { rareWords, kidReadability, wordBudget } from "@/lib/plain-words";

describe("kid-level words", () => {
  it('recognizes ordinary physical words without forcing misleading replacements', () => {
    expect(rareWords('The compass needle twists and swings, then settles.')).toEqual([]);
    expect(rareWords('The needle rests on a pivot.')).toContain('pivot');
  });
  it("flags adult words from the Pig War test", () => {
    expect(rareWords("A pig knocks down a boundary and the dispute starts to escalate.")).toEqual(["boundary", "dispute", "escalate"]);
  });
  it("keeps everyday words and their forms", () => {
    expect(rareWords("The farmer's pig digs up his potatoes, so he grabs his rifle and runs.")).toEqual([]);
  });
  it("allows story names and places", () => {
    expect(rareWords("Lyman Cutlar lives on San Juan Island.", ["Lyman Cutlar", "San Juan Island"])).toEqual([]);
  });
  it("scores readability", () => {
    expect(kidReadability("the pig runs")).toBe(100);
    expect(kidReadability("the territory dispute")).toBe(33);
  });
  it("budgets about 2.6 words a second", () => {
    expect(wordBudget(12)).toBe(31);
    expect(wordBudget(60)).toBe(156);
  });
});
describe("kid-level words: punctuation", () => {
  it("reads contractions and dashes as normal words", () => {
    expect(rareWords("It wasn’t a war—just a big mess. He’ll run.")).toEqual([]);
  });
});
