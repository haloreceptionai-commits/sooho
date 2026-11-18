import { describe, expect, it } from "vitest";
import { longScriptIssues } from "@/lib/documentary/long-script";

const scene = (narration: string) => ({ narration });

describe("long-form opening", () => {
  it("accepts an opening question or a specific number", () => {
    const q = [scene("Why did the rain stop in eighteen seventy-seven?"), scene("This is the story of the drought.")];
    expect(longScriptIssues(q, 60).some(i => i.id === "HOOK_WEAK")).toBe(false);
    const n = [scene("In 1877 the rain did not come."), scene("This is the story of the drought.")];
    expect(longScriptIssues(n, 60).some(i => i.id === "HOOK_WEAK")).toBe(false);
  });
  it("flags a vague opening", () => {
    const v = [scene("Hello and welcome back to the channel."), scene("Today we talk about something big.")];
    expect(longScriptIssues(v, 60).some(i => i.id === "HOOK_WEAK")).toBe(true);
  });
});
