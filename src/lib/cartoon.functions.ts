import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { RENDER_CALLBACK_URL } from '@/lib/render-complete';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { CARTOON_LIFETIME_MS, cartoonStart, reviewApproval, reviewMatches, type CartoonStart, type CartoonReview } from '@/lib/cartoon-job';
import { validRenderAssets } from '@/lib/hosted-render';
import type { Json } from '@/integrations/supabase/types';
import { startAzureCartoon, readAzureCartoonLock, cartoonInputKey } from '@/lib/azure-render';
import { canResumeApprovedCartoon, verifiedCartoonLock } from './cartoon-resume';
import { canonical } from '../../hosted-renderer/cartoon/canonical.mjs';

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

export const resumeApprovedCartoon = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string }) => ({ videoId: reviewApproval.shape.videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from('videos').select('data').eq('id', data.videoId).single();
    const { data: job } = await context.supabase.from('render_jobs').select('*').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const review = row ? (row.data as Record<string, Json>)['cartoonReview'] as unknown as CartoonReview | undefined : undefined;
    if (!job || job.user_id !== context.userId || !review || !canResumeApprovedCartoon(job.status, review)) throw Error('No failed approved cartoon can be resumed');
    // Uncertain dispatch must be reconciled, not submitted a second time.
    // A previous unconfirmed start is safe to resume: Azure confirms the old execution ended before the job became failed.
    const legacy = !/^cartoon-[0-9a-f-]{36}$/.test(review.storeId);
    if (legacy) throw Error('This older saved render needs recovery before it can resume');
    const lock = await readAzureCartoonLock(review.storeId);
    if (!verifiedCartoonLock(lock, job.id, review.hash, await digest(canonical(job.manifest)))) throw Error('Saved inputs do not match the approved preview');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await digest(token);
    const { data: claimed, error } = await supabaseAdmin.rpc('resume_cartoon_render', { job_id: job.id, owner_id: context.userId, review_hash: review.hash, next_token_hash: tokenHash, next_output_path: `${context.userId}/${data.videoId}/generation-output/${crypto.randomUUID()}.mp4` });
    if (error || !claimed) throw Error('This render was already resumed or its saved preview changed');
    const key = cartoonInputKey(job.id, 'finish');
    await supabaseAdmin.from('render_jobs').update({ recovery: { claimedAt: Date.now(), inputKey: key } }).eq('id', job.id).eq('token_hash', tokenHash);
    try {
      const run = await startAzureCartoon(job.id, 'finish', { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest: job.manifest, mode: 'finish', storeId: review.storeId, approvedHash: review.hash }, key);
      await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).eq('token_hash', tokenHash).not('status', 'in', '(done,failed,cancelled)');
    } catch (e) {
      // An uncertain start is never resubmitted blindly: the render watchdog matches Azure's executions to this input.
      console.error('Cartoon resume start unconfirmed', e instanceof Error ? e.message : e);
    }
    await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { status: 'running', error: null, detail: 'Full cartoon render · safe to close your browser', hostedRender: { id: job.id, status: 'running' } }, saved_path: '' });
    return { accepted: true };
  });

export const approveCartoon = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string; hash: string }) => reviewApproval.parse(data))
  .handler(async ({ data, context }) => { const { approveCartoonOperation } = await import('./cartoon-approve.server'); return approveCartoonOperation(data, context.userId, context.supabase); });

function apifyKeys(): [string, string] {
  const key = process.env['LOVABLE_API_KEY'], connection = process.env['APIFY_API_KEY'];
  if (!key || !connection) throw Error('Apify is not connected');
  return [key, connection];
}
async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }
function callbackAddress() { return RENDER_CALLBACK_URL; }
async function startActor(key: string, connection: string, input: unknown) {
  const response = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${CARTOON_ACTOR}/runs?memory=32768&timeout=21600`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) { const body = await response.text(); console.error('Cartoon start', response.status, body); throw Error(`Cartoon rendering could not start [${response.status}]`); }
  const result = await response.json() as { data?: { id?: string } };
  if (!result.data?.id) throw Error('Cartoon start was not confirmed; do not resubmit');
  return result.data.id;
}
/** Owner's page asks this when a preview has shown no progress for a few minutes. */
export const restartDeadPreflight = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { videoId: string }) => z.object({ videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).parse(d))
  .handler(async ({ data, context }) => { const { restartDeadPreflightOperation } = await import('./cartoon-submit.server'); return restartDeadPreflightOperation({ data, context }); });
