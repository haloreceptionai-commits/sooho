import { describe, expect, it } from "vitest";
import { emphasisIndex, qaScore, scoreTopic5, validateScript } from "@/lib/quality";

const scene = (beat: string, n: number, extra = "") => ({ beat, narration: `${extra} ${"word ".repeat(n)}`.trim() + "." });

describe("script checker", () => {
  it("flags a reveal outside 60-72%", () => {
    const sc = [scene("hook", 20), scene("reveal", 100, "Ever like"), scene("proof", 20), scene("payoff", 13)];
    expect(validateScript(sc, "loop", 60).issues.some((i) => i.startsWith("Reveal starts"))).toBe(true);
  });
  it("rejects greetings", () => {
    const sc = [scene("hook", 5, "Hey guys welcome back")];
    expect(validateScript(sc, "x", 60).issues).toContain("Opens with a greeting or 'did you know'");
  });
  it("requires a closing loop line", () => {
    expect(validateScript([scene("hook", 5)], "", 60).issues).toContain("No closing loop line");
  });
});

describe("topic tests", () => {
  it("pass needs 18 of 25", () => {
    const r = scoreTopic5("Why Sailors Carried Storm Oil");
    expect(r.pass).toBe(r.total >= 18);
  });
});

describe("caption emphasis", () => {
  it("highlights numbers first", () => expect(emphasisIndex(["fifty", "yards", "behind"])).toBe(0));
  it("highlights the key noun", () => expect(emphasisIndex(["the", "pirates"])).toBe(1));
});

describe("quality score", () => {
  it("warns under 80 when resolution is below 1080", () => {
    const base = { hookScore: 36, revealPos: 0.66, factConfidence: 1, wordsPerSec: 2.6, avgShotSec: 3, captions: true, lufs: -14, lra: 5, loopLine: true, width: 1080, height: 1920 };
    expect(qaScore(base).score).toBe(100);
    expect(qaScore({ ...base, width: 360, height: 640 }).score).toBe(90);
  });
});
