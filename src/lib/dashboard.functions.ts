import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkspaceStats } from "./dashboard-stats";

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: workspaces, error } = await context.supabase.from("workspaces").select("id,name").order("created_at").order("id");
    if (error) throw new Error("Could not load your workspaces. Please try again.");
    // Tokens are service-only; scope this privileged read to the authenticated owner.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: connections, error: connectionError } = await supabaseAdmin.from("youtube_connections")
      .select("workspace_id,refresh_token").eq("user_id", context.userId);
    if (connectionError) throw new Error("Could not load your YouTube connections. Please try again.");
    const yt = await import("./youtube.server");
    const rows: WorkspaceStats[] = [];
    for (let i = 0; i < (workspaces ?? []).length; i += 3) {
      rows.push(...await Promise.all((workspaces ?? []).slice(i, i + 3).map(async (w): Promise<WorkspaceStats> => {
        const base = { id: w.id, name: w.name, channel: null, videos: [], error: null };
        const connection = connections?.find((c) => c.workspace_id === w.id);
        if (!connection) return { ...base, status: "disconnected" };
        try {
          const access = await yt.refreshAccess(connection.refresh_token);
          return { ...base, ...await yt.channelAnalytics(access, true), status: "connected" };
        } catch {
          return { ...base, status: "error", error: "YouTube statistics are unavailable. Try refreshing or reconnect this channel in Settings." };
        }
      })));
    }
    return { workspaces: rows, updatedAt: new Date().toISOString() };
  });