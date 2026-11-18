import { describe, expect, it } from "vitest";
import { headlineScore } from "@/lib/thumbnail-text";
import { lockConcept, scoreConcept, type PackagingConcept } from "@/lib/documentary/packaging";

describe("thumbnail headline", () => {
  it("rewards short, concrete headlines", () => {
    expect(headlineScore("FAKE GIANT").score).toBeGreaterThan(headlineScore("THE STORY OF THE").score);
    expect(headlineScore("1869 HOAX").score).toBeGreaterThan(headlineScore("interesting history video").score);
  });
  it("flags long and filler-heavy headlines", () => {
    expect(headlineScore("the story of the very old town of the king").notes.length).toBeGreaterThan(0);
  });
  it("the concept with the strongest headline wins when titles tie", () => {
    const base: PackagingConcept = { title: "The Man Who Sold the Eiffel Tower Twice", thumb_text: "", focal_subject: "a shocked man", emotion: "shock", layout: "face",
      promise: "a con man sold the Eiffel Tower to scrap dealers twice", gap: "how one man sold a landmark" };
    const weak = scoreConcept({ ...base, thumb_text: "the story" }).score;
    const strong = scoreConcept({ ...base, thumb_text: "FAKE GIANT" }).score;
    expect(strong).toBeGreaterThan(weak);
    expect(lockConcept([{ ...base, thumb_text: "the story" }, { ...base, thumb_text: "FAKE GIANT" }])?.thumb_text).toBe("FAKE GIANT");
  });
});
