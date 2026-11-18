// Server-only render watchdog. Runs every few minutes (and from the owner's page) so a cartoon render that
// Azure dropped, never started, or finished without reporting is continued or completed instead of hanging.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { cartoonExecution, cartoonExecutions, cartoonInputKey, cartoonStoreState, readCartoonPending, startAzureCartoon, startAzureDocumentary, stopAzureExecution } from '@/lib/azure-render';
import { documentaryInput } from '@/lib/documentary/documentary-submit.server';
import { decideRecovery, type Decision, type Recovery, type RenderMode } from '@/lib/render-recovery';
import { donePatch, RENDER_CALLBACK_URL } from '@/lib/render-complete';
import { renderCallback } from '@/lib/hosted-render';

type Db = SupabaseClient<Database>;
type Job = Database['public']['Tables']['render_jobs']['Row'];
const ACTIVE = ['submitting', 'running', 'saving'];

async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }

export async function superviseCartoonJob(db: Db, job: Job): Promise<Decision> {
  const manifest = job.manifest as Record<string, Json> & { voicePath?: string };
  const documentary = manifest['kind'] === 'documentary';   // long-form pictures render: one stage, restarts reuse the pieces already saved
  if ((manifest['kind'] !== 'cartoon' && !documentary) || !ACTIVE.includes(job.status)) return { action: 'wait', why: 'not an active cartoon or documentary render' };
  if (job.run_id && !/^(azure|pending):/.test(job.run_id)) return { action: 'wait', why: 'older worker' };
  const { data: video } = await db.from('videos').select('data').eq('id', job.video_id).eq('user_id', job.user_id).single();
  if (!video) return { action: 'wait', why: 'video missing' };
  const review = (video.data as Record<string, Json>)['cartoonReview'] as { approved?: boolean; storeId?: string; hash?: string } | undefined;
  const mode: RenderMode = documentary || review?.approved ? 'finish' : 'preflight';
  const recovery = (job.recovery ?? {}) as Recovery;
  const tracked = /^azure:(cartoon-preflight|cartoon-render-gpu|cartoon-render)-[a-z0-9]+$/.exec(job.run_id ?? '');
  const unconfirmed = !tracked || (tracked[1] === 'cartoon-preflight' ? 'preflight' : 'finish') !== mode;
  let exec: { id: string; status: string; startMs: number } | null = null;
  if (!unconfirmed) {
    const one = await cartoonExecution(job.run_id!);
    exec = one ? { id: job.run_id!, ...one } : null;
  } else {
    const all = await cartoonExecutions(job.id, mode);
    exec = (recovery.inputKey ? all.find(e => e.inputKey === recovery.inputKey) : all.find(e => e.startMs >= Date.parse(job.updated_at) - 120_000)) ?? null;
  }
  const store = await cartoonStoreState(job.id);
  let completion: ReturnType<typeof renderCallback.safeParse> | null = null;
  if (mode === 'finish' && store.pending) {
    const parsed = renderCallback.safeParse(await readCartoonPending(job.id));
    if (parsed.success && parsed.data.type === 'done') {
      const parts = job.output_path.split('/'), file = parts.pop()!;
      const { data: files } = await db.storage.from('videos').list(parts.join('/'), { search: file });
      if (files?.some(f => f.name === file && Number(f.metadata?.size) === (parsed.data as { size: number }).size)) completion = parsed;
    }
  }
  const decision = decideRecovery({ mode, exec, unconfirmed, heartbeatMs: Date.parse(job.updated_at), nowMs: Date.now(), wroteSinceStart: exec ? store.wroteSince(exec.startMs) : false, parts: store.parts, verifiedCompletion: Boolean(completion), recovery });
  const event = (status: string, patch: Record<string, Json>, tokenHash = job.token_hash, saved = '') => db.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: status, video_patch: { ...patch, hostedRender: { id: job.id, status } } as Json, saved_path: saved });

  if (decision.action === 'adopt' && exec) {
    await db.from('render_jobs').update({ run_id: exec.id }).eq('id', job.id).eq('token_hash', job.token_hash);
  } else if (decision.action === 'complete' && completion?.success && completion.data.type === 'done') {
    await event('done', donePatch(job.manifest, completion.data), job.token_hash, job.output_path);
  } else if (decision.action === 'stop' && job.run_id) {
    await stopAzureExecution(job.run_id);
    await event(job.status, { detail: 'Render machine stopped responding — restarting it from saved work' });
  } else if (decision.action === 'fail') {
    await event('failed', { status: 'failed', error: decision.message, detail: decision.message });
  } else if (decision.action === 'restart') {
    await restart(db, job, mode, recovery, store.parts, review, documentary);
  }
  return decision;
}

async function restart(db: Db, job: Job, mode: RenderMode, recovery: Recovery, parts: number, review: { storeId?: string; hash?: string } | undefined, documentary = false) {
  const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await digest(token);
  const key = cartoonInputKey(job.id, mode);
  const next: Recovery = { attempts: (recovery.attempts ?? 0) + 1, lastParts: parts, claimedAt: Date.now(), inputKey: key };
  // Atomic claim: only the caller that swaps this exact token/run may start the next machine; the old token stops working.
  const { data: claimed } = await db.from('render_jobs').update({ token_hash: tokenHash, run_id: `pending:${mode}`, recovery: next as unknown as Json }).eq('id', job.id).eq('token_hash', job.token_hash).in('status', ACTIVE).select('id');
  if (!claimed?.length) return;
  let input: Record<string, unknown>;
  if (documentary) {
    input = await documentaryInput(db, job, token);   // fresh signed addresses; the machines pick up the pieces already saved in the job's store
  } else if (mode === 'finish') {
    if (!review?.storeId || !review.hash) throw Error('Approved preview is missing');
    input = { jobId: job.id, callbackToken: token, callbackUrl: RENDER_CALLBACK_URL, manifest: job.manifest, mode, storeId: review.storeId, approvedHash: review.hash };
  } else {
    const voicePath = (job.manifest as { voicePath?: string }).voicePath;
    const { data: signed } = voicePath ? await db.storage.from('videos').createSignedUrl(voicePath, 86400) : { data: null };
    if (!signed) throw Error('Saved narration could not be opened');
    const cardUrls: Record<string, string> = {};
    for (const c of (job.manifest as { cards?: { id: string; path: string }[] }).cards ?? []) {
      const { data: card } = await db.storage.from('videos').createSignedUrl(c.path, 86400);
      if (!card) throw Error('Saved character card could not be opened');
      cardUrls[c.id] = card.signedUrl;
    }
    input = { jobId: job.id, callbackToken: token, callbackUrl: RENDER_CALLBACK_URL, manifest: job.manifest, voiceUrl: signed.signedUrl, cardUrls, mode };
  }
  const detail = mode === 'finish' ? `Render machine stopped — continuing automatically from saved frames (attempt ${next.attempts! + 1})` : `Preview machine stopped — restarting it automatically (attempt ${next.attempts! + 1})`;
  await db.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { detail, hostedRender: { id: job.id, status: 'running' } } as Json, saved_path: '' });
  try {
    const run = documentary ? await startAzureDocumentary(job.id, input, key) : await startAzureCartoon(job.id, mode, input, key);
    await db.from('render_jobs').update({ run_id: run }).eq('id', job.id).eq('token_hash', tokenHash);
  } catch (e) {
    // An uncertain start is reconciled on the next pass by matching Azure executions to this exact input key.
    console.error('Cartoon restart unconfirmed', job.id, e instanceof Error ? e.message : e);
  }
}

/** Checks every active cartoon render that has been quiet for a couple of minutes. */
export async function superviseRenderJobs(db: Db) {
  const { data: jobs, error } = await db.from('render_jobs').select('*').in('status', ACTIVE).lt('updated_at', new Date(Date.now() - 2 * 60_000).toISOString()).order('updated_at').limit(10);
  if (error) throw Error('Render tracking unavailable');
  const results: { id: string; action: string; why: string }[] = [];
  for (const job of jobs ?? []) {
    try { const d = await superviseCartoonJob(db, job); results.push({ id: job.id, action: d.action, why: d.why }); }
    catch (e) { results.push({ id: job.id, action: 'error', why: e instanceof Error ? e.message : 'unknown' }); }
  }
  return results;
}
