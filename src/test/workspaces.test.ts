import { describe, expect, it } from "vitest";
import { cleanName, inWorkspace, nameTaken, NAME_MAX } from "@/lib/workspace-rules";

describe("workspace rules", () => {
  it("cleans names the way the database check expects", () => {
    expect(cleanName("  Space   Facts \n channel ")).toBe("Space Facts channel");
    expect(cleanName("   ")).toBe("");
    expect(cleanName("x".repeat(100))).toHaveLength(NAME_MAX);
  });
  it("puts older videos in the first workspace and new ones where they were made", () => {
    expect(inWorkspace({}, "a", "a")).toBe(true);
    expect(inWorkspace({}, "b", "a")).toBe(false);
    expect(inWorkspace({ workspaceId: "b" }, "b", "a")).toBe(true);
    expect(inWorkspace({ workspaceId: "b" }, "a", "a")).toBe(false);
  });
  it("refuses a duplicate name but allows keeping your own", () => {
    const list = [{ id: "1", name: "Main workspace" }, { id: "2", name: "Space Facts" }];
    expect(nameTaken(list, "space facts")).toBe(true);
    expect(nameTaken(list, "Space Facts", "2")).toBe(false);
    expect(nameTaken(list, "History")).toBe(false);
  });
});
