import { createFileRoute } from "@tanstack/react-router";

// Scheduled trigger. Takes no input, only answers still-unanswered comments for owners who
// turned auto-reply on, and is throttled per channel, so repeated calls cannot spend extra.
export const Route = createFileRoute("/api/public/youtube/auto-reply")({
  server: { handlers: { POST: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data } = await supabaseAdmin.from("youtube_connections").select("user_id,workspace_id,refresh_token,channel_id,last_auto_reply_at")
      .eq("auto_reply", true).or(`last_auto_reply_at.is.null,last_auto_reply_at.lt.${cutoff}`);
    const { replyToPending } = await import("@/lib/youtube-replies.server");
    let replied = 0;
    for (const c of data ?? []) {
      if (!c.channel_id) continue;
      await supabaseAdmin.from("youtube_connections").update({ last_auto_reply_at: new Date().toISOString() }).eq("workspace_id", c.workspace_id);
      try { replied += (await replyToPending(c.user_id, c.refresh_token, c.channel_id, 20, c.workspace_id)).replied; } catch (e) { console.error("auto-reply", e); }
    }
    return Response.json({ ok: true, replied });
  } } },
});
