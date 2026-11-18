// Starts a documentary render on the Azure fleet. Same safety rules as the other render submits: the owner must own the video, every asset path
// must sit inside that video's folder, an active render is never duplicated, and an uncertain start is left for the watchdog to reconcile.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { cartoonInputKey, startAzureDocumentary } from '@/lib/azure-render';
import { validRenderAssets } from '@/lib/hosted-render';
import { RENDER_CALLBACK_URL } from '@/lib/render-complete';
import { DOC_LIFETIME_MS, documentaryManifest, type DocumentaryRequest } from './documentary-job';
import { manifestProblems } from './validate';

type Db = SupabaseClient<Database>;
const digest = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))), x => x.toString(16).padStart(2, '0')).join('');

/** Fresh signed addresses for everything a render machine needs; used for the first start and again for every automatic restart. */
export async function documentaryInput(admin: Db, job: { id: string; user_id: string; video_id: string; manifest: Json; output_path: string }, token: string) {
  const manifest = job.manifest as unknown as ReturnType<typeof documentaryManifest>;
  const paths = [...new Set([...manifest.doc.images, ...manifest.doc.voice.map(v => v.path)])];
  const bucket = admin.storage.from('videos');
  const signed: Record<string, string> = {};
  for (const p of paths) {
    const { data, error } = await bucket.createSignedUrl(p, 3 * 3600);
    if (error || !data) throw Error('Could not open the saved pictures or narration');
    signed[p] = data.signedUrl;
  }
  const { data: upload, error } = await bucket.createSignedUploadUrl(job.output_path, { upsert: true });
  if (error || !upload) throw Error('Could not prepare the cloud video save');
  return { jobId: job.id, callbackToken: token, callbackUrl: RENDER_CALLBACK_URL, uploadUrl: upload.signedUrl, manifest, signed };
}

export async function submitDocumentaryOperation({ data, context }: { data: DocumentaryRequest; context: { supabase: Db; userId: string } }) {
  const { data: video } = await context.supabase.from('videos').select('data,user_id').eq('id', data.videoId).single();
  if (!video || video.user_id !== context.userId) throw Error('Video not found');
  const problems = manifestProblems(data.doc);
  if (problems.length) throw Error(`The documentary plan is not valid: ${problems.slice(0, 3).join('; ')}`);
  const paths = [...data.doc.images, ...data.doc.voice.map(v => v.path)];
  if (!validRenderAssets(context.userId, data.videoId, paths)) throw Error('Invalid saved video assets');
  const { data: existing } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing && !['failed', 'cancelled'].includes(existing.status)) return { id: existing.id, status: existing.status };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await digest(token);
  const outputPath = `${context.userId}/${data.videoId}/generation-output/${crypto.randomUUID()}.mp4`;
  const manifest = documentaryManifest(data);
  const { data: job, error } = await supabaseAdmin.from('render_jobs').insert({ video_id: data.videoId, user_id: context.userId, token_hash: tokenHash, expires_at: new Date(Date.now() + DOC_LIFETIME_MS).toISOString(), manifest: manifest as unknown as Json, output_path: outputPath }).select('id,user_id,video_id,manifest,output_path').single();
  if (error || !job) {
    const { data: claimed } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (claimed) return { id: claimed.id, status: claimed.status };
    throw Error('Could not reserve the documentary render');
  }
  const event = (status: string, patch: Record<string, Json>) => supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: status, video_patch: { ...patch, hostedRender: { id: job.id, status } } as Json, saved_path: '' });
  try {
    const input = await documentaryInput(supabaseAdmin, job, token);
    const key = cartoonInputKey(job.id, 'finish');
    await supabaseAdmin.from('render_jobs').update({ recovery: { claimedAt: Date.now(), inputKey: key } }).eq('id', job.id);
    try {
      const run = await startAzureDocumentary(job.id, input, key);
      await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).not('status', 'in', '(done,failed,cancelled)');
    } catch (e) {
      // An uncertain start is reconciled by the render watchdog against Azure (and restarted if none exists).
      console.error('Documentary start unconfirmed', e instanceof Error ? e.message : e);
    }
    await event('running', { status: 'running', progress: 72, stage: 'render', detail: 'Documentary render · safe to close your browser' });
    return { id: job.id, status: 'running' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not start the documentary render';
    await event('failed', { status: 'failed', error: message, detail: message });
    throw Error(message);
  }
}
