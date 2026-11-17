import { createFileRoute } from "@tanstack/react-router";

const back = (status: string) => new Response(null, { status: 302, headers: { Location: `https://sooha.io/settings?youtube=${status}` } });

export const Route = createFileRoute("/api/public/youtube/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (url.searchParams.get("error") || !code || !state) return back("cancelled");
    const yt = await import("@/lib/youtube.server");
    const userId = await yt.readState(state);
    if (!userId) return back("expired");
    try {
      const tokens = await yt.exchangeCode(code);
      if (!tokens.refresh_token) return back("no-refresh");
      const channel = await yt.myChannel(tokens.access_token);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: workspace, error: workspaceError } = await supabaseAdmin
        .from("workspaces").select("id").eq("user_id", userId)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle();
      if (workspaceError) throw workspaceError;
      let workspaceId = workspace?.id;
      if (!workspaceId) {
        const { data: created, error: createError } = await supabaseAdmin.from("workspaces")
          .insert({ user_id: userId, name: "Main workspace" }).select("id").single();
        if (createError) throw createError;
        if (!created) throw new Error("Unable to create default workspace");
        workspaceId = created.id;
      }
      const { error } = await supabaseAdmin.from("youtube_connections").upsert({
        workspace_id: workspaceId, user_id: userId, refresh_token: tokens.refresh_token, channel_id: channel?.id ?? null, channel_title: channel?.title ?? null, updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" });
      if (error) throw error;
      return back("connected");
    } catch (e) {
      console.error("YouTube connect failed", e);
      return back("failed");
    }
  } } },
});
