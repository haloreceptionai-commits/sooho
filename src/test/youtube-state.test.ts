import { beforeAll, describe, expect, it } from "vitest";

// The signed OAuth state binds a channel connection to one owner AND one of their workspaces.
describe("YouTube OAuth state", () => {
  beforeAll(() => { process.env["YOUTUBE_STATE_SECRET"] = "test-secret"; });
  const user = "11111111-1111-4111-8111-111111111111", ws = "22222222-2222-4222-8222-222222222222";
  it("round-trips the owner and the workspace", async () => {
    const { makeState, readState } = await import("@/lib/youtube.server");
    expect(await readState(await makeState(user, ws))).toEqual({ userId: user, workspaceId: ws });
  });
  it("rejects a tampered workspace or signature", async () => {
    const { makeState, readState } = await import("@/lib/youtube.server");
    const state = await makeState(user, ws);
    expect(await readState(state.replace(ws, "33333333-3333-4333-8333-333333333333"))).toBeNull();
    expect(await readState(state.slice(0, -2) + "00")).toBeNull();
    expect(await readState("nope")).toBeNull();
  });
});
