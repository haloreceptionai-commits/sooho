import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderRequest, RENDER_ACTOR, RENDER_LIFETIME_MS, validRenderAssets, type HostedRenderRequest } from "@/lib/hosted-render";
import type { Json } from "@/integrations/supabase/types";
import { getRequest } from "@tanstack/react-start/server";

export const submitHostedRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: HostedRenderRequest) => renderRequest.parse(input))
  .handler(async ({ data, context }) => { const { submitHostedRenderOperation } = await import('./assembly-submit.server'); return submitHostedRenderOperation({ data, context }); });

export async function hashToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

export const cancelHostedRender = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string }) => ({ videoId: renderRequest.shape.videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("render_jobs").select("id,status,run_id").eq("video_id", data.videoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!job || job.status === "done") return { cancelled: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cancelled, error } = await supabaseAdmin.rpc("cancel_render_job", { job_id: job.id, owner_id: context.userId });
    if (error) throw new Error("Could not stop hosted assembly");
    // Cancelling must also switch off the Azure machines (found Nov 16: cancelled renders kept running for ~40 minutes).
    let stopped = 0;
    if (cancelled && job.run_id?.startsWith('azure:')) {
      const { stopCartoonJobExecutions } = await import('@/lib/azure-render');
      stopped = await stopCartoonJobExecutions(job.id).catch((e: unknown) => { console.error('Azure stop failed', e); return 0; });
    }
    return { cancelled, stopped };
  });