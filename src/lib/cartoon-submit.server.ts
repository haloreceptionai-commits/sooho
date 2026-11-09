import { getRequest } from '@tanstack/react-start/server';
import { CARTOON_LIFETIME_MS, cartoonStart, reviewApproval, reviewMatches, type CartoonStart, type CartoonReview } from '@/lib/cartoon-job';
import { validRenderAssets } from '@/lib/hosted-render';
import type { Json } from '@/integrations/supabase/types';
import { startAzureCartoon } from '@/lib/azure-render';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
export const submitCartoonOperation = async ({ data, context }: { data: CartoonStart; context: { supabase: SupabaseClient<Database>; userId: string } }) => {
    const { data: video } = await context.supabase.from('videos').select('data,user_id').eq('id', data.videoId).single();
    if (!video || video.user_id !== context.userId) throw Error('Video not found');
    const record = video.data as Record<string, Json>;
    if ((record['cartoonReview'] as Record<string, Json> | undefined)?.['approved'] === true && record['status'] === 'failed') throw Error('Use Resume render to reuse the approved preview; no new preview was started');
    if ((record['input'] as Record<string, Json>)?.['format'] !== 'short') throw Error('Cartoon rendering currently supports Shorts only');
    if (!validRenderAssets(context.userId, data.videoId, [data.voicePath])) throw Error('Invalid narration asset');
    const { data: existing } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    // A failed/cancelled run may be resumed by the owner's explicit click; active runs are never duplicated.
    if (existing && !['failed', 'cancelled'].includes(existing.status)) return { id: existing.id, status: existing.status };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await digest(token);
    const manifest = { ...data, kind: 'cartoon', width: 1080, height: 1920, checkpoint: { gate: data.gate, hookType: data.hookType, report: data.report, continuity: 1, plan: { characters: data.direction.cast } } };
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
