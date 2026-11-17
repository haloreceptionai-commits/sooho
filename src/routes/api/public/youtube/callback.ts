import { createFileRoute } from "@tanstack/react-router";

const back = (status: string) => new Response(null, { status: 302, headers: { Location: `https://sooha.io/settings?youtube=${status}` } });

export const Route = createFileRoute("/api/public/youtube/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (url.searchParams.get("error") || !code || !state) return back("cancelled");
    const yt = await import("@/lib/youtube.server");
    const verified = await yt.readState(state);
    if (!verified) return back("expired");
    const userId = verified.userId;
    try {
      const tokens = await yt.exchangeCode(code);
      if (!tokens.refresh_token) return back("no-refresh");
      const channel = await yt.myChannel(tokens.access_token);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // The workspace must belong to the verified owner; old links without one use the owner's first workspace.
      let query = supabaseAdmin.from("workspaces").select("id").eq("user_id", userId);
      if (verified.workspaceId) query = query.eq("id", verified.workspaceId);
      const { data: workspace, error: workspaceError } = await query
        .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle();
      if (verified.workspaceId && !workspace) return back("failed");
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
