import { describe, expect, it } from "vitest";
import { seedanceBody, seedanceEstimate, seedanceRuns } from "@/lib/seedance";
import type { PlanScene } from "@/lib/pipeline.functions";

describe("Seedance motion engine", () => {
  it("uses Seedance option three at 720p with no competing narration", () => {
    const b = seedanceBody("A sailor pours oil", "YWJj", 5, true);
    expect(b.model).toBe("bytedance/seedance-2.5");
    expect(b.input.resolution).toBe("720p");
    expect(b.input.generate_audio).toBe(false);
    expect(b.input.image).toBe("data:image/jpeg;base64,YWJj");
    expect(b.input.aspect_ratio).toBe("adaptive");
  });
  it("rejects invalid durations instead of silently submitting them", () => {
    expect(() => seedanceBody("pour oil", "abc", 31, true)).toThrow();
    expect(() => seedanceBody("pour oil", "abc", 3, true)).toThrow();
  });
  it("covers every scene once with short explicit motion groups", () => {
    const scenes = Array.from({ length: 20 }, () => ({ narration: "The sailor pours oil onto the moving water.", image_prompt: "Oil spreads across waves", camera: "push_in" } as PlanScene));
    const runs = seedanceRuns(scenes);
    expect(runs.flatMap(r => r.scenes)).toEqual(scenes.map((_, i) => i));
    expect(runs.every(r => r.seconds >= 4 && r.seconds <= 12)).toBe(true);
    expect(runs[0]?.prompt).toContain("hands interacting with props");
  });
  it("quotes current 720p clip credits, excluding other pipeline work", () => expect(seedanceEstimate(60)).toBe(56));
});