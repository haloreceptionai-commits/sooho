import { describe, expect, it } from "vitest";
import { budget, criticPasses, flaggedLines, hookIssues, needsNewSpine, scriptIssues, type Critic } from "@/lib/shorts-writer/checks";
import { applyRewrite } from "@/lib/shorts-writer/orchestrate";
import { GOLD_1 } from "@/lib/shorts-writer/prompts";

const facts = [{ id: "f1", text: "In 217 BC Hannibal was trapped by Rome in a valley; four thousand Roman soldiers guarded the pass. He used two thousand oxen.", certain: true }];
const critic = (o: Partial<Critic> = {}): Critic => ({ lines: [1, 2, 3].map((n) => ({ n, follows: true, clear: true, narration: true, new_fact: true, reason: "" })), hook_reveals_answer: false, ending_makes_sense: true, ending_copies_hook: false, real_twist: true, coherence: 8, clarity: 8, curiosity: 8, summary: "", ...o });

describe("shorts writer length follows the selected duration", () => {
  it("60 seconds is 130-150 words in 12-16 lines", () => expect(budget(60)).toEqual({ minWords: 130, maxWords: 150, minLines: 12, maxLines: 16 }));
  it("30 seconds is 65-75 words", () => expect([budget(30).minWords, budget(30).maxWords]).toEqual([65, 75]));
  it("90 seconds is 195-225 words", () => expect([budget(90).minWords, budget(90).maxWords]).toEqual([195, 225]));
});

describe("shorts writer hard checks", () => {
  it("hook must be 8-12 words", () => expect(hookIssues("Rome waits.")).not.toHaveLength(0));
  it("hook must not be a question", () => expect(hookIssues("Why did a gift with no battery spy for seven years?").join()).toContain("question"));
  it("accepts the gold hook", () => expect(hookIssues("Hannibal was trapped, so he strapped fire to two thousand oxen.")).toEqual([]));
  it("flags a repeated line", () => expect(scriptIssues(["Hannibal was trapped, so he strapped fire to two thousand oxen.", "Rome waits.", "Rome waits."], facts, 60).join()).toContain("repeats"));
  it("flags names not in the certain facts", () => expect(scriptIssues(["Hannibal was trapped, so he strapped fire to two thousand oxen.", "Then Caesar arrives."], facts, 60).join()).toContain("Caesar"));
  it("flags numbers not in the certain facts", () => expect(scriptIssues(["Hannibal was trapped, so he strapped fire to two thousand oxen.", "It was 1850."], facts, 60).join()).toContain("1850"));
  it("does not ban fragments or comparisons", () => expect(scriptIssues(GOLD_1.split("\n"), facts, 60).filter((x) => /fragment|like|metaphor/i.test(x))).toEqual([]));
});

describe("shorts writer critic decisions", () => {
  it("passes at coherence 8 with clear narration", () => expect(criticPasses(critic())).toBe(true));
  it("fails below coherence 8 and asks for a new spine", () => { expect(criticPasses(critic({ coherence: 7 }))).toBe(false); expect(needsNewSpine(critic({ coherence: 7 }))).toBe(true); });
  it("fails when the hook gives the answer away", () => expect(criticPasses(critic({ hook_reveals_answer: true }))).toBe(false));
  it("fails when the ending copies the hook", () => expect(criticPasses(critic({ ending_copies_hook: true }))).toBe(false));
  it("fails a scene-description line", () => { const c = critic(); c.lines[1]!.narration = false; expect(criticPasses(c)).toBe(false); });
  it("never patches the locked hook", () => { const c = critic(); c.lines[0]!.clear = false; c.lines[2]!.new_fact = false; expect(flaggedLines(c)).toEqual([3]); });
  it("rewrites only flagged lines and can delete one", () => expect(applyRewrite(["H", "a", "b", "c"], [{ n: 1, text: "X" }, { n: 2, text: "" }, { n: 3, text: "B" }], [2, 3])).toEqual(["H", "B", "c"]));
});

describe("shorts writer clarity and curiosity floor", () => {
  it("fails when clarity is below 8", () => expect(criticPasses(critic({ clarity: 7 }))).toBe(false));
  it("fails when curiosity is below 8", () => expect(criticPasses(critic({ curiosity: 6 }))).toBe(false));
});

describe("shorts writer patch targets", () => {
  it("includes lines the critic marks as boring", () => expect(flaggedLines(critic({ boring_lines: [2] }))).toEqual([2]));
  it("does not demand a new fact from the closing reframe", () => { const c = critic(); c.lines[2]!.new_fact = false; expect(flaggedLines(c)).toEqual([]); });
  it("restarts the spine when curiosity stays below 8", () => expect(needsNewSpine(critic({ curiosity: 7 }))).toBe(true));
});
