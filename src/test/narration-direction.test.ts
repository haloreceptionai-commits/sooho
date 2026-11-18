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
  it("adds only delivery notes for a documentary chapter mood, never new words or a new voice", () => {
    const plain = narrationSettings("long", "Earth is a giant magnet.");
    const tense = narrationSettings("long:suspense", "Earth is a giant magnet.");
    expect(tense.voice).toBe("Charon");
    expect(tense.text).toContain("hushed");
    expect(tense.text.endsWith("Narration: Earth is a giant magnet.")).toBe(true);
    expect(tense.text).not.toBe(plain.text);
    expect(narrationSettings("long:unknown", "x").text).toBe(narrationSettings("long", "x").text);
  });
});