import { createFileRoute } from "@tanstack/react-router";

const back = (status: string) => new Response(null, { status: 302, headers: { Location: `https://sooha.io/settings?facebook=${status}` } });

export const Route = createFileRoute("/api/public/facebook/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (url.searchParams.get("error") || !code || !state || code.length > 2000) return back("cancelled");
    const fb = await import("@/lib/facebook.server");
    const verified = await fb.readState(state);
    if (!verified) return back("expired");
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ws } = await supabaseAdmin.from("workspaces").select("id").eq("id", verified.workspaceId).eq("user_id", verified.userId).maybeSingle();
      if (!ws) return back("failed");
      const userToken = await fb.exchangeCode(code);
      const pages = await fb.listPages(userToken);
      const page = pages[0];
      if (!page) return back("no-pages");
      const { error } = await supabaseAdmin.from("facebook_connections").upsert({
        workspace_id: ws.id, user_id: verified.userId, page_id: page.id, page_name: page.name,
        page_access_token: page.access_token, user_access_token: userToken, updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" });
      if (error) throw error;
      return back("connected");
    } catch (e) {
      console.error("Facebook connect failed", e);
      return back("failed");
    }
  } } },
});
