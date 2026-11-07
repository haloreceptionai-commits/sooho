import { describe, expect, it } from "vitest";
import { ATLAS_RATE } from "@/lib/renderer";

describe("Atlas narrator", () => {
  it("uses the approved 0.85 pace for videos", () => expect(ATLAS_RATE).toBe(0.85));
});
