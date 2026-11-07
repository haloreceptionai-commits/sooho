import { describe, expect, it } from "vitest";
import { VOICE_TRIALS } from "@/lib/voice-trials";

describe("approved audition pace", () => {
  const approved = { atlas: 153, rowan: 131, ellis: 148, griffin: 143, milo: 133 };
  for (const [id, wpm] of Object.entries(approved)) {
    it(`keeps ${id}'s approved pace when changing expression`, () => {
      const trial = VOICE_TRIALS.find((voice) => voice.id === id);
      expect(trial?.targetWpm).toBe(wpm);
      expect(trial?.measuredWpm).toBe(wpm);
    });
  }
});