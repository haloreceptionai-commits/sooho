import { describe, expect, it } from "vitest";
import { inkPhrases, splitInkBeats } from "@/lib/ink-beats";
import type { PlanScene } from "@/lib/pipeline-operations.server";

const scene = (narration: string, extra: Partial<PlanScene> = {}): PlanScene => ({ beat: "setup", narration, image_prompt: "x", characters: [], camera: "push_in", sfx: "boom", mood: "tension", color: "", angle: "wide", shot: "wide", money: true, loop_opened: "main", loop_closed: "q2", purpose: "", ...extra });

describe("Ink explainer pacing", () => {
  it("cuts narration into phrases of at most 7 words (about 1-2 seconds each)", () => {
    const parts = inkPhrases("Twelve thousand years ago, a hungry hunter walked across a cracked and empty plain, looking for anything that could keep his family alive through the winter.");
    for (const p of parts) expect(p.split(" ").length).toBeLessThanOrEqual(7);
    expect(parts.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps every word in order", () => {
    const text = "The official story says farming made life better. The bones say otherwise.";
    expect(inkPhrases(text).join(" ")).toBe(text);
  });

  it("never ends a phrase on a glue word like 'the' or 'of'", () => {
    const parts = inkPhrases("He picked up the heavy stone of the old river and carried it home to the cave");
    for (const p of parts.slice(0, -1)) expect(["the", "of", "and", "to", "a"]).not.toContain(p.split(" ").pop()!.toLowerCase());
  });

  it("makes every phrase a sticky hard-cut still and keeps story markers once", () => {
    const out = splitInkBeats([scene("Twelve thousand years ago, a hungry hunter walked across a cracked and empty plain.")]);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((s) => s.camera === "hold")).toBe(true);
    expect(out.filter((s) => s.money).length).toBe(1);
    expect(out[0]!.loop_opened).toBe("main");
    expect(out[out.length - 1]!.loop_closed).toBe("q2");
    expect(out.filter((s) => s.sfx).length).toBe(1);
  });
});
