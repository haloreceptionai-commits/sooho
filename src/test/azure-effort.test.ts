import { describe, it, expect } from "vitest";
import { effortFor } from "@/lib/azure-effort";
describe("Azure reasoning effort per model", () => {
  it("keeps none for gpt-5", () => expect(effortFor("gpt-5", "none")).toBe("none"));
  it("uses low for gpt-6.1-sol", () => expect(effortFor("gpt-6.1-sol", "none")).toBe("low"));
  it("keeps chosen levels", () => expect(effortFor("gpt-6.1-sol", "medium")).toBe("medium"));
});
