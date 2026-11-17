import { describe, expect, it } from "vitest";
import { dashboardTotals, type WorkspaceStats } from "@/lib/dashboard-stats";
const workspace = (id: string, views: number, subscribers: number, posted: number, likes: number): WorkspaceStats => ({
  id, name: id, status: "connected", error: null,
  channel: { id, title: id, thumb: "", views, subscribers, videos: posted },
  videos: [{ id, title: id, thumb: "", published: "2026-11-17", views, likes, comments: 3 }],
});
describe("all-workspace dashboard", () => {
  it("sums views, subscribers, posted videos, likes and comments across workspaces", () => {
    expect(dashboardTotals([workspace("a", 1200, 80, 10, 35), workspace("b", 800, 20, 5, 15)]))
      .toEqual({ views: 2000, subscribers: 100, posted: 15, likes: 50, comments: 6, connected: 2, hiddenSubscribers: 0 });
  });
  it("never double counts the same YouTube channel", () => {
    expect(dashboardTotals([workspace("a", 1200, 80, 10, 35), workspace("a", 1200, 80, 10, 35)]).views).toBe(1200);
  });
  it("excludes unavailable channels rather than inventing statistics", () => {
    const failed = { ...workspace("b", 800, 20, 5, 15), status: "error" as const };
    expect(dashboardTotals([workspace("a", 1200, 80, 10, 35), failed]).posted).toBe(10);
  });
  it("keeps hidden subscriber counts distinct from zero", () => {
    const hidden = workspace("a", 1200, 80, 10, 35);
    if (hidden.channel) hidden.channel.subscribers = null;
    expect(dashboardTotals([hidden]).hiddenSubscribers).toBe(1);
  });
});