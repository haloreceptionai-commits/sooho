import { describe, expect, it } from "vitest";
import { GOLD_HANNIBAL, GOLD_THEREMIN, shapeIssues } from "@/lib/story-shape";

const RAIL = `Track crews left gaps because hot steel rails grow longer and could buckle. Older jointed track used short rail lengths with small spaces between their ends. In summer, the steel expands, so those gaps shrink and sometimes close. In winter, the steel contracts, and the gaps widen again. That movement keeps dangerous forces from pushing the line sideways. Sleepers, the cross pieces, and the stone bed called ballast add weight and grip to hold the track in place. They resist the push and pull as seasons change, so the rails stay aligned enough for trains. This worked, but the joints clicked and needed regular care. Modern lines often weld rails into long continuous strings. Now fastenings clamp the rail to sleepers so it can't freely expand. The rail still wants to grow in heat, but compressive force holds it close to its set length. The old gaps solved expansion by letting rails move; the new method solves it by holding them steady.`;

describe("story shape v3", () => {
  it("accepts the Theremin gold script", () => expect(shapeIssues(GOLD_THEREMIN).issues).toEqual([]));
  it("accepts the Hannibal gold script", () => expect(shapeIssues(GOLD_HANNIBAL).issues).toEqual([]));
  const rail = shapeIssues(RAIL).issues.join("\n");
  it("rejects the rail hook for giving the answer away", () => expect(rail).toMatch(/hook gives the answer away/));
  it("rejects the rail script's long lecture lines", () => expect(rail).toMatch(/Shape lines/));
  it("rejects the rail script's gap without open questions", () => expect(rail).toMatch(/Shape loops/));
  it("rejects the rail summary ending", () => expect(rail).toMatch(/summary/));
  it("requires the hook to be 8-12 words", () => expect(shapeIssues("Hot rails crack. Why? Heat. Gaps.").issues.join()).toMatch(/hook: 3 words/));
});

import { validateStory, type StoryScene } from "@/lib/story-v2";
describe("shape mode in the story validator", () => {
  const scenes: StoryScene[] = GOLD_THEREMIN.split("\n").map((narration, i) => ({ beat: i === 0 ? "hook" : "reveal", narration, characters: [], shot: "wide", money: i === 0, loop_opened: i === 6 ? "main" : "", loop_closed: i === 10 ? "main" : "" }));
  const base = { scenes, anchors: { year: "1952", place: "Moscow", org: "Soviets", subject: "seal", stakes: "spied" }, question: "How?", hero: { name: "", role: "", want: "" }, cast: [], durationSec: 55 };
  const shaped = validateStory({ ...base, shape: true });
  it("runs the SHAPE check in shape mode", () => expect(shaped.checks.find((c) => c.id === "SHAPE")?.pass).toBe(true));
  it("drops the hero-want quota in shape mode", () => expect(shaped.checks.find((c) => c.id === "V6")?.pass).toBe(true));
  it("keeps the hero-want quota without shape mode", () => expect(validateStory(base).checks.find((c) => c.id === "V6")?.pass).toBe(false));
});
