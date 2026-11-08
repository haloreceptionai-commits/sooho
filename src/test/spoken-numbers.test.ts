import { describe, expect, it } from "vitest";
import { spellNumbers } from "@/lib/story-v2";
import { hardWords } from "@/lib/sound-words";

describe("cartoon narration numbers and plain words", () => {
  it("speaks years, counts and percents as words", () => {
    expect(spellNumbers("In 1965 at DuPont")).toBe("In nineteen sixty-five at DuPont");
    expect(spellNumbers("3,000 tires and 40% lighter")).toBe("three thousand tires and forty percent lighter");
    expect(spellNumbers("In 2003 and the 1940s")).toBe("In two thousand three and the nineteen forties");
  });

  it("never flags 'Actually' (the myth beat needs it) as a hard word", () => {
    expect(hardWords("Actually she worked carefully")).toEqual([]);
  });
});
