import { describe, expect, it } from "vitest";
import { exactDuration, exactLines } from "@/lib/shorts-writer/stage";
import { snapScenesToNarration } from "@/lib/pipeline-operations.server";

const script = "Hannibal was trapped, so he strapped fire to two thousand oxen.\n\n217 BC. Rome has his army cornered in a valley.\n\nThat’s exactly what he wanted.";
describe("owner exact script", () => {
  it("keeps every line exactly as written", () => {
    expect(exactLines(script)).toEqual(["Hannibal was trapped, so he strapped fire to two thousand oxen.", "217 BC. Rome has his army cornered in a valley.", "That’s exactly what he wanted."]);
  });
  it("length follows the Shorts pace of about 153 words a minute", () => expect(exactDuration("word ".repeat(153))).toBe(60));
  it("scene texts are re-cut from the original so punctuation and curly quotes survive", () => {
    const narration = exactLines(script).join(" ");
    const ai = [{ narration: "Hannibal was trapped so he strapped fire to two thousand oxen" }, { narration: "217 BC Rome has his army cornered in a valley" }, { narration: "That's exactly what he wanted" }];
    const out = snapScenesToNarration(ai, narration);
    expect(out.map(s => s.narration).join(" ")).toBe(narration);
    expect(out[2]?.narration).toBe("That’s exactly what he wanted.");
  });
});
