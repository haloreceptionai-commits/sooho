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
      const { error } = await supabaseAdmin.from("youtube_connections").upsert({
        user_id: userId, refresh_token: tokens.refresh_token, channel_id: channel?.id ?? null, channel_title: channel?.title ?? null, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return back("connected");
    } catch (e) {
      console.error("YouTube connect failed", e);
      return back("failed");
    }
  } } },
});
