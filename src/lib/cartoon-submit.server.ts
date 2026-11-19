import { CARTOON_LIFETIME_MS, cartoonStart, reviewApproval, reviewMatches, type CartoonStart, type CartoonReview } from '@/lib/cartoon-job';
import { validRenderAssets } from '@/lib/hosted-render';
import type { Json } from '@/integrations/supabase/types';
import { startAzureCartoon, cartoonInputKey } from '@/lib/azure-render';
import { RENDER_CALLBACK_URL } from '@/lib/render-complete';
import { rendererFor } from '@/lib/video-engines';
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
    if (!validRenderAssets(context.userId, data.videoId, [data.voicePath, ...(data.cards ?? []).map(c => c.path)])) throw Error('Invalid narration asset');
    if ((data.cards ?? []).some(c => c.path !== `${context.userId}/${data.videoId}/media/card-${c.id}.png`)) throw Error('Invalid character card');
    const { data: existing } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    // A failed/cancelled run may be resumed by the owner's explicit click; active runs are never duplicated.
    if (existing && !['failed', 'cancelled'].includes(existing.status)) return { id: existing.id, status: existing.status };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await digest(token);
    const renderer = rendererFor((record['input'] as Record<string, Json> | undefined)?.['engine']);   // 'cartoon-v2' = Everything World zone sets
    const manifest = { ...data, kind: 'cartoon', width: long ? 1920 : 1080, height: long ? 1080 : 1920, ...(renderer ? { renderer } : {}), checkpoint: { gate: data.gate, hookType: data.hookType, report: data.report, continuity: 1, plan: { characters: data.direction.cast } } };
    const { data: job, error } = await supabaseAdmin.from('render_jobs').insert({ video_id: data.videoId, user_id: context.userId, token_hash: tokenHash, expires_at: new Date(Date.now() + CARTOON_LIFETIME_MS).toISOString(), manifest: manifest as unknown as Json, output_path: `${context.userId}/${data.videoId}/generation-output/${crypto.randomUUID()}.mp4` }).select('id').single();
    if (error || !job) {
      const { data: claimed } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (claimed) return { id: claimed.id, status: claimed.status };
      throw Error('Could not reserve cartoon rendering');
    }
    try {
      const { data: signed, error: signError } = await context.supabase.storage.from('videos').createSignedUrl(data.voicePath, 86400);
      if (signError || !signed) throw Error('Could not open the saved Atlas narration');
      const cardUrls: Record<string, string> = {};
      for (const c of data.cards ?? []) {
        const { data: card, error: cardError } = await context.supabase.storage.from('videos').createSignedUrl(c.path, 86400);
        if (cardError || !card) throw Error('Could not open a saved character card');
        cardUrls[c.id] = card.signedUrl;
      }
      const key = cartoonInputKey(job.id, 'preflight');
      await supabaseAdmin.from('render_jobs').update({ recovery: { claimedAt: Date.now(), inputKey: key } }).eq('id', job.id);
      try {
        const run = await startAzureCartoon(job.id, 'preflight', { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest, voiceUrl: signed.signedUrl, cardUrls, mode: 'preflight' }, key);
        await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).not('status', 'in', '(done,failed,cancelled)');
      } catch (e) {
        // Uncertain starts are reconciled by the render watchdog against Azure (and restarted if none exists).
        console.error('Cartoon preview start unconfirmed', e instanceof Error ? e.message : e);
      }
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { hostedRender: { id: job.id, status: 'running' }, status: 'running', progress: 72, stage: 'render', detail: 'Cartoon preview · safe to close your browser' }, saved_path: '' });
      return { id: job.id, status: 'running' };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not start cartoon rendering';
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'failed', video_patch: { status: 'failed', error: message, detail: message, hostedRender: { id: job.id, status: 'failed' } }, saved_path: '' });
      throw Error(message);
    }
  };
async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }
function callbackAddress() { return RENDER_CALLBACK_URL; }

/**
 * The owner's page asks this while a cartoon render is active. The shared watchdog checks Azure and the worker's
 * saved files, then continues, completes or clearly fails the render — the same check the scheduler runs.
 */
export async function restartDeadPreflightOperation({ data, context }: { data: { videoId: string }; context: { supabase: SupabaseClient<Database>; userId: string } }) {
  const { data: mine } = await context.supabase.from('render_jobs').select('id,user_id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!mine || mine.user_id !== context.userId || !['submitting', 'running', 'saving'].includes(mine.status)) return { restarted: false };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: job } = await supabaseAdmin.from('render_jobs').select('*').eq('id', mine.id).eq('user_id', context.userId).single();
  if (!job || Date.now() - new Date(job.updated_at).getTime() < 2 * 60_000) return { restarted: false };
  const { superviseCartoonJob } = await import('@/lib/render-watchdog.server');
  const d = await superviseCartoonJob(supabaseAdmin, job);
  return { restarted: d.action === 'restart', failed: d.action === 'fail', action: d.action };
}
