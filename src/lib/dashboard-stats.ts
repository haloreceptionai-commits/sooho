export interface ChannelStats {
  id: string; title: string; thumb: string; subscribers: number | null; views: number; videos: number;
}
export interface DashboardVideo {
  id: string; title: string; thumb: string; published: string; views: number; likes: number; comments: number;
}
export interface WorkspaceStats {
  id: string; name: string; status: "connected" | "disconnected" | "error"; error: string | null;
  channel: ChannelStats | null; videos: DashboardVideo[];
}
export function dashboardTotals(workspaces: WorkspaceStats[]) {
  const seen = new Set<string>();
  const totals = { views: 0, subscribers: 0, hiddenSubscribers: 0, posted: 0, likes: 0, comments: 0, connected: 0 };
  for (const w of workspaces) {
    const c = w.channel;
    if (w.status !== "connected" || !c || seen.has(c.id)) continue;
    seen.add(c.id);
    totals.connected++;
    totals.views += c.views;
    totals.subscribers += c.subscribers ?? 0;
    if (c.subscribers === null) totals.hiddenSubscribers++;
    totals.posted += c.videos;
    totals.likes += w.videos.reduce((sum, v) => sum + v.likes, 0);
    totals.comments += w.videos.reduce((sum, v) => sum + v.comments, 0);
  }
  return totals;
}