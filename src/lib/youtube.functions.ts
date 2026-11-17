import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Every channel call is scoped to one of the owner's workspaces. */
const ws = z.object({ workspaceId: z.string().uuid() });
type Ws = z.infer<typeof ws>;
const wsInput = (d: Ws) => ws.parse(d);

export const youtubeStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data: input, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("youtube_connections").select("channel_title,channel_id").eq("user_id", context.userId).eq("workspace_id", input.workspaceId).maybeSingle();
    return { connected: !!data, channel: data?.channel_title ?? null, channelId: data?.channel_id ?? null };
  });

export const youtubeConnectUrl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin.from("workspaces").select("id").eq("id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (!own) throw new Error("Workspace not found");
    const { makeState, authUrl } = await import("./youtube.server");
    return { url: authUrl(await makeState(context.userId, data.workspaceId)) };
  });

export const youtubeDisconnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("youtube_connections").delete().eq("user_id", context.userId).eq("workspace_id", data.workspaceId);
    return { ok: true };
  });

const uploadInput = z.object({
  title: z.string().min(1).max(200), description: z.string().max(6000), tags: z.array(z.string().max(100)).max(40),
  privacy: z.enum(["private", "unlisted", "public"]), short: z.boolean(),
  size: z.number().int().positive().max(256 * 1024 ** 3), mime: z.string().regex(/^video\/[a-z0-9.+-]+$/),
  origin: z.string().url(), workspaceId: z.string().uuid(),
});

export const youtubeStartUpload = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof uploadInput>) => uploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin.from("youtube_connections").select("refresh_token").eq("user_id", context.userId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (!conn) throw new Error("Connect this workspace's YouTube channel in Settings first");
    const yt = await import("./youtube.server");
    const access = await yt.refreshAccess(conn.refresh_token);
    return { uploadUrl: await yt.startUpload(access, data) };
  });

async function conn(userId: string, workspaceId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("youtube_connections").select("refresh_token,channel_id,auto_reply,last_auto_reply_at").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle();
  if (!data) throw new Error("Connect this workspace's YouTube channel in Settings first");
  return data;
}

export const youtubeAnalytics = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data: input, context }) => {
    const c = await conn(context.userId, input.workspaceId);
    const yt = await import("./youtube.server");
    const access = await yt.refreshAccess(c.refresh_token);
    const a = await yt.channelAnalytics(access);
    let comments: Awaited<ReturnType<typeof yt.recentComments>> = [], commentError: string | null = null;
    try { comments = await yt.recentComments(access, a.channel.id); }
    catch (e) { commentError = /403|insufficient/i.test(String(e)) ? "Reconnect YouTube in Settings to allow comment access." : String(e).slice(0, 200); }
    const { data: replies } = await context.supabase.from("youtube_replies").select("comment_id,reply,author,comment,created_at,video_id").eq("workspace_id", input.workspaceId).order("created_at", { ascending: false }).limit(50);
    return { ...a, comments, commentError, replies: replies ?? [], autoReply: c.auto_reply, lastAutoReply: c.last_auto_reply_at };
  });

export const youtubeSetAutoReply = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { on: boolean; workspaceId: string }) => z.object({ on: z.boolean(), workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("youtube_connections").update({ auto_reply: data.on }).eq("user_id", context.userId).eq("workspace_id", data.workspaceId);
    return { ok: true };
  });

export const youtubeReplyNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data, context }) => {
    const c = await conn(context.userId, data.workspaceId);
    if (!c.channel_id) throw new Error("Channel not found — reconnect YouTube");
    const { replyToPending } = await import("./youtube-replies.server");
    return replyToPending(context.userId, c.refresh_token, c.channel_id, 20, data.workspaceId);
  });
