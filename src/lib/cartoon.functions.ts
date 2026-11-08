import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { CARTOON_LIFETIME_MS, cartoonStart, reviewApproval, reviewMatches, type CartoonStart, type CartoonReview } from '@/lib/cartoon-job';
import { validRenderAssets } from '@/lib/hosted-render';
import type { Json } from '@/integrations/supabase/types';

export const CARTOON_ACTOR = 'nifty_remnant~chronicle-cartoon-renderer';

export const recoverCartoonReview = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string }) => ({ videoId: reviewApproval.shape.videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from('render_jobs').select('*').eq('video_id', data.videoId).single();
    if (!job || job.user_id !== context.userId || job.status !== 'failed' || job.error !== 'Cloud callback unavailable' || !job.run_id) throw Error('No saved preview can be recovered');
    const key = process.env['LOVABLE_API_KEY'], connection = process.env['APIFY_API_KEY'];
    if (!key || !connection) throw Error('Apify is not connected');
    const get = async (path: string) => {
      const r = await fetch(`https://connector-gateway.lovable.dev/apify${path}`, { headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection } });
      if (!r.ok) throw Error(`Saved cartoon preview could not load [${r.status}]`);
      return r.json();
    };
    const stores = await get('/key-value-stores?limit=100');
    const store = stores.data.items.find((s: { name: string }) => s.name === `cartoon-${job.id}`);
    if (!store) throw Error('Saved cartoon inputs not found');
    const lock = await get(`/key-value-stores/${store.id}/records/LOCK`);
    if (lock.jobId !== job.id || !/^[a-f0-9]{64}$/.test(lock.hash)) throw Error('Saved preview does not match this job');
    const root = `${context.userId}/${data.videoId}/cartoon`;
    const { data: files, error } = await context.supabase.storage.from('videos').list(root);
    if (error || !files) throw Error('Could not inspect saved cartoon assets');
    const sheets = files.filter(f => /^sheet-\d{2}\.jpg$/.test(f.name)).map(f => `${root}/${f.name}`).sort();
    if (!sheets.length || !['voice.wav', 'alignment.json', 'manifest.json'].every(name => files.some(f => f.name === name && Number(f.metadata?.size) > 0))) throw Error('Saved cartoon preview is incomplete');
    const { data: voiceManifest } = await context.supabase.storage.from('videos').download(`${root}/manifest.json`);
    if (!voiceManifest) throw Error('Saved voice clock is missing');
    const m = JSON.parse(await voiceManifest.text());
    const review = { hash: lock.hash, storeId: store.id, sheets, voicePath: `${root}/voice.wav`, alignmentPath: `${root}/alignment.json`, duration: m.narration.samples / 48000, approved: false };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: accepted, error: recoverError } = await supabaseAdmin.rpc('recover_cartoon_review', { job_id: job.id, owner_id: context.userId, saved_review: review as Json });
    if (recoverError || !accepted) throw Error('Preview recovery was not accepted');
    return { accepted: true };
  });

