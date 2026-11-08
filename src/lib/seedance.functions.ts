import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { seedanceBody } from "@/lib/seedance";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
type Run = { id?: string; path?: string; error?: string };
async function response(r: Response) {
  const j = await r.json();
  if (!r.ok) throw new Error(`[${r.status}] ${j.error?.message ?? j.message ?? "Seedance request failed"}`);
  return j;
}
function validate(d: { videoId: string; index: number }) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(d.videoId) || !Number.isInteger(d.index) || d.index < 0 || d.index > 500) throw new Error("Invalid video clip");
  return d;
}

export const submitSeedance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { videoId: string; index: number; prompt: string; image: string; seconds: number; portrait: boolean }) => {
    validate(d);
    if (!d.prompt?.trim() || d.prompt.length > 25000 || !d.image || d.image.length > 20_000_000) throw new Error("Invalid Seedance scene");
    seedanceBody(d.prompt, d.image, d.seconds, d.portrait);
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("videos").select("data").eq("id", data.videoId).single();
    if (error || !row) throw new Error("Video not found");
    const record = row.data as unknown as Record<string, unknown> & { seedanceClips?: Record<string, Run> };
    const existing = record.seedanceClips?.[data.index];
    if (existing?.id) return { id: existing.id }; // explicit resume never creates another job
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");
    const j = await response(await fetch(`${GATEWAY}/videos`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(seedanceBody(data.prompt, data.image, data.seconds, data.portrait)) }));
    if (typeof j.id !== "string") throw new Error("Seedance did not return a job ID");
    const next = { ...record, seedanceClips: { ...record.seedanceClips, [data.index]: { id: j.id } } };
    const { error: saveError } = await context.supabase.from("videos").update({ data: next as never }).eq("id", data.videoId);
    if (saveError) throw new Error("Seedance started but its job ID could not be saved. Do not retry; check your connection.");
    return { id: j.id as string };
  });

export const checkSeedance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<{ status: string; progress: number; path?: string; error?: string }> => {
    const { data: row, error } = await context.supabase.from("videos").select("data").eq("id", data.videoId).single();
    if (error || !row) throw new Error("Video not found");
    const record = row.data as unknown as Record<string, unknown> & { seedanceClips?: Record<string, Run> };
    const run = record.seedanceClips?.[data.index];
    if (!run?.id) throw new Error("Seedance job not found");
    if (run.path) return { status: "completed", progress: 100, path: run.path };
    if (run.error) return { status: "failed", progress: 0, error: run.error };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");
    const j = await response(await fetch(`${GATEWAY}/videos/${encodeURIComponent(run.id)}`, { headers: { Authorization: `Bearer ${key}` } }));
    let patch: Run | undefined;
    if (j.status === "failed") patch = { ...run, error: j.error?.message ?? "Seedance clip failed" };
    if (j.status === "completed") {
      const path = `${context.userId}/${data.videoId}/seedance-${data.index}.mp4`;
      const bucket = context.supabase.storage.from("videos");
      const { data: files } = await bucket.list(`${context.userId}/${data.videoId}`, { search: `seedance-${data.index}.mp4` });
      if (!files?.some(f => f.name === `seedance-${data.index}.mp4`)) {
        const r = await fetch(`${GATEWAY}/videos/${encodeURIComponent(run.id)}/content`, { headers: { Authorization: `Bearer ${key}` } });
        if (!r.ok) throw new Error(`[${r.status}] Seedance download failed`);
        const { error: uploadError } = await bucket.upload(path, await r.arrayBuffer(), { contentType: "video/mp4", upsert: false });
        if (uploadError) throw new Error(`Could not save Seedance clip: ${uploadError.message}`);
      }
      patch = { ...run, path };
    }
    if (patch) {
      const { error: saveError } = await context.supabase.from("videos").update({ data: { ...record, seedanceClips: { ...record.seedanceClips, [data.index]: patch } } as never }).eq("id", data.videoId);
      if (saveError) throw new Error("Could not save Seedance progress");
    }
    return { status: j.status, progress: j.progress ?? 0, ...(patch?.path ? { path: patch.path } : {}), ...(patch?.error ? { error: patch.error } : {}) };
  });