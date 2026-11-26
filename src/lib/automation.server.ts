import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { automationRunAllowed, automationUploadTiming, dueAutomationSlots, youtubeScheduledStatus } from './automation';
import { digest } from './generation-runner.server';
import { startGenerationWorker } from './generation-dispatch.server';
import { refreshAccess, startUpload } from './youtube.server';

type Db = SupabaseClient<Database>;
type Run = Database['public']['Tables']['video_automation_runs']['Row'];
export function automationReadiness(privateTest = false) {
  const keys = ['AZURE_GENERATION_IMAGE', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'];
  if (keys.some(k => !process.env[k])) return { ready: false, reason: 'Daily automation is waiting for its generation or YouTube connection setup.' };
  if (!privateTest && process.env['AUTOMATION_ROLLOUT_ENABLED'] !== 'true') return { ready: false, reason: 'Daily automation is awaiting its private video-generation and YouTube-upload tests. Daily creation and posting remain off.' };
  if (process.env['LONGFORM_DOCUMENTARY'] === 'off') return { ready: false, reason: 'The long-form documentary renderer must be available before daily automation starts.' };
  return { ready: true, reason: null };
}

export async function pauseAutomation(db: Db, run: Pick<Run, 'id' | 'workspace_id'>, message: string) {
  const reason = message.slice(0, 1500);
  const { data: current, error: readError } = await db.from('video_automation_runs').select('private_test').eq('id', run.id).single();
  if (readError || !current) throw Error('Could not verify which automation run needs pausing');
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    db.from('video_automation_runs').update({ status: 'paused', error: reason, lease_until: null, updated_at: new Date().toISOString() }).eq('id', run.id).in('status', ['generating', 'uploading']),
    current.private_test ? Promise.resolve({ error: null }) : db.from('video_automation').update({ paused_reason: reason, updated_at: new Date().toISOString() }).eq('workspace_id', run.workspace_id),
  ]);
  if (e1 || e2) throw Error('Could not save the automation pause; no additional work was started');
}

/** One scheduler lease, at most two new daily videos; no provider calls on an idle or paused schedule. */
export async function automationTick(db: Db, now = Date.now()) {
  const owner = crypto.randomUUID();
  const { data: claimed, error } = await db.rpc('claim_video_automation_tick', { p_owner: owner });
  if (error) throw Error('Automation schedule tracking is unavailable');
  if (!claimed) return { busy: true, started: 0 };
  try {
    const { data: settings, error: readError } = await db.from('video_automation').select('*').eq('enabled', true).is('paused_reason', null).order('workspace_id').limit(100);
    if (readError) throw Error('Could not load daily schedules');
    if (!automationReadiness().ready) return { started: 0, blocked: automationReadiness().reason };
    let started = 0;
    for (const a of settings ?? []) {
      const { error: checked } = await db.from('video_automation').update({ last_checked_at: new Date(now).toISOString() }).eq('workspace_id', a.workspace_id);
      if (checked) throw Error('Could not save the schedule check');
      const slots = dueAutomationSlots({ enabled: a.enabled, formats: a.formats.filter((f): f is 'short' | 'long' => f === 'short' || f === 'long'), shortTime: a.short_time, longTime: a.long_time }, now);
      for (const slot of slots) {
        if (started >= 2) break;
        const token = crypto.randomUUID() + crypto.randomUUID();
        const { data: reserved, error: reserveError } = await db.rpc('reserve_video_automation_run', { p_workspace: a.workspace_id, p_format: slot.format, p_date: slot.localDate, p_publish: slot.publishAt, p_video: `auto-${crypto.randomUUID()}`, p_hash: await digest(token) });
        if (reserveError) throw Error('Could not reserve the daily video safely');
        if (!reserved) continue;
        const run = reserved as { id: string; generationJobId: string };
        started++;
        try {
          const execution = await startGenerationWorker(run.generationJobId, token);
          const { error: tracking } = await db.from('generation_jobs').update({ run_id: execution }).eq('id', run.generationJobId);
          if (tracking) throw Error('Generation started but tracking is uncertain; do not restart');
        } catch (e) {
          // Uncertain submissions stay claimed. Never dispatch the same video or a replacement automatically.
          await pauseAutomation(db, { id: run.id, workspace_id: a.workspace_id }, e instanceof Error ? e.message : 'Generation start was not confirmed');
          return { started };
        }
      }
      if (started >= 2) break;
    }
    return { started };
  } finally {
    const { error: released } = await db.from('video_automation_runtime').update({ lease_until: null }).eq('key', 'daily').eq('lease_owner', owner);
    if (released) console.error('Daily automation lease release failed');
  }
}

function uploadAddress(url: string) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== 'www.googleapis.com' || !u.pathname.startsWith('/upload/youtube/')) throw Error('YouTube returned an invalid upload address');
  return u.href;
}
async function keepPrivate(access: string, id: string) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', { method: 'PUT', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true } }) });
  if (!response.ok) throw Error(`YouTube could not cancel the pending publication [${response.status}]; check this scheduled video in YouTube Studio.`);
}
export async function stopScheduledAutomation(db: Db, workspaceId: string, userId: string) {
  const { error: stopError } = await db.from('video_automation').update({ enabled: false }).eq('workspace_id', workspaceId).eq('user_id', userId);
  if (stopError) throw Error('Could not turn off automation');
  const { data: scheduled, error } = await db.from('video_automation_runs').select('id,youtube_id,publish_at').eq('workspace_id', workspaceId).eq('user_id', userId).eq('private_test', false).eq('status', 'scheduled').gt('publish_at', new Date().toISOString());
  if (error) throw Error('Automation is off, but pending YouTube posts could not be checked');
  if (!scheduled?.length) return;
  const { data: conn } = await db.from('youtube_connections').select('refresh_token').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (!conn) throw Error('Automation is off; reconnect YouTube to cancel its already scheduled posts.');
  const access = await refreshAccess(conn.refresh_token);
  for (const run of scheduled) {
    if (!run.youtube_id) continue;
    await keepPrivate(access, run.youtube_id);
    const { error: saveError } = await db.from('video_automation_runs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', run.id).eq('status', 'scheduled');
    if (saveError) throw Error('Publication cancelled on YouTube, but its saved status needs a refresh');
  }
}

