import { getRequest } from '@tanstack/react-start/server';
import { CARTOON_LIFETIME_MS, cartoonStart, reviewApproval, reviewMatches, type CartoonStart, type CartoonReview } from '@/lib/cartoon-job';
import { validRenderAssets } from '@/lib/hosted-render';
import type { Json } from '@/integrations/supabase/types';
import { azureStartHealth, startAzureCartoon } from '@/lib/azure-render';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
export const submitCartoonOperation = async ({ data, context }: { data: CartoonStart; context: { supabase: SupabaseClient<Database>; userId: string } }) => {
    const { data: video } = await context.supabase.from('videos').select('data,user_id').eq('id', data.videoId).single();
    if (!video || video.user_id !== context.userId) throw Error('Video not found');
    const record = video.data as Record<string, Json>;
    if ((record['cartoonReview'] as Record<string, Json> | undefined)?.['approved'] === true && record['status'] === 'failed') throw Error('Use Resume render to reuse the approved preview; no new preview was started');
    // The saved video's format must match the job: Shorts render 9:16, long-form 16:9 with map scenes.
    const long = (record['input'] as Record<string, Json>)?.['format'] !== 'short';
    if (long !== (data.format === 'long')) throw Error('Cartoon format does not match this video');
    if (!validRenderAssets(context.userId, data.videoId, [data.voicePath])) throw Error('Invalid narration asset');
    const { data: existing } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    // A failed/cancelled run may be resumed by the owner's explicit click; active runs are never duplicated.
    if (existing && !['failed', 'cancelled'].includes(existing.status)) return { id: existing.id, status: existing.status };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await digest(token);
    const manifest = { ...data, kind: 'cartoon', width: long ? 1920 : 1080, height: long ? 1080 : 1920, checkpoint: { gate: data.gate, hookType: data.hookType, report: data.report, continuity: 1, plan: { characters: data.direction.cast } } };
    const { data: job, error } = await supabaseAdmin.from('render_jobs').insert({ video_id: data.videoId, user_id: context.userId, token_hash: tokenHash, expires_at: new Date(Date.now() + CARTOON_LIFETIME_MS).toISOString(), manifest: manifest as unknown as Json, output_path: `${context.userId}/${data.videoId}/generation-output/${crypto.randomUUID()}.mp4` }).select('id').single();
    if (error || !job) {
      const { data: claimed } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (claimed) return { id: claimed.id, status: claimed.status };
      throw Error('Could not reserve cartoon rendering');
    }
    try {
      const { data: signed, error: signError } = await context.supabase.storage.from('videos').createSignedUrl(data.voicePath, 86400);
      if (signError || !signed) throw Error('Could not open the saved Atlas narration');
      const run = await startAzureCartoon(job.id, 'preflight', { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest, voiceUrl: signed.signedUrl, mode: 'preflight' });
      const { error: trackError } = await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).not('status', 'in', '(done,failed,cancelled)');
      if (trackError) throw Error('Cartoon started but tracking could not be saved; do not resubmit');
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { hostedRender: { id: job.id, status: 'running' }, status: 'running', progress: 72, stage: 'render', detail: 'Cartoon preview · safe to close your browser' }, saved_path: '' });
      return { id: job.id, status: 'running' };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not start cartoon rendering';
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'failed', video_patch: { status: 'failed', error: message, detail: message, hostedRender: { id: job.id, status: 'failed' } }, saved_path: '' });
      throw Error(message);
    }
  };
async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }
function callbackAddress() {
  const origin = new URL(getRequest().url).origin;
  return `${origin.includes('localhost') || origin.includes('id-preview') ? 'https://sooho.lovable.app' : origin}/api/public/render-callback`;
}

/**
 * A preview whose Azure machine failed before the worker ran (nothing written, nothing spent) is restarted with a
 * fresh callback token, at most twice. Anything the worker touched is never restarted automatically.
 */
export async function restartDeadPreflightOperation({ data, context }: { data: { videoId: string }; context: { supabase: SupabaseClient<Database>; userId: string } }) {
  const { data: job } = await context.supabase.from('render_jobs').select('id,status,run_id,manifest,updated_at,user_id').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!job || job.user_id !== context.userId || job.status !== 'running' || !job.run_id?.startsWith('azure:cartoon-preflight')) return { restarted: false };
  if (Date.now() - new Date(job.updated_at).getTime() < 3 * 60_000) return { restarted: false };
  const health = await azureStartHealth(job.id, job.run_id);
  if (!health || health.status !== 'Failed' || health.workerWrote) return { restarted: false, status: health?.status };
  const manifest = job.manifest as Record<string, Json> & { voicePath: string; startAttempts?: number };
  const attempts = Number(manifest.startAttempts ?? 0);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await digest(token);
  if (attempts >= 2) {
    await supabaseAdmin.from('render_jobs').update({ token_hash: tokenHash }).eq('id', job.id);
    const msg = 'Azure could not start the preview machine (nothing was spent). Press Retry.';
    await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'failed', video_patch: { status: 'failed', error: msg, detail: msg, hostedRender: { id: job.id, status: 'failed' } }, saved_path: '' });
    return { restarted: false, failed: true };
  }
  // Claim the restart atomically: only the caller that swaps the exact run id may start a new machine.
  const next = { ...manifest, startAttempts: attempts + 1 };
  const { data: claimed } = await supabaseAdmin.from('render_jobs').update({ token_hash: tokenHash, run_id: `${job.run_id}:restarting`, manifest: next as unknown as Json }).eq('id', job.id).eq('run_id', job.run_id).eq('status', 'running').select('id');
  if (!claimed?.length) return { restarted: false };
  const { data: signed } = await context.supabase.storage.from('videos').createSignedUrl(manifest.voicePath, 86400);
  if (!signed) throw Error('Could not open the saved Atlas narration');
  const run = await startAzureCartoon(job.id, 'preflight', { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest: next, voiceUrl: signed.signedUrl, mode: 'preflight' });
  await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id);
  await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { detail: 'Azure machine failed to start — restarted the preview (nothing was lost)' }, saved_path: '' });
  return { restarted: true };
}
