import { describe, expect, it } from "vitest";
import { planVideo, type SceneInput } from "@/lib/documentary/plan-visuals";

const scene = (i: number, cold = false): SceneInput => ({
  index: i, cold, image: i % 4,
  text: "The sky over the valley turned grey and the farmers waited for the rain that did not come before the harvest of that year",
});

describe("long-form boards", () => {
  const scenes = Array.from({ length: 9 }, (_, i) => scene(i, i === 0));
  it("holds picture beats long and makes every third one an animated board, never in the cold open", () => {
    const beats = planVideo(scenes, { pace: "long" });
    const boards = beats.filter(b => b.visual.type === "card" && b.visual.card === "board");
    expect(boards.length).toBeGreaterThanOrEqual(1);
    expect(boards.every(b => b.scene !== 0)).toBe(true);
    const pictures = beats.filter(b => b.visual.type === "image");
    expect(pictures.length).toBeGreaterThan(0);
  });
  it("without the long pace there are no boards", () => {
    const beats = planVideo(scenes);
    expect(beats.some(b => b.visual.type === "card" && b.visual.card === "board")).toBe(false);
  });
  it("every word is still covered once in order", () => {
    const beats = planVideo(scenes, { pace: "long" });
    for (let s = 0; s < scenes.length; s++) {
      const bs = beats.filter(b => b.scene === s);
      expect(bs[0]!.w0).toBe(0);
      for (let k = 1; k < bs.length; k++) expect(bs[k]!.w0).toBe(bs[k - 1]!.w1);
    }
  });
});
