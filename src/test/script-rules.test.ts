import { describe, expect, it } from "vitest";
import { hardWords, soundForWord, wordSoundCues } from "@/lib/sound-words";
import { validateScript } from "@/lib/quality";

describe("sound on spoken words", () => {
  it("'spray' plays a spray sound", () => expect(soundForWord("spray,")).toBe("spray"));
  it("'crashes' plays a crash", () => expect(soundForWord("Crashes!")).toBe("crash"));
  it("plain words play nothing", () => expect(soundForWord("captain")).toBeNull());
  it("spaces cues at least 1.2s apart", () => {
    const cues = wordSoundCues([{ text: "splash", t0: 1 }, { text: "boom", t0: 1.5 }, { text: "boom", t0: 3 }]);
    expect(cues.map((c) => c.at)).toEqual([1, 3]);
  });
});

describe("kid-simple script rules", () => {
  it("flags hard words", () => expect(hardWords("the phenomenon of viscosity")).toEqual(["phenomenon", "viscosity"]));
  it("keeps easy words", () => expect(hardWords("the cook pours oil on the big wave")).toEqual([]));
  const sc = (t: string) => [{ beat: "hook", narration: t }, { beat: "reveal", narration: "Ever like soup." }];
  it("needs re-hook questions", () =>
    expect(validateScript(sc("He pours oil. The sea is mad."), "x", 60).issues.some((i) => i.includes("curiosity questions"))).toBe(true));
  it("needs a false belief broken", () => {
    expect(validateScript(sc("He pours oil."), "x", 60).issues.some((i) => i.includes("false belief"))).toBe(true);
    expect(validateScript(sc("Most people think oil is useless."), "x", 60).issues.some((i) => i.includes("false belief"))).toBe(false);
  });
});

import { hardWords as hw } from "@/lib/sound-words";
describe("kid-level words", () => {
  it("flags grown-up words even when short", () => {
    expect(hw("They conceal the massive vessel")).toEqual(["conceal", "massive", "vessel"]);
  });
  it("keeps simple words", () => {
    expect(hw("They hide the big ship")).toEqual([]);
  });
});