/** The existing scale-to-zero coordinator calls this after render handoff: one resumable 8 MiB chunk per invocation. */
export async function advanceAutomationUpload(db: Db, generationId: string, owner: string) {
  const { data: run, error } = await db.from('video_automation_runs').select('*').eq('generation_job_id', generationId).maybeSingle();
  if (error) throw Error('Could not read scheduled upload progress');
  if (!run) return { status: 'handoff' };
  if (!['generating', 'uploading'].includes(run.status)) return { status: run.status, error: run.error };
  if (!automationReadiness(run.private_test).ready) return { status: 'paused', error: automationReadiness(run.private_test).reason };
  const { data: settings, error: configError } = await db.from('video_automation').select('enabled,paused_reason').eq('workspace_id', run.workspace_id).single();
  if (configError || !settings) throw Error('Could not check automation permission');
  if (!automationRunAllowed(run.private_test, settings.enabled, settings.paused_reason)) return { status: 'paused', error: settings.paused_reason ?? 'Daily automation is off' };
  const { data: video, error: videoError } = await db.from('videos').select('data,file_path').eq('id', run.video_id).eq('user_id', run.user_id).single();
  if (videoError || !video) throw Error('Saved daily video is unavailable');
  const v = video.data as { status?: string; title?: string; description?: string; error?: string; input?: { topic?: string }; hostedRender?: { status?: string } };
  if (v.status === 'failed' || ['failed', 'cancelled'].includes(v.hostedRender?.status ?? '')) {
    await pauseAutomation(db, run, v.error ?? 'Daily video rendering failed; saved inputs are safe'); return { status: 'paused', error: v.error };
  }
  if (Date.parse(run.publish_at) <= Date.now()) {
    await db.from('video_automation_runs').update({ status: 'missed', error: 'The video was not ready before its posting time; no late post was made.', updated_at: new Date().toISOString() }).eq('id', run.id);
    return { status: 'missed' };
  }
  if (v.status !== 'done' || !video.file_path) return { status: 'waiting' };
  const { data: fence, error: leaseError } = await db.rpc('claim_video_automation_upload', { p_run: run.id, p_owner: owner });
  if (leaseError) throw Error('Upload ownership tracking is unavailable');
  if (!fence) return { status: 'waiting' };
  const update = async (patch: Database['public']['Tables']['video_automation_runs']['Update']) => {
    const { data, error: e } = await db.from('video_automation_runs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', run.id).eq('fence', fence).eq('lease_owner', owner).select('id').maybeSingle();
    if (e || !data) throw Error('Upload progress save was not confirmed; the same session must be reconciled');
  };
  try {
    const { data: conn, error: connError } = await db.from('youtube_connections').select('refresh_token').eq('workspace_id', run.workspace_id).eq('user_id', run.user_id).maybeSingle();
    if (connError || !conn) throw Error("This workspace's YouTube channel is disconnected");
    const access = await refreshAccess(conn.refresh_token);
    if (!video.file_path.startsWith(`${run.user_id}/${run.video_id}/`)) throw Error('Invalid private video path');
    const { data: signed, error: signError } = await db.storage.from('videos').createSignedUrl(video.file_path, 600);
    if (signError || !signed) throw Error('Could not open the finished private video');
    let url = run.upload_url, total = run.upload_size;
    if (!url) {
      if (run.status === 'uploading') throw Error('The upload session start is uncertain; no duplicate upload was created.');
      const head = await fetch(signed.signedUrl, { method: 'HEAD' });
      total = Number(head.headers.get('content-length'));
      if (!head.ok || !Number.isSafeInteger(total) || total <= 0) throw Error('The finished video size could not be verified');
      await update({ status: 'uploading', upload_size: total, upload_mime: 'video/mp4' });
      if (!run.private_test) youtubeScheduledStatus(run.publish_at);
      url = uploadAddress(await startUpload(access, { title: v.title ?? 'History video', description: v.description ?? '', tags: [v.input?.topic ?? 'history', 'history facts'], privacy: 'private', short: run.format === 'short', size: total, mime: 'video/mp4', origin: 'https://sooha.io', ...automationUploadTiming(run.private_test, run.publish_at) }));
      await update({ upload_url: url });
    }
    if (!total || total <= 0) throw Error('Saved upload size is missing');
    const finish = async (response: Response) => {
      const body = await response.json() as { id?: string };
      if (!body.id) throw Error('YouTube completed the upload without a video ID');
      const { data: current } = await db.from('video_automation').select('enabled,paused_reason').eq('workspace_id', run.workspace_id).single();
      if (!current || !automationRunAllowed(run.private_test, current.enabled, current.paused_reason) || Date.parse(run.publish_at) <= Date.now()) {
        await keepPrivate(access, body.id);
        await update({ status: 'cancelled', youtube_id: body.id, lease_until: null });
        return { status: 'cancelled' };
      }
      const { data: saved, error: e } = await db.rpc('complete_video_automation_upload', { p_run: run.id, p_owner: owner, p_fence: fence, p_youtube: body.id });
      if (e || !saved) throw Error('YouTube received the video but its saved confirmation needs reconciliation; no replacement upload was created.');
      return { status: 'scheduled' };
    };
    // Query the SAME session before each chunk, including after an uncertain previous response.
    const progress = await fetch(uploadAddress(url), { method: 'PUT', redirect: 'manual', headers: { Authorization: `Bearer ${access}`, 'Content-Length': '0', 'Content-Range': `bytes */${total}` } });
    if (progress.ok) return finish(progress);
    if (progress.status !== 308) throw Error(`YouTube upload session could not be reconciled [${progress.status}]; no new upload was started.`);
    const range = progress.headers.get('range'), end = range ? /^bytes=0-(\d+)$/.exec(range)?.[1] : null;
    const offset = end ? Number(end) + 1 : 0;
    if (!Number.isSafeInteger(offset) || offset >= total) throw Error('YouTube returned invalid upload progress');
    const last = Math.min(total - 1, offset + 8 * 1024 * 1024 - 1);
    const chunk = await fetch(signed.signedUrl, { headers: { Range: `bytes=${offset}-${last}` } });
    if (chunk.status !== 206) throw Error('Private storage did not return the requested video chunk');
    const bytes = await chunk.arrayBuffer();
    if (bytes.byteLength !== last - offset + 1) throw Error('Private video chunk size does not match');
    // Recheck immediately before writing bytes: turning off stops an in-progress upload as well.
    const { data: allowed } = await db.from('video_automation').select('enabled,paused_reason').eq('workspace_id', run.workspace_id).single();
    if (!allowed || !automationRunAllowed(run.private_test, allowed.enabled, allowed.paused_reason)) return { status: 'paused' };
    if (Date.parse(run.publish_at) <= Date.now()) return { status: 'missed' };
    const uploaded = await fetch(uploadAddress(url), { method: 'PUT', redirect: 'manual', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.byteLength), 'Content-Range': `bytes ${offset}-${last}/${total}` }, body: bytes });
    if (uploaded.ok) return finish(uploaded);
    if (uploaded.status === 308) { await update({ upload_offset: last + 1, lease_until: null }); return { status: 'continue' }; }
    if (uploaded.status === 429 || uploaded.status >= 500) { await update({ lease_until: null }); return { status: 'waiting' }; }
    throw Error(`YouTube upload was stopped [${uploaded.status}]`);
  } catch (e) {
    await pauseAutomation(db, run, e instanceof Error ? e.message : 'Scheduled upload needs review');
    return { status: 'paused', error: e instanceof Error ? e.message : 'Scheduled upload needs review' };
  }
}