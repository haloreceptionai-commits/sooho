import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { VideoInput, Settings } from './store';
import type { ScriptCheckpoint, SeedanceCheckpoint } from './pipeline';
import { writeBackgroundScript } from './generation-script.server';
import { checkContinuityOperation, directCartoonOperation, generateImageOperation, generateVoiceOperation } from './pipeline-operations.server';
import { cartoonStart } from './cartoon-job';
import { spellNumbers } from './story-v2';
import { submitCartoonOperation } from './cartoon-submit.server';
import { submitHostedRenderOperation } from './assembly-submit.server';
import { renderRequest } from './hosted-render';
import { generationPath } from './generation-policy';
import { startClipOperation, pollClipOperation, clipChunkOperation } from './clips-operations.server';
import { seedanceRuns, seedanceBody } from './seedance';

type Client = SupabaseClient<Database>;
type Job = Database['public']['Tables']['generation_jobs']['Row'];
export class GenerationCheckpointSaved extends Error {}
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
    // Each invocation executes at most one operation, avoiding an hours-long app request.
    throw new GenerationCheckpointSaved('continue');
  }
  async function asset(key: string, b64: string, mime: string) {
    const path = generationPath(job.user_id, job.video_id, job.id, key);
    const { error } = await db.storage.from('videos').upload(path, bytes(b64), { contentType: mime, upsert: true });
    if (error) throw Error('Paid asset could not be saved; reconciliation is required');
    return path;
  }
  const script = await writeBackgroundScript(input, settings, { call }, up, record['scriptCheckpoint'] as unknown as ScriptCheckpoint | undefined);
  if (!script.plan.scenes.length) throw Error('The script came back empty');
  if (!script.gate.ready || !script.judgeOk) await up({ checks: script.gate.blockers });
  const plan = script.plan;
  await up({ title: plan.title, description: plan.description, sceneCount: plan.scenes.length, status: 'running', stage: 'voice', progress: 12 });
  const context = { supabase: db, userId: job.user_id };
  if (input.engine === 'cartoon') {
    const direction = await step('director', JSON.stringify(plan.scenes), () => directCartoonOperation({ data: { scenes: plan.scenes.map(sc => `${sc.narration} Visual: ${sc.image_prompt}`), deployment: settings.scriptDeployment } }));
    const narration = plan.scenes.map(sc => speakable(sc.narration.trim()));
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
    let sheet: string | undefined;
    if (plan.characters.length) {
      const sheetPath = await step('sheet', JSON.stringify(plan.characters), async () => {
        const take = await generateImageOperation({ data: { prompt: plan.characters.map(c => `${c.name}: ${c.look}`).join('; '), aspect: 'landscape', deployment: settings.imageDeployment, quality: settings.imageQuality, style: input.style, sheet: true } });
        if (!take.image) throw Error('Character reference was blocked');
        return asset('sheet.jpg', take.image, 'image/jpeg');
      });
      const { data: file, error } = await db.storage.from('videos').download(sheetPath);
      if (error || !file) throw Error('Saved character reference is unavailable');
      sheet = toBase64(await file.arrayBuffer());
    }
    const images: string[] = [], continuity: number[] = [];
    for (let i = 0; i < plan.scenes.length; i++) {
      const sc = plan.scenes[i]; if (!sc) throw Error('Scene missing');
      const people = sc.shot === 'action' || sc.shot === 'face';
      const cast = people ? plan.characters.filter(c => sc.characters.includes(c.name)).map(c => `${c.name}: ${c.look}`).join('; ') : '';
      const prompt = `${sc.shot.toUpperCase()} ${sc.angle} shot. ${sc.money ? `MONEY SHOT: ${script.moneyShot}.` : ''} ${sc.image_prompt}. ${people ? 'Characters are busy mid-action, not posing or looking at the camera.' : 'Show the environment or process; any people are small in frame.'} ${sc.color} lighting. Bright, light and airy, high-key exposure, readable soft shadows, never gloomy or underexposed.`;
      let path = await step(`image/${i}`, JSON.stringify(sc), async () => {
        const image = await generateImageOperation({ data: { prompt: prompt.slice(0, 3000), aspect: portrait ? 'portrait' : 'landscape', deployment: settings.imageDeployment, quality: settings.imageQuality, style: input.style, palette: plan.palette, cast, ...(cast && sheet ? { reference: sheet } : {}) } });
        if (!image.image) throw Error(`Scene ${i + 1} was blocked; no silent substitution`);
        return asset(`image-${i}.jpg`, image.image, 'image/jpeg');
      });
      if (cast && sheet) {
        const score = await step(`continuity/${i}`, path, async () => {
          const { data: file, error } = await db.storage.from('videos').download(path);
          if (error || !file) throw Error('Saved image could not load');
          return checkContinuityOperation({ data: { sheet: sheet ?? '', shot: toBase64(await file.arrayBuffer()), cast, deployment: settings.scriptDeployment } });
        });
        continuity.push(score.score);
        if (score.score < 6) {
          path = await step(`redraw/${i}`, `${path}:${score.issue}`, async () => {
            const image = await generateImageOperation({ data: { prompt: `${prompt} Match the reference exactly: ${score.issue}`.slice(0, 3000), aspect: portrait ? 'portrait' : 'landscape', deployment: settings.imageDeployment, quality: settings.imageQuality, style: input.style, palette: plan.palette, cast, reference: sheet } });
            if (!image.image) throw Error('Continuity redraw was blocked');
            return asset(`image-${i}-redraw.jpg`, image.image, 'image/jpeg');
          });
        }
      }
      images.push(path);
      await up({ stage: 'images', progress: 27 + Math.round((i + 1) / plan.scenes.length * 43), detail: `Painting scenes · ${i + 1}/${plan.scenes.length}` });
    }
    const clips: { path: string; scenes: number[] }[] = [];
    if (input.engine === 'omni' || input.engine === 'seedance') {
      const runs = input.engine === 'seedance' ? seedanceRuns(plan.scenes) : plan.scenes.map((sc, i) => ({ scenes: [i], prompt: `Animate this exact frame as ${input.style}, with lively character movement and dynamic camera motion. ${sc.image_prompt}. No dialogue, speech, music or captions.`, seconds: Math.max(3, Math.min(10, Math.ceil(sc.narration.split(/\s+/).length * 60 / 153))) }));
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i]; if (!run) continue;
        const id = await step(`motion-submit/${i}`, JSON.stringify(run), async () => {
          const path = images[run.scenes[0] ?? 0]; if (!path) throw Error('Starting frame missing');
          const { data: file, error } = await db.storage.from('videos').download(path);
          if (error || !file) throw Error('Saved starting frame could not load');
          const image = toBase64(await file.arrayBuffer());
          if (input.engine === 'omni') return (await startClipOperation({ data: { image, prompt: run.prompt.slice(0, 3500), aspect: portrait ? 'portrait' : 'landscape', seconds: run.seconds } })).id;
          const key = process.env['LOVABLE_API_KEY']; if (!key) throw Error('AI is unavailable');
          const response = await fetch('https://ai.gateway.lovable.dev/v1/videos', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(seedanceBody(run.prompt, `data:image/jpeg;base64,${image}`, run.seconds, portrait)) });
          if (!response.ok) throw Error(`Motion submission unconfirmed [${response.status}]`);
          const result = await response.json() as { id?: string };
          if (!result.id) throw Error('Motion submission unconfirmed');
          return result.id;
        });
        const status = await pollClipOperation({ data: { id } });
        if (status.status === 'failed') throw Error(status.error ?? 'Motion clip failed');
        if (status.status !== 'completed') return { status: 'waiting', delayMs: 8000 };
        const path = await step(`motion-save/${i}`, id, async () => {
          const parts: Uint8Array[] = []; let offset = 0, total = 1;
          while (offset < total) {
            const chunk = await clipChunkOperation({ data: { id, offset } });
            const part = bytes(chunk.data); if (!part.length) throw Error('Motion download incomplete');
            parts.push(part); offset += part.length; total = chunk.total;
          }
          const merged = new Uint8Array(offset); let cursor = 0;
          for (const part of parts) { merged.set(part, cursor); cursor += part.length; }
          const path = generationPath(job.user_id, job.video_id, job.id, `clip-${i}.mp4`);
          const { error } = await db.storage.from('videos').upload(path, merged, { upsert: true, contentType: 'video/mp4' });
          if (error) throw Error('Motion clip save needs reconciliation');
          return path;
        });
        clips.push({ path, scenes: run.scenes });
      }
    }
    const cp: SeedanceCheckpoint = { plan, gate: script.gate, report: script.report, hookType: script.hookType, continuity: continuity.length ? continuity.filter(n => n >= 6).length / continuity.length : 1, images, voice: voices };
    await up({ assemblyCheckpoint: cp });
    const rendered = await step('handoff', JSON.stringify(cp), () => submitHostedRenderOperation({ data: renderRequest.parse({ videoId: job.video_id, checkpoint: cp, clips, captions: settings.burnCaptions, sfx: settings.soundEffects }), context }));
    await up({ hostedRender: rendered, stage: 'render', progress: 72, detail: 'Hosted assembly · safe to close your browser' });
  }
  const { data: handed, error } = await db.rpc('handoff_generation_job', auth);
  if (error || !handed) throw Error('Render handoff save was not confirmed');
  return { status: 'handoff' };
}
function toBase64(buffer: ArrayBuffer) {
  let output = ''; const array = new Uint8Array(buffer);
  for (let i = 0; i < array.length; i += 32768) output += String.fromCharCode(...array.subarray(i, i + 32768));
  return btoa(output);
}