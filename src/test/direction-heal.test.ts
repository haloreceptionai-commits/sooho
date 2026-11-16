import { describe, it, expect } from "vitest";
import { sanitizeDirection, cartoonDirection, OUTFITS } from "@/lib/cartoon-job";
describe("cartoon direction self-healing", () => {
  it("normalises model-made character ids so the video is not stopped", () => {
    const d: any = { cast: [{ id: "Soldier 1", seed: 12.5, outfit: OUTFITS[0] }], scenes: [{ world: "landscape", light: "day", action: "hold", expression: "stern", actor: "Soldier 1", wide: false, shot: "wide", move: "hold", mood: "tension", props: [], fx: [], cues: [] }] };
    const out = sanitizeDirection(d, ["Australia sent soldiers."]);
    expect(out.cast[0]!.id).toBe("soldier_1");
    expect(out.scenes[0]!.actor).toBe("soldier_1");
    expect(cartoonDirection.shape.cast.safeParse(out.cast).success).toBe(true);
  });
});
