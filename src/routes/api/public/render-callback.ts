import { createFileRoute } from "@tanstack/react-router";
import { renderCallback } from "@/lib/hosted-render";
import { finalScore } from "@/lib/story-v2";
import type { Json } from "@/integrations/supabase/types";
import { cartoonReviewEvent } from '@/lib/cartoon-job';
import { validRenderAssets } from '@/lib/hosted-render';
import { z } from 'zod';

export const Route = createFileRoute("/api/public/render-callback")({
  server: { handlers: { POST: async ({ request }) => {
    const id = request.headers.get("x-render-job"), token = request.headers.get("x-render-token");
    if (!id || !token || token.length > 200) return new Response("Unauthorized", { status: 401 });
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("render_jobs").select("*").eq("id", id).eq("token_hash", tokenHash).maybeSingle();
    if (!job || Date.parse(job.expires_at) < Date.now()) return new Response("Unauthorized", { status: 401 });
    if (job.status === 'done') return Response.json({ accepted: true, status: 'done' });
    if (["failed", "cancelled"].includes(job.status)) return Response.json({ accepted: false });
    if (Number(request.headers.get("content-length") ?? 0) > 5000) return new Response("Too large", { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return new Response('Invalid callback', { status: 400 });
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 12000) { await reader.cancel(); return new Response('Too large', { status: 413 }); } chunks.push(next.value); }
    const payload = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(payload)); } catch { return new Response('Invalid callback', { status: 400 }); }
    const kind = (job.manifest as Record<string, Json>)['kind'];
    if (kind === 'cartoon') {
      const grants = z.object({ type: z.literal('assets'), files: z.array(z.object({ name: z.string().regex(/^(sheet-\d{2}\.jpg|alignment\.json|voice\.wav|manifest\.json|output\.mp4|output\.qa\.json|mix-report\.json|checkpoint\.json)$/) })).min(1).max(40) }).safeParse(body);
      if (grants.success) {
        const uploads: Record<string, { path: string; url: string }> = {};
        for (const file of grants.data.files) {
          const finalAsset = ['output.mp4', 'output.qa.json', 'mix-report.json'].includes(file.name);
          if (finalAsset && !(job.manifest as Record<string, Json>)['kind']) return new Response('Invalid stage', { status: 409 });
          const { data: ownerVideo } = await supabaseAdmin.from('videos').select('data').eq('id', job.video_id).single();
          const approved = (ownerVideo?.data as Record<string, Json>)?.['cartoonReview'] as Record<string, Json> | undefined;
          if ((finalAsset && approved?.['approved'] !== true) || (!finalAsset && job.status === 'review')) return new Response('Invalid upload stage', { status: 409 });
          const path = file.name === 'output.mp4' ? job.output_path : `${job.user_id}/${job.video_id}/cartoon/${file.name}`;
          const { data: grant, error } = await supabaseAdmin.storage.from('videos').createSignedUploadUrl(path, { upsert: true });
          if (error || !grant) return new Response('Could not grant upload', { status: 500 });
          uploads[file.name] = { path, url: grant.signedUrl };
        }
        return Response.json({ accepted: true, uploads });
      }
      const review = cartoonReviewEvent.safeParse(body);
      if (review.success) {
        const { type: _type, ...value } = review.data;
        if (!validRenderAssets(job.user_id, job.video_id, [...value.sheets, value.alignmentPath, value.voicePath])) return new Response('Invalid review paths', { status: 400 });
        for (const path of [...value.sheets, value.alignmentPath, value.voicePath]) {
          const parts = path.split('/'), name = parts.pop();
          if (!name) return new Response('Invalid review path', { status: 400 });
          const { data: files } = await supabaseAdmin.storage.from('videos').list(parts.join('/'), { search: name });
          if (!files?.some(f => f.name === name && Number(f.metadata?.size) > 0)) return new Response('Review not saved', { status: 409 });
        }
        const { data: accepted, error } = await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'review', video_patch: { cartoonReview: { ...value, approved: false }, progress: 75, detail: 'Review cartoon preview and narration timing', hostedRender: { id: job.id, status: 'review' } } as Json, saved_path: '' });
        return error ? new Response('Could not save review', { status: 500 }) : Response.json({ accepted });
      }
    }
    const parsed = renderCallback.safeParse(body);
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
      const fin = finalScore(manifest.checkpoint.gate, { ...event.stats, width: manifest.width, height: manifest.height, captions: kind === 'cartoon' ? true : manifest.captions });
      status = "done";
      patch = { status: "done", stage: "done", progress: 100, detail: "Ready", error: null, duration: event.duration, mime: event.mime, size: event.size, ready: fin.ready, qa: { score: fin.score, parts: fin.parts }, analytics: { hookType: manifest.checkpoint.hookType, revealSec: manifest.checkpoint.report.revealSec, castSize: manifest.checkpoint.plan.characters.length, shotMix: manifest.checkpoint.report.shotMix, continuity: manifest.checkpoint.continuity } };
    }
    const { data: accepted, error: saveError } = await supabaseAdmin.rpc("apply_render_event", { job_id: job.id, job_token: tokenHash, next_status: status, video_patch: { ...patch, hostedRender: { id: job.id, status } } as Json, saved_path: status === "done" ? job.output_path : "" });
    if (saveError) return new Response("Could not save", { status: 500 });
    return Response.json({ accepted });
  } } },
});