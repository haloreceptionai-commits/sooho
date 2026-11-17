import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readState: vi.fn(), exchangeCode: vi.fn(), myChannel: vi.fn(), from: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/youtube.server", () => mocks);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
import { Route } from "@/routes/api/public/youtube/callback";

const callback = (Route as unknown as { server: { handlers: { GET: (args: { request: Request }) => Promise<Response> } } }).server.handlers.GET;

describe("YouTube callback workspace connection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readState.mockResolvedValue("verified-owner");
    mocks.exchangeCode.mockResolvedValue({ refresh_token: "fake-refresh", access_token: "fake-access" });
    mocks.myChannel.mockResolvedValue({ id: "channel", title: "Test channel" });
  });

  it("writes the connection against the owner's oldest workspace primary key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "oldest-workspace" }, error: null }),
    };
    mocks.from.mockImplementation((table: string) => table === "workspaces" ? query : { upsert });
    const response = await callback({ request: new Request("https://sooha.io/api/public/youtube/callback?code=fake&state=fake") });
    expect(query.eq).toHaveBeenCalledWith("user_id", "verified-owner");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "oldest-workspace", user_id: "verified-owner" }), { onConflict: "workspace_id" });
    expect(response.headers.get("Location")).toContain("youtube=connected");
  });

  it("creates Main workspace when the verified owner has none", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "new-workspace" }, error: null }),
    };
    mocks.from.mockImplementation((table: string) => table === "workspaces" ? query : { upsert });
    await callback({ request: new Request("https://sooha.io/api/public/youtube/callback?code=fake&state=fake") });
    expect(query.insert).toHaveBeenCalledWith({ user_id: "verified-owner", name: "Main workspace" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "new-workspace" }), { onConflict: "workspace_id" });
  });

  it("does not access private data when OAuth state is invalid", async () => {
    mocks.readState.mockResolvedValue(null);
    await callback({ request: new Request("https://sooha.io/api/public/youtube/callback?code=fake&state=invalid") });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });
});