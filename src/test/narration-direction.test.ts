import { describe, expect, it } from "vitest";
import { LONG_NARRATION_DIRECTION, SHORT_VOICE_SETTINGS, narrationSettings } from "@/lib/narration-direction";

describe("approved narration selection", () => {
  it("keeps informational delivery on the saved voice without added spoken instructions", () => {
    expect(narrationSettings("short", "A needle points north.").text).toBe("A needle points north.");
    expect(SHORT_VOICE_SETTINGS).toEqual({ stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true });
  });
  it("uses the owner's my voice v1 through ElevenLabs for new Shorts", () => {
    const take = narrationSettings("short", "A needle points north.");
    expect(take.voice).toBe("0QHpDjMRrhedmdJmEcp7");
    expect(take.provider).toBe('elevenlabs');
  });
  it("uses the same Shorts selection for Advanced", () => {
    expect(narrationSettings("advanced", "A needle points north.")).toEqual(narrationSettings("short", "A needle points north."));
  });
  it.each(["long", "long:suspense", "long:epic", "long:sad", "long:lofi"])("keeps %s on the history narrator instead of the Shorts narrator", (style) => {
    const text = "Spartacus turned back from the Alps.";
    const take = narrationSettings(style, text);
    expect(take.voice).toBe("Charon");
    expect(take.provider).toBe('lovable');
    expect(take.voice).not.toBe(narrationSettings("short", text).voice);
    expect(take.text.split("Narration: ").at(-1)).toBe(text);
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
    expect(tense.text).toContain("quieter");
    expect(tense.text.endsWith("Narration: Earth is a giant magnet.")).toBe(true);
    expect(tense.text).not.toBe(plain.text);
    expect(narrationSettings("long:unknown", "x").text).toBe(narrationSettings("long", "x").text);
  });
});