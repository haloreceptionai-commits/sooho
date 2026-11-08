import { createFileRoute } from "@tanstack/react-router";
import { renderCallback } from "@/lib/hosted-render";
import { finalScore } from "@/lib/story-v2";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/render-callback")({
  server: { handlers: { POST: async ({ request }) => {
    const id = request.headers.get("x-render-job"), token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!id || !token || token.length > 200) return new Response("Unauthorized", { status: 401 });
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("render_jobs").select("*").eq("id", id).eq("token_hash", tokenHash).maybeSingle();
    if (!job || Date.parse(job.expires_at) < Date.now()) return new Response("Unauthorized", { status: 401 });
    if (["done", "failed", "cancelled"].includes(job.status)) return Response.json({ accepted: false });
    if (Number(request.headers.get("content-length") ?? 0) > 5000) return new Response("Too large", { status: 413 });
    const parsed = renderCallback.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Invalid callback", { status: 400 });
    const event = parsed.data;
    const { data: row } = await supabaseAdmin.from("videos").select("data").eq("id", job.video_id).eq("user_id", job.user_id).single();
    if (!row) return new Response("Not found", { status: 404 });
    const record = row.data as Record<string, Json>;
    const manifest = job.manifest as unknown as { checkpoint: { gate: Parameters<typeof finalScore>[0]; hookType: string; report: { revealSec: number; shotMix: Record<string, number> }; continuity: number; plan: { characters: unknown[] } }; width: number; height: number; captions: boolean };
    let patch: Record<string, Json>, status = job.status;
    if (event.type === "progress") {
      patch = { progress: Math.max(Number(record["progress"] ?? 72), 72 + Math.round(event.progress * 0.26)), detail: "Hosted assembly · safe to close your browser" };
    } else if (event.type === "failed") {
      status = "failed";
      patch = { status: "failed", error: event.error, detail: "Hosted assembly failed · saved inputs are safe" };
    } else {
      // Never mark done until the actual private file exists.
      const parts = job.output_path.split("/");
      const file = parts.pop();
      if (!file) return new Response("Invalid output", { status: 400 });
      const { data: files, error } = await supabaseAdmin.storage.from("videos").list(parts.join("/"), { search: file });
      if (error || !files?.some(f => f.name === file && Number(f.metadata?.size) === event.size)) return new Response("Output not saved", { status: 409 });
      const fin = finalScore(manifest.checkpoint.gate, { ...event.stats, width: manifest.width, height: manifest.height, captions: manifest.captions });
      status = "done";
      patch = { status: "done", stage: "done", progress: 100, detail: "Ready", error: null, duration: event.duration, mime: event.mime, size: event.size, ready: fin.ready, qa: { score: fin.score, parts: fin.parts }, analytics: { hookType: manifest.checkpoint.hookType, revealSec: manifest.checkpoint.report.revealSec, castSize: manifest.checkpoint.plan.characters.length, shotMix: manifest.checkpoint.report.shotMix, continuity: manifest.checkpoint.continuity } };
    }
    const { error: saveError } = await supabaseAdmin.from("videos").update({ data: { ...record, ...patch, hostedRender: { id: job.id, status } } as Json, ...(status === "done" ? { file_path: job.output_path } : {}) }).eq("id", job.video_id).eq("user_id", job.user_id);
    if (saveError) return new Response("Could not save", { status: 500 });
    const { error: stateError } = await supabaseAdmin.from("render_jobs").update({ status, updated_at: new Date().toISOString(), ...(event.type === "failed" ? { error: event.error } : {}) }).eq("id", job.id).in("status", ["submitting", "running", "saving"]);
    if (stateError) return new Response("Could not save state", { status: 500 });
    return Response.json({ accepted: true });
  } } },
});