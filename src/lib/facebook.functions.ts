import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ws = z.object({ workspaceId: z.string().uuid() });
const wsInput = (d: z.infer<typeof ws>) => ws.parse(d);

async function row(userId: string, workspaceId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("facebook_connections").select("page_id,page_name,page_access_token,user_access_token").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle();
  return data;
}

export const facebookStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data, context }) => {
    const c = await row(context.userId, data.workspaceId);
    if (!c) return { connected: false as const };
    const fb = await import("./facebook.server");
    let stats: Awaited<ReturnType<typeof fb.pageStats>> | null = null, pages: { id: string; name: string }[] = [], error: string | null = null;
    try { stats = await fb.pageStats(c.page_access_token, c.page_id); } catch (e) { error = "Facebook did not answer — try reconnecting."; console.error(e); }
    if (c.user_access_token) { try { pages = (await fb.listPages(c.user_access_token)).map((p) => ({ id: p.id, name: p.name })); } catch { /* token expired: reconnect */ } }
    return { connected: true as const, pageId: c.page_id, pageName: c.page_name, stats, pages, error };
  });

export const facebookConnectUrl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin.from("workspaces").select("id").eq("id", data.workspaceId).eq("user_id", context.userId).maybeSingle();
    if (!own) throw new Error("Workspace not found");
    const fb = await import("./facebook.server");
    return { url: fb.authUrl(await fb.makeState(context.userId, data.workspaceId)) };
  });

export const facebookSelectPage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; pageId: string }) => z.object({ workspaceId: z.string().uuid(), pageId: z.string().regex(/^\d{1,30}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await row(context.userId, data.workspaceId);
    if (!c?.user_access_token) throw new Error("Reconnect Facebook first");
    const fb = await import("./facebook.server");
    const page = (await fb.listPages(c.user_access_token)).find((p) => p.id === data.pageId);
    if (!page) throw new Error("That Page is not available on this Facebook account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("facebook_connections").update({ page_id: page.id, page_name: page.name, page_access_token: page.access_token, updated_at: new Date().toISOString() })
      .eq("user_id", context.userId).eq("workspace_id", data.workspaceId);
    return { ok: true };
  });

export const facebookDisconnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(wsInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("facebook_connections").delete().eq("user_id", context.userId).eq("workspace_id", data.workspaceId);
    return { ok: true };
  });
