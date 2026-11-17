import { afterEach, describe, expect, it, vi } from "vitest";
import { channelAnalytics } from "@/lib/youtube.server";

afterEach(() => vi.unstubAllGlobals());
function api() {
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url);
    let data: unknown;
    if (path.pathname.endsWith("/channels")) {
      data = { items: [{ id: "channel", snippet: { title: "Test" }, statistics: { viewCount: "5500", subscriberCount: "99", videoCount: "55" }, contentDetails: { relatedPlaylists: { uploads: "uploads" } } }] };
    } else if (path.pathname.endsWith("/playlistItems")) {
      const second = path.searchParams.has("pageToken");
      data = { items: Array.from({ length: second ? 5 : 50 }, (_, i) => ({ contentDetails: { videoId: String(i + (second ? 50 : 0)) } })), ...(second ? {} : { nextPageToken: "page-two" }) };
    } else {
      data = { items: (path.searchParams.get("id") ?? "").split(",").map(id => ({ id, snippet: { title: id, publishedAt: "2026-11-17" }, statistics: { viewCount: "100", likeCount: "2", commentCount: "1" }, contentDetails: { duration: "PT1M" } })) };
    }
    return new Response(JSON.stringify(data));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
describe("dashboard full-upload statistics", () => {
  it("includes likes and comments beyond the first 50 uploads", async () => {
    api();
    const result = await channelAnalytics("test-access", true);
    expect(result.videos).toHaveLength(55);
    expect(result.videos.reduce((sum, v) => sum + v.likes, 0)).toBe(110);
    expect(result.videos.reduce((sum, v) => sum + v.comments, 0)).toBe(55);
    expect(result.channel.views).toBe(5500);
  });
  it("preserves the existing analytics page's latest-50 behavior", async () => {
    api();
    expect((await channelAnalytics("test-access")).videos).toHaveLength(50);
  });
});