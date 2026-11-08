import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { CARTOON_LIFETIME_MS, cartoonStart, reviewApproval, reviewMatches, type CartoonStart, type CartoonReview } from '@/lib/cartoon-job';
import { validRenderAssets } from '@/lib/hosted-render';
import type { Json } from '@/integrations/supabase/types';
import { startAzureCartoon } from '@/lib/azure-render';

export const CARTOON_ACTOR = 'nifty_remnant~chronicle-cartoon-renderer';

export const recoverCartoonReview = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string }) => ({ videoId: reviewApproval.shape.videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from('render_jobs').select('*').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!job || job.user_id !== context.userId || job.status !== 'failed' || !['Cloud callback unavailable', 'Owner review does not match locked inputs'].includes(job.error ?? '') || !job.run_id) throw Error('No saved preview can be recovered');
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
    const canonical = (value: Json): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k] ?? null)}`).join(',')}}` : JSON.stringify(value);
    if (job.error === 'Owner review does not match locked inputs') {
      const oldRuns = await get(`/acts/${CARTOON_ACTOR}/runs?limit=100&desc=true`);
      let original: Json | undefined;
      for (const oldRun of oldRuns.data.items) {
        const candidate = await get(`/key-value-stores/${oldRun.defaultKeyValueStoreId}/records/INPUT`);
        if (candidate.jobId === job.id && candidate.mode === 'preflight') { original = candidate.manifest; break; }
      }
      if (!original || canonical(original) !== canonical(job.manifest)) throw Error('Saved inputs changed; cannot recover automatically');
      const response = await fetch(`https://connector-gateway.lovable.dev/apify/key-value-stores/${store.id}/records/LOCK`, { method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...lock, request: original, requestHash: await digest(canonical(original)) }) });
      if (!response.ok) throw Error('Could not repair saved input ordering');
    }
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
  .handler(async ({ data, context }) => { const { submitCartoonOperation } = await import('./cartoon-submit.server'); return submitCartoonOperation({ data, context }); });

export const approveCartoon = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string; hash: string }) => reviewApproval.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from('videos').select('data').eq('id', data.videoId).single();
    const { data: job } = await context.supabase.from('render_jobs').select('*').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!row || !job || job.user_id !== context.userId) throw Error('Video not found');
    const review = (row.data as Record<string, Json>)['cartoonReview'] as unknown as CartoonReview | undefined;
    if (!reviewMatches(review, data.hash) || !review || job.status !== 'review') throw Error('This preview changed or was already approved');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await digest(token);
    const { data: claimed, error } = await supabaseAdmin.rpc('approve_cartoon_render', { job_id: job.id, owner_id: context.userId, review_hash: data.hash, next_token_hash: tokenHash });
    if (error || !claimed) throw Error('Preview was already approved or expired');
    try {
      // Saved previews from the older Apify worker keep finishing there; new previews finish on Azure.
      const legacy = !/^cartoon-[0-9a-f-]{36}$/.test(review.storeId);
      const finishInput = { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest: job.manifest, mode: 'finish', storeId: review.storeId, approvedHash: data.hash };
      const run = legacy ? await startActor(...apifyKeys(), finishInput) : await startAzureCartoon(job.id, 'finish', finishInput);
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

function apifyKeys(): [string, string] {
  const key = process.env['LOVABLE_API_KEY'], connection = process.env['APIFY_API_KEY'];
  if (!key || !connection) throw Error('Apify is not connected');
  return [key, connection];
}
async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }
function callbackAddress() {
  const origin = new URL(getRequest().url).origin;
  return `${origin.includes('localhost') || origin.includes('id-preview') ? 'https://sooho.lovable.app' : origin}/api/public/render-callback`;
}
async function startActor(key: string, connection: string, input: unknown) {
  const response = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${CARTOON_ACTOR}/runs?memory=32768&timeout=21600`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) { const body = await response.text(); console.error('Cartoon start', response.status, body); throw Error(`Cartoon rendering could not start [${response.status}]`); }
  const result = await response.json() as { data?: { id?: string } };
  if (!result.data?.id) throw Error('Cartoon start was not confirmed; do not resubmit');
  return result.data.id;
}