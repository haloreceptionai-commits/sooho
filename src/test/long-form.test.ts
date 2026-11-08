import { describe, expect, it } from "vitest";
import { retentionIssues, type StoryScene } from "@/lib/story-v2";
import { ATLAS_WPM, LONG_WPM, narrationWpm } from "@/lib/renderer";

// ~142 wpm => one 14-word scene is about 6s
const scene = (open = "", close = ""): StoryScene => ({ beat: "try", narration: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen", characters: [], shot: "wide", money: false, loop_opened: open, loop_closed: close });

describe("long-form retention", () => {
  it("fails a 5-minute story with no chapter questions", () => {
    const scenes = [scene("main"), ...Array.from({ length: 50 }, () => scene()), scene("", "main")];
    expect(retentionIssues(scenes, 300).length).toBeGreaterThan(0);
  });

  it("passes when a new chapter question opens before the last one closes, every ~60s", () => {
    const scenes: StoryScene[] = [scene("main")];
    for (let c = 1; c <= 5; c++) {
      scenes.push(scene(`c${c}`), ...Array.from({ length: 8 }, () => scene()), scene("", `c${c}`));
    }
    scenes.push(scene("", "main"));
    expect(retentionIssues(scenes, 300)).toEqual([]);
  });

  it("long-form (landscape) uses the calmer narrator pace, Shorts keep Atlas pace", () => {
    expect(narrationWpm(1920, 1080)).toBe(LONG_WPM);
    expect(narrationWpm(1080, 1920)).toBe(ATLAS_WPM);
    expect(LONG_WPM).toBeLessThan(ATLAS_WPM);
  });
});
