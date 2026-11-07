import { describe, it, expect } from "vitest";
import { buildStory, TEMPLATES } from "@/lib/story-engine";

const base = { topic: "Constantinople", template: TEMPLATES[0]! };

describe("story engine", () => {
  it("has exactly 5 beats with the Paradox Hook at 0:00", () => {
    const plan = buildStory({ ...base, format: "short", duration: 60, pacing: 50 });
    expect(plan.map((b) => b.key)).toEqual(["hook", "stakes", "defeat", "turn", "payoff"]);
    expect(plan[0].start).toBe(0);
  });

  it("beats end exactly at the chosen duration", () => {
    const plan = buildStory({ ...base, format: "long", duration: 1200, pacing: 30 });
    expect(plan[4].end).toBe(1200);
  });

  it("faster pacing produces more scenes", () => {
    const slow = buildStory({ ...base, format: "long", duration: 600, pacing: 0 }).flatMap((b) => b.scenes);
    const fast = buildStory({ ...base, format: "long", duration: 600, pacing: 100 }).flatMap((b) => b.scenes);
    expect(fast.length).toBeGreaterThan(slow.length);
  });
});
