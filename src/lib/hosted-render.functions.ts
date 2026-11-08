import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderRequest, RENDER_ACTOR, RENDER_LIFETIME_MS, validRenderAssets, type HostedRenderRequest } from "@/lib/hosted-render";
import type { Json } from "@/integrations/supabase/types";

export const submitHostedRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: HostedRenderRequest) => renderRequest.parse(input))
  .handler(async ({ data, context }) => {
    const { data: video, error } = await context.supabase.from("videos").select("data,user_id").eq("id", data.videoId).single();
    if (error || !video || video.user_id !== context.userId) throw new Error("Video not found");
    const paths = [...data.checkpoint.images, ...data.checkpoint.voice.map(v => v.path), ...data.clips.map(v => v.path)];
    if (!validRenderAssets(context.userId, data.videoId, paths)) throw new Error("Invalid saved video assets");
    if (data.checkpoint.images.length !== data.checkpoint.plan.scenes.length) throw new Error("Scene images are incomplete");
    const n = data.checkpoint.plan.scenes.length;
    if ([...data.checkpoint.voice, ...data.clips].some(c => c.scenes.some(i => i >= n))) throw new Error("Invalid scene order");
    const { data: existing } = await context.supabase.from("render_jobs").select("id,status,run_id,error").eq("video_id", data.videoId).maybeSingle();
    if (existing) {
      if (existing.status === "failed" || existing.status === "cancelled") throw new Error(existing.error ?? "Hosted assembly stopped; saved inputs are safe.");
      return { id: existing.id, status: existing.status };
    }
    const key = process.env["LOVABLE_API_KEY"], connection = process.env["APIFY_API_KEY"];
    if (!key || !connection) throw new Error("Apify is not connected");
    // Privileged writes are restricted to the video ownership just verified through RLS.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await hashToken(token);
    const outputPath = `${context.userId}/${data.videoId}/hosted-output.webm`;
    const record = video.data as Record<string, Json>;
    const portrait = (record["input"] as Record<string, Json>)?.["format"] === "short";
    const manifest = { ...data, width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080 };
    const { data: job, error: claimError } = await supabaseAdmin.from("render_jobs").insert({ video_id: data.videoId, user_id: context.userId, token_hash: tokenHash, expires_at: new Date(Date.now() + RENDER_LIFETIME_MS).toISOString(), manifest: manifest as unknown as Json, output_path: outputPath }).select("id").single();
    if (claimError || !job) {
      const { data: claimed } = await context.supabase.from("render_jobs").select("id,status").eq("video_id", data.videoId).single();
      if (claimed) return { id: claimed.id, status: claimed.status };
      throw new Error("Could not reserve hosted assembly");
    }
    const update = async (status: string, detail: string) => {
      const { error: e } = await supabaseAdmin.from("videos").update({ data: { ...record, hostedRender: { id: job.id, status }, status: status === "failed" ? "failed" : "running", stage: "render", progress: 72, detail, ...(status === "failed" ? { error: detail } : {}) } as Json }).eq("id", data.videoId);
      if (e) throw new Error("Could not save hosted assembly state");
    };
    try {
      await update("submitting", "Sending to hosted assembly…");
      const bucket = context.supabase.storage.from("videos");
      const signed: Record<string, string> = {};
      for (const path of new Set(paths)) {
        const { data: url, error: signError } = await bucket.createSignedUrl(path, 3600);
        if (signError || !url) throw new Error("Could not grant access to saved video assets");
        signed[path] = url.signedUrl;
      }
      const { data: upload, error: uploadError } = await bucket.createSignedUploadUrl(outputPath, { upsert: true });
      if (uploadError || !upload) throw new Error("Could not prepare cloud video save");
      const base = "https://project--2217d7bc-796a-4378-a377-45a65c909798-dev.lovable.app";
      const callbackUrl = `${base}/api/public/render-callback`;
      const response = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${RENDER_ACTOR}/runs?memory=4096&timeout=1200`, {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": connection, "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, callbackToken: token, callbackUrl, uploadUrl: upload.signedUrl, manifest, signed }),
      });
      const raw = await response.text();
      if (!response.ok) { console.error("Hosted assembly rejected", response.status, raw); throw new Error(`Hosted assembly could not start [${response.status}]`); }
      const run = JSON.parse(raw)?.data;
      if (!run?.id) throw new Error("Hosted assembly did not return a run ID; do not resubmit");
      const { error: saveError } = await supabaseAdmin.from("render_jobs").update({ run_id: run.id, status: "running" }).eq("id", job.id).eq("status", "submitting");
      if (saveError) throw new Error("Hosted assembly started but its tracking could not be saved; do not resubmit");
      await update("running", "Hosted assembly · safe to close your browser");
      return { id: job.id, status: "running" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Hosted assembly could not start";
      await supabaseAdmin.from("render_jobs").update({ status: "failed", error: message }).eq("id", job.id).eq("status", "submitting");
      await update("failed", message);
      throw new Error(message);
    }
  });

export async function hashToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

export const cancelHostedRender = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string }) => ({ videoId: renderRequest.shape.videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("render_jobs").select("id,status,run_id").eq("video_id", data.videoId).maybeSingle();
    if (!job || job.status === "done") return { cancelled: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("render_jobs").update({ status: "cancelled", error: "Removed from queue" }).eq("id", job.id).eq("user_id", context.userId).neq("status", "done");
    if (error) throw new Error("Could not stop hosted assembly");
    const { data: row } = await context.supabase.from("videos").select("data").eq("id", data.videoId).single();
    if (row) await supabaseAdmin.from("videos").update({ data: { ...(row.data as Record<string, Json>), status: "failed", removed: true, detail: "Removed from queue", error: "Removed from queue", hostedRender: { id: job.id, status: "cancelled" } } as Json }).eq("id", data.videoId).eq("user_id", context.userId);
    return { cancelled: true };
  });