import { describe, expect, it } from "vitest";
import { hostedActive, validRenderAssets, renderCallback } from "@/lib/hosted-render";

describe("durable hosted assembly", () => {
  it("keeps an assembly running after browser closure rather than interrupting it", () => {
    expect(hostedActive("submitting")).toBe(true);
    expect(hostedActive("running")).toBe(true);
    expect(hostedActive("saving")).toBe(true);
    expect(hostedActive("done")).toBe(false);
    expect(hostedActive("failed")).toBe(false);
  });
  it("allows only the owner's specific video assets", () => {
    expect(validRenderAssets("owner", "video", ["owner/video/assets/image.png"])).toBe(true);
    expect(validRenderAssets("owner", "video", ["other/video/assets/image.png"])).toBe(false);
    expect(validRenderAssets("owner", "video", ["owner/another/assets/image.png"])).toBe(false);
    expect(validRenderAssets("owner", "video", ["owner/video/../another/image.png"])).toBe(false);
  });
  it("never accepts empty output as a completed video", () => {
    expect(renderCallback.safeParse({ type: "done", duration: 10, mime: "video/webm", size: 0, stats: { lufs: -14, lra: 3, avgShotSec: 3, wordsPerSec: 2.55 } }).success).toBe(false);
    expect(renderCallback.safeParse({ type: "done", duration: 10, mime: "video/webm", size: 12000, stats: { lufs: -14, lra: 3, avgShotSec: 3, wordsPerSec: 2.55 } }).success).toBe(true);
  });
});