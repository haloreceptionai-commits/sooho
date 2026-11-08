import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { VideoInput, Settings } from './store';
import type { ScriptCheckpoint, SeedanceCheckpoint } from './pipeline';
import { writeBackgroundScript } from './generation-script.server';
import { directCartoonOperation, generateImageOperation, generateVoiceOperation } from './pipeline-operations.server';
import { cartoonStart } from './cartoon-job';
import { spellNumbers } from './story-v2';
import { submitCartoonOperation } from './cartoon-submit.server';
import { submitHostedRenderOperation } from './assembly-submit.server';
import { generationPath } from './generation-policy';

type Client = SupabaseClient<Database>;
type Job = Database['public']['Tables']['generation_jobs']['Row'];
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
function bytes(b64: string) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }

export async function advanceGeneration(db: Client, job: Job, owner: string, fence: number) {
  const snapshot = job.request as unknown as { input: VideoInput; settings: Settings };
  const { input, settings } = snapshot;
  const auth = { p_job: job.id, p_hash: job.token_hash, p_owner: owner, p_fence: fence };
  const { data: row, error: readError } = await db.from('videos').select('data').eq('id', job.video_id).single();
  if (readError || !row) throw Error('Saved video is unavailable');
  let record = row.data as Record<string, Json>;
  // Mutations are fenced by the DB function, not a read-before-write check.
  const up = async (patch: Record<string, unknown>) => {
    const { data, error } = await db.rpc('patch_generation_video', { ...auth, p_patch: patch as Json });
    if (error || !data) throw Error('Generation ownership changed');
    record = { ...record, ...patch } as Record<string, Json>;
  };
  let operation = 0;
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    const key = `script/${operation++}`;
    return step(key, 'script-v1', fn);
  };
  async function step<T>(key: string, identity: string, fn: () => Promise<T>): Promise<T> {
    const hash = await digest(identity);
    const { data: action, error } = await db.rpc('begin_generation_step', { ...auth, p_key: key, p_input_hash: hash });
    if (error) throw Error('Could not reserve the next generation step');
    if (action === 'complete') {
      const { data: saved, error: e } = await db.from('generation_steps').select('result').eq('job_id', job.id).eq('step_key', key).single();
      if (e || !saved) throw Error('Saved step could not load');
      return saved.result as T;
    }
    if (action !== 'started') throw Error(`Generation step ${key} needs reconciliation (${action})`);
    const result = await fn();
    const { data: accepted, error: saveError } = await db.rpc('complete_generation_step', { ...auth, p_key: key, p_input_hash: hash, p_result: result as Json });
    if (saveError || !accepted) throw Error('Step completed but its save was not confirmed; do not regenerate');
    return result;
  }
  async function asset(key: string, b64: string, mime: string) {
    const path = generationPath(job.user_id, job.video_id, job.id, key);
    const { error } = await db.storage.from('videos').upload(path, bytes(b64), { contentType: mime, upsert: true });
    if (error) throw Error('Paid asset could not be saved; reconciliation is required');
    return path;
  }
  const script = await writeBackgroundScript(input, settings, { call }, up, record['scriptCheckpoint'] as unknown as ScriptCheckpoint | undefined);
  if (!script.gate.ready || !script.judgeOk) throw Error(`Story needs review: ${script.gate.blockers.join('; ')}`);
  const plan = script.plan;
  await up({ title: plan.title, description: plan.description, sceneCount: plan.scenes.length, status: 'running', stage: 'voice', progress: 12 });
  const context = { supabase: db, userId: job.user_id };
  if (input.engine === 'cartoon') {
    const direction = await step('director', JSON.stringify(plan.scenes), () => directCartoonOperation({ data: { scenes: plan.scenes.map(sc => `${sc.narration} Visual: ${sc.image_prompt}`), deployment: settings.scriptDeployment } }));
    const narration = plan.scenes.map(sc => spellNumbers(sc.narration.trim()));
    const text = narration.join(' ');
    const voicePath = await step('voice/cartoon', text, async () => {
      const take = await generateVoiceOperation({ data: { text, voice: input.voice, deployment: settings.ttsDeployment, style: 'short' } });
      return asset('voice-cartoon.wav', take.audio, 'audio/wav');
    });
    const cp = cartoonStart.parse({ videoId: job.video_id, voicePath, narration, script: text, direction, gate: script.gate, hookType: script.hookType, report: script.report, captions: true, sfx: settings.soundEffects });
    await up({ cartoonCheckpoint: cp, progress: 70 });
    const rendered = await step('handoff', JSON.stringify(cp), () => submitCartoonOperation({ data: cp, context }));
    await up({ hostedRender: rendered, stage: 'render', progress: 72, detail: 'Cartoon preview · safe to close your browser' });
  } else {
    const portrait = input.format === 'short';
    const voices: SeedanceCheckpoint['voice'] = [];
    const groups: number[][] = []; let current: number[] = [], count = 0;
    for (let i = 0; i < plan.scenes.length; i++) {
      const sc = plan.scenes[i]; if (!sc) continue;
      const words = sc.narration.split(/\s+/).length;
      if (current.length && count + words > (portrait ? 60 : 90)) { groups.push(current); current = []; count = 0; }
      current.push(i); count += words;
    }
    if (current.length) groups.push(current);
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]; if (!group) continue;
      const text = group.map(n => plan.scenes[n]?.narration.trim() ?? '').join(' ');
      const path = await step(`voice/${i}`, text, async () => {
        const take = await generateVoiceOperation({ data: { text, voice: input.voice, deployment: settings.ttsDeployment, style: input.format } });
        return asset(`voice-${i}.wav`, take.audio, 'audio/wav');
      });
      voices.push({ path, scenes: group });
      await up({ progress: 12 + Math.round((i + 1) / groups.length * 15), detail: `Recording narration · ${i + 1}/${groups.length}` });
    }
    const images: string[] = [];
    for (let i = 0; i < plan.scenes.length; i++) {
      const sc = plan.scenes[i]; if (!sc) throw Error('Scene missing');
      const path = await step(`image/${i}`, JSON.stringify(sc), async () => {
        const image = await generateImageOperation({ data: { prompt: sc.image_prompt, aspect: portrait ? 'portrait' : 'landscape', deployment: settings.imageDeployment, quality: settings.imageQuality, style: input.style, palette: plan.palette, cast: plan.characters.filter(c => sc.characters.includes(c.name)).map(c => `${c.name}: ${c.look}`).join('; ') } });
        if (!image.image) throw Error(`Scene ${i + 1} was blocked; no silent substitution`);
        return asset(`image-${i}.jpg`, image.image, 'image/jpeg');
      });
      images.push(path);
      await up({ stage: 'images', progress: 27 + Math.round((i + 1) / plan.scenes.length * 43), detail: `Painting scenes · ${i + 1}/${plan.scenes.length}` });
    }
    // Motion engines are not enabled for background ownership until their durable adapters are integrated.
    if (input.engine === 'omni' || input.engine === 'seedance') throw Error('Background motion handoff is not enabled');
    const cp: SeedanceCheckpoint = { plan, gate: script.gate, report: script.report, hookType: script.hookType, continuity: 1, images, voice: voices };
    await up({ assemblyCheckpoint: cp });
    const rendered = await step('handoff', JSON.stringify(cp), () => submitHostedRenderOperation({ data: { videoId: job.video_id, checkpoint: cp, clips: [], captions: settings.burnCaptions, sfx: settings.soundEffects }, context }));
    await up({ hostedRender: rendered, stage: 'render', progress: 72, detail: 'Hosted assembly · safe to close your browser' });
  }
  const { data: handed, error } = await db.rpc('handoff_generation_job', auth);
  if (error || !handed) throw Error('Render handoff save was not confirmed');
  return { status: 'handoff' };
}