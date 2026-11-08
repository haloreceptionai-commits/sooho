import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const youtubeStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("youtube_connections").select("channel_title,channel_id").eq("user_id", context.userId).maybeSingle();
    return { connected: !!data, channel: data?.channel_title ?? null, channelId: data?.channel_id ?? null };
  });

export const youtubeConnectUrl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { makeState, authUrl } = await import("./youtube.server");
    return { url: authUrl(await makeState(context.userId)) };
  });

export const youtubeDisconnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("youtube_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

const uploadInput = z.object({
  title: z.string().min(1).max(200), description: z.string().max(6000), tags: z.array(z.string().max(100)).max(40),
  privacy: z.enum(["private", "unlisted", "public"]), short: z.boolean(),
  size: z.number().int().positive().max(256 * 1024 ** 3), mime: z.string().regex(/^video\/[a-z0-9.+-]+$/),
  origin: z.string().url(),
});

export const youtubeStartUpload = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof uploadInput>) => uploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin.from("youtube_connections").select("refresh_token").eq("user_id", context.userId).maybeSingle();
    if (!conn) throw new Error("Connect your YouTube channel in Settings first");
    const yt = await import("./youtube.server");
    const access = await yt.refreshAccess(conn.refresh_token);
    return { uploadUrl: await yt.startUpload(access, data) };
  });