export const submitCartoon = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: CartoonStart) => cartoonStart.parse(input))
  .handler(async ({ data, context }) => {
    const { data: video } = await context.supabase.from('videos').select('data,user_id').eq('id', data.videoId).single();
    if (!video || video.user_id !== context.userId) throw Error('Video not found');
    const record = video.data as Record<string, Json>;
    if ((record['input'] as Record<string, Json>)?.['format'] !== 'short') throw Error('Cartoon rendering currently supports Shorts only');
    if (!validRenderAssets(context.userId, data.videoId, [data.voicePath])) throw Error('Invalid narration asset');
    const { data: existing } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).maybeSingle();
    if (existing) return { id: existing.id, status: existing.status };
    const key = process.env['LOVABLE_API_KEY'], connection = process.env['APIFY_API_KEY'];
    if (!key || !connection) throw Error('Apify is not connected');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await digest(token);
    const manifest = { ...data, kind: 'cartoon', width: 1080, height: 1920, checkpoint: { gate: data.gate, hookType: data.hookType, report: data.report, continuity: 1, plan: { characters: data.direction.cast } } };
    const { data: job, error } = await supabaseAdmin.from('render_jobs').insert({ video_id: data.videoId, user_id: context.userId, token_hash: tokenHash, expires_at: new Date(Date.now() + CARTOON_LIFETIME_MS).toISOString(), manifest: manifest as unknown as Json, output_path: `${context.userId}/${data.videoId}/cartoon-output.mp4` }).select('id').single();
    if (error || !job) {
      const { data: claimed } = await context.supabase.from('render_jobs').select('id,status').eq('video_id', data.videoId).single();
      if (claimed) return { id: claimed.id, status: claimed.status };
      throw Error('Could not reserve cartoon rendering');
    }
    try {
      const { data: signed, error: signError } = await context.supabase.storage.from('videos').createSignedUrl(data.voicePath, 86400);
      if (signError || !signed) throw Error('Could not open the saved Atlas narration');
      const run = await startActor(key, connection, { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest, voiceUrl: signed.signedUrl, mode: 'preflight' });
      const { error: trackError } = await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).not('status', 'in', '(done,failed,cancelled)');
      if (trackError) throw Error('Cartoon started but tracking could not be saved; do not resubmit');
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { hostedRender: { id: job.id, status: 'running' }, status: 'running', progress: 72, stage: 'render', detail: 'Cartoon preview · safe to close your browser' }, saved_path: '' });
      return { id: job.id, status: 'running' };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not start cartoon rendering';
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'failed', video_patch: { status: 'failed', error: message, detail: message, hostedRender: { id: job.id, status: 'failed' } }, saved_path: '' });
      throw Error(message);
    }
  });

export const approveCartoon = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string; hash: string }) => reviewApproval.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from('videos').select('data').eq('id', data.videoId).single();
    const { data: job } = await context.supabase.from('render_jobs').select('*').eq('video_id', data.videoId).single();
    if (!row || !job || job.user_id !== context.userId) throw Error('Video not found');
    const review = (row.data as Record<string, Json>)['cartoonReview'] as unknown as CartoonReview | undefined;
    if (!reviewMatches(review, data.hash) || !review || job.status !== 'review') throw Error('This preview changed or was already approved');
    const key = process.env['LOVABLE_API_KEY'], connection = process.env['APIFY_API_KEY'];
    if (!key || !connection) throw Error('Apify is not connected');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await digest(token);
    const { data: claimed, error } = await supabaseAdmin.rpc('approve_cartoon_render', { job_id: job.id, owner_id: context.userId, review_hash: data.hash, next_token_hash: tokenHash });
    if (error || !claimed) throw Error('Preview was already approved or expired');
    try {
      const run = await startActor(key, connection, { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest: job.manifest, mode: 'finish', storeId: review.storeId, approvedHash: data.hash });
      const { error: trackError } = await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).not('status', 'in', '(done,failed,cancelled)');
      if (trackError) throw Error('Cartoon started but tracking could not be saved; do not resubmit');
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { detail: 'Full cartoon render · safe to close your browser', hostedRender: { id: job.id, status: 'running' } }, saved_path: '' });
      return { accepted: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Cartoon submission could not be confirmed';
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'failed', video_patch: { status: 'failed', error: message, detail: 'Submission unconfirmed · saved preview is safe', hostedRender: { id: job.id, status: 'failed' } }, saved_path: '' });
      throw Error(message);
    }
  });

async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }
function callbackAddress() {
  const origin = new URL(getRequest().url).origin;
  return `${origin.includes('localhost') || origin.includes('id-preview') ? 'https://sooho.lovable.app' : origin}/api/public/render-callback`;
}
async function startActor(key: string, connection: string, input: unknown) {
  const response = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${CARTOON_ACTOR}/runs?memory=8192&timeout=21600`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) { const body = await response.text(); console.error('Cartoon start', response.status, body); throw Error(`Cartoon rendering could not start [${response.status}]`); }
  const result = await response.json() as { data?: { id?: string } };
  if (!result.data?.id) throw Error('Cartoon start was not confirmed; do not resubmit');
  return result.data.id;
}