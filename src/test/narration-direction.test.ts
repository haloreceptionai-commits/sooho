import { describe, expect, it } from "vitest";
import { LONG_NARRATION_DIRECTION, narrationSettings } from "@/lib/narration-direction";

describe("approved narration selection", () => {
  it("uses Puck for new Shorts", () => {
    expect(narrationSettings("short", "A needle points north.").voice).toBe("Puck");
  });
  it("uses the same Shorts selection for Advanced", () => {
    expect(narrationSettings("advanced", "A needle points north.")).toEqual(narrationSettings("short", "A needle points north."));
  });
  it("preserves the long-form Charon selection", () => {
    const take = narrationSettings("long", "Earth is a giant magnet.");
    expect(take.voice).toBe("Charon");
    expect(take.text).toBe(`${LONG_NARRATION_DIRECTION}: Read the following narration aloud, word for word. Narration: Earth is a giant magnet.`);
  });
});