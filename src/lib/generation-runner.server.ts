import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { VideoInput, Settings } from './store';
import type { ScriptCheckpoint, SeedanceCheckpoint } from './pipeline';
import { writeBackgroundScript } from './generation-script.server';
import { checkContinuityOperation, directCartoonOperation, generateImageOperation, generateVoiceOperation } from './pipeline-operations.server';
import { cartoonStart } from './cartoon-job';
import { speakable } from './story-v2';
import { submitCartoonOperation } from './cartoon-submit.server';
import { submitHostedRenderOperation } from './assembly-submit.server';
import { renderRequest } from './hosted-render';
import { generationPath } from './generation-policy';
import { assertVideoEngine, isAdvancedEngine } from './video-engines';
import { GenerationCheckpointSaved } from './generation-checkpoint';
export { GenerationCheckpointSaved } from './generation-checkpoint';
import { backgroundAdvanced } from './generation-advanced.server';
import { discoverFacts } from './topic-discovery.server';
import { discoveredTopicSchema } from './topic-discovery';
import type { TopicUse } from './topics';
import { buildCast, eraOf, BACKGROUND_RULE, sceneBible, cutoutPrompts, type CastEntry } from './documentary/cast';
import { castOperation, paintCutoutOperation, planVisualsOperation } from './documentary/documentary.server';
import { buildManifest } from './documentary/build-manifest';
import { submitDocumentaryOperation } from './documentary/documentary-submit.server';
import { documentaryRequest, type DocumentaryRequest } from './documentary/documentary-job';
import { MUSIC, type MusicMood } from './documentary/types';

type Client = SupabaseClient<Database>;
type Job = Database['public']['Tables']['generation_jobs']['Row'];
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
function bytes(b64: string) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }

export async function advanceGeneration(db: Client, job: Job, owner: string, fence: number) {
  const snapshot = job.request as unknown as { input: VideoInput; settings: Settings; automation?: { id: string; focus: string } };
  let input = snapshot.input;
  const settings = snapshot.settings;
  assertVideoEngine(input.engine);
  if (snapshot.automation) {
    const { data: run, error: runError } = await db.from('video_automation_runs').select('workspace_id,status,private_test').eq('id', snapshot.automation.id).eq('generation_job_id', job.id).single();
    if (runError || !run || run.status !== 'generating') throw Error('Daily generation is no longer active');
    const { data: allowed, error: allowError } = await db.from('video_automation').select('enabled,paused_reason').eq('workspace_id', run.workspace_id).single();
    if (allowError || !allowed || (!allowed.enabled && !run.private_test) || allowed.paused_reason) throw Error(allowed?.paused_reason ?? 'Daily automation is off');
  }
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
  const readAsset = async (path: string) => {
    const { data: file, error } = await db.storage.from('videos').download(path);
    if (error || !file) throw Error('Saved media is unavailable');
    return toBase64(await file.arrayBuffer());
  };
  const saveMedia = async (name: string, b64: string, mime: string) => {
    if (!/^[a-z0-9_-]{1,110}\.(png|wav|jpg)$/.test(name)) throw Error('Invalid media name');
    const path = `${job.user_id}/${job.video_id}/media/${name}`;
    const { error } = await db.storage.from('videos').upload(path, bytes(b64), { contentType: mime, upsert: true });
    if (error) throw Error('Paid media could not be saved; do not regenerate');
    return path;
  };
  if (snapshot.automation) {
    const focus = snapshot.automation.focus;
    const topic = await step('topic/discovery', JSON.stringify({ focus, format: input.format, deployment: settings.scriptDeployment }), async () => {
      const seen = [], used: TopicUse[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data: rows, error } = await db.from('topic_discoveries').select('data').eq('user_id', job.user_id).order('id').range(offset, offset + 499);
        if (error) throw Error('Could not check prior topic suggestions');
        for (const row of rows ?? []) { const t = discoveredTopicSchema.safeParse(row.data); if (t.success) seen.push(t.data); }
        if ((rows?.length ?? 0) < 500) break;
      }
      for (let offset = 0; ; offset += 500) {
        const { data: rows, error } = await db.from('videos').select('id,data').eq('user_id', job.user_id).order('id').range(offset, offset + 499);
        if (error) throw Error('Could not check generated topics');
        for (const row of rows ?? []) {
          const v = row.data as unknown as { input?: VideoInput; status: string };
          if (row.id !== job.video_id && v.input?.topic) used.push({ topic: v.input.topic, topicId: v.input.topicId, status: v.status });
        }
        if ((rows?.length ?? 0) < 500) break;
      }
      const topics = await discoverFacts({ focus, format: input.format, deployment: settings.scriptDeployment }, seen, used);
      const chosen = topics[0];
      if (!chosen) throw Error('No new topic passed evidence checks');
      const { error } = await db.from('topic_discoveries').insert(topics.map(t => ({ user_id: job.user_id, batch_id: job.id, fact_key: t.factKey, data: JSON.parse(JSON.stringify(t)) })));
      if (error) throw Error('Could not safely save the automatic topic selection');
      return chosen;
    });
    input = { ...input, topic: topic.title, topicId: topic.id, topicSource: { url: topic.source, fact: topic.fact }, archetype: topic.archetype };
    await up({ input, title: topic.title, detail: 'New evidence-backed topic selected' });
  }
  const script = await writeBackgroundScript(input, settings, { call }, up, record['scriptCheckpoint'] as unknown as ScriptCheckpoint | undefined);
  if (!script.plan.scenes.length) throw Error('The script came back empty');
  if (!script.gate.ready || !script.judgeOk) await up({ checks: script.gate.blockers });
  const plan = script.plan;
  await up({ title: plan.title, description: plan.description, sceneCount: plan.scenes.length, status: 'running', stage: 'voice', progress: 12 });
  const context = { supabase: db, userId: job.user_id };
  if (isAdvancedEngine(input.engine)) {
    if (input.format !== 'short') throw Error('Unattended Advanced generation currently supports Shorts only');
    const narration = plan.scenes.map(sc => speakable(sc.narration.trim())), text = narration.join(' ');
    const directed = await backgroundAdvanced(narration, plan.scenes.map(sc => `${sc.narration} Visual: ${sc.image_prompt}`), settings, { step, save: saveMedia, read: readAsset });
    await up({ directionCheckpoint: directed.direction, checks: [...script.gate.blockers, ...directed.log].slice(0, 100) });
    const voicePath = await step('voice/advanced', text, async () => {
      const take = await generateVoiceOperation({ data: { text, voice: 'onyx', deployment: settings.ttsDeployment, style: 'short' } });
      return asset('voice-advanced.wav', take.audio, 'audio/wav');
    });
    const cp = cartoonStart.parse({ advanced: true, cards: directed.cards, videoId: job.video_id, voicePath, narration, script: text, direction: directed.direction, gate: script.gate, hookType: script.hookType, report: script.report, captions: true, sfx: settings.soundEffects, format: 'short' });
    await up({ cartoonCheckpoint: cp, progress: 70 });
    const rendered = await step('handoff', JSON.stringify(cp), () => submitCartoonOperation({ data: cp, context }));
    await up({ hostedRender: rendered, stage: 'render', progress: 72, detail: 'Daily Advanced render · safe to close your browser' });
  } else if (input.engine === 'cartoon') {
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
    const documentary = !portrait && !!plan.documentary;
    let docCast: CastEntry[] = [];
    const era = eraOf(plan.scenes.map(sc => sc.narration));
    if (documentary) {
      const lines = plan.scenes.map(sc => sc.narration);
      const names = [...(plan.hero?.name ? [{ name: plan.hero.name, role: plan.hero.role }] : []), ...plan.characters.map(c => ({ name: c.name, role: c.role, look: c.look }))];
      const cast = await step('documentary/cast', JSON.stringify(lines), () => castOperation({ data: { topic: input.topic, era, lines: lines.map((text, index) => ({ index, text: text.slice(0, 380) })).slice(0, 400), known: names.map(n => n.name).slice(0, 20), deployment: settings.scriptDeployment } }));
      docCast = buildCast({ lines, era, ai: cast.cast, names });
    }
    const voices: SeedanceCheckpoint['voice'] = [];
    const groups: number[][] = []; let current: number[] = [], count = 0;
    for (let i = 0; i < plan.scenes.length; i++) {
      const sc = plan.scenes[i]; if (!sc) continue;
      const words = sc.narration.split(/\s+/).length;
      const chapterOf = (n: number) => (plan.documentary?.chapters ?? []).filter(c => c.scene <= n).length;
      if (current.length && (count + words > (portrait ? 60 : 90) || documentary && chapterOf(i) !== chapterOf(current[0] ?? 0))) { groups.push(current); current = []; count = 0; }
      current.push(i); count += words;
    }
    if (current.length) groups.push(current);
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]; if (!group) continue;
      const text = group.map(n => plan.scenes[n]?.narration.trim() ?? '').join(' ');
      const path = await step(`voice/${i}`, text, async () => {
        const chapter = (plan.documentary?.chapters ?? []).filter(c => c.scene <= (group[0] ?? 0)).at(-1);
        const take = await generateVoiceOperation({ data: { text, voice: input.voice, deployment: settings.ttsDeployment, style: documentary ? `long:${chapter?.music ?? 'suspense'}` : input.format } });
        return asset(`voice-${i}.wav`, take.audio, 'audio/wav');
      });
      voices.push({ path, scenes: group });
      await up({ progress: 12 + Math.round((i + 1) / groups.length * 15), detail: `Recording narration · ${i + 1}/${groups.length}` });
    }
    let sheet: string | undefined;
    if (plan.characters.length && !documentary) {
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
      const people = !documentary && (sc.shot === 'action' || sc.shot === 'face');
      const cast = people ? plan.characters.filter(c => sc.characters.includes(c.name)).map(c => `${c.name}: ${c.look}`).join('; ') : '';
      const prompt = `${documentary ? 'WIDE' : sc.shot.toUpperCase()} ${documentary ? 'wide' : sc.angle} shot. ${sc.money ? `MONEY SHOT: ${script.moneyShot}.` : ''} ${sc.image_prompt}. ${people ? 'Characters are busy mid-action, not posing or looking at the camera.' : 'Show the environment or process; any people are small in frame.'} ${sc.color} lighting. Bright, light and airy, high-key exposure, readable soft shadows, never gloomy or underexposed. ${documentary ? `${BACKGROUND_RULE} ${sceneBible(sc.narration, docCast, era)}` : ''}`;
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
    const cp: SeedanceCheckpoint = { plan, gate: script.gate, report: script.report, hookType: script.hookType, continuity: continuity.length ? continuity.filter(n => n >= 6).length / continuity.length : 1, images, voice: voices };
    await up({ assemblyCheckpoint: cp });
    let rendered: { id: string; status: string };
    if (documentary) {
      const cutouts: string[] = [];
      for (const c of docCast) {
        const prompts = cutoutPrompts(c, era, input.style);
        cutouts.push(await step(`documentary/cutout/${c.id}`, JSON.stringify(prompts), async () => {
          const take = await paintCutoutOperation({ data: { prompts, deployment: settings.imageDeployment } });
          return saveMedia(`cast-${c.id}.png`, take.image, 'image/png');
        }));
      }
      const ai = [];
      for (let i = 0; i < plan.scenes.length; i += 32) {
        const scenes = plan.scenes.slice(i, i + 32).map((sc, n) => ({ index: i + n, text: sc.narration }));
        ai.push(...await step(`documentary/visuals/${i}`, JSON.stringify(scenes), () => planVisualsOperation({ data: { scenes, topic: input.topic, sources: plan.documentary?.sources ?? [], deployment: settings.scriptDeployment } })));
      }
      const chapters = (plan.documentary?.chapters ?? []).map(c => ({ ...c, music: MUSIC.find(m => m === c.music) ?? 'suspense' as MusicMood }));
      const { manifest, report } = buildManifest({ title: plan.title, subtitle: plan.documentary?.subtitle, scenes: plan.scenes.map(sc => ({ ...sc, reveal: sc.beat === 'reveal' || sc.beat === 'payoff' })), chapters, sceneImage: images.map((_, i) => i), images, voice: voices, ai, sources: plan.documentary?.sources, captions: settings.burnCaptions, cast: docCast, cutouts });
      const request: DocumentaryRequest = { videoId: job.video_id, doc: manifest, checkpoint: { gate: cp.gate, report: cp.report, hookType: cp.hookType, continuity: cp.continuity, plan: { characters: plan.characters } } };
      documentaryRequest.parse(request);
      await up({ documentaryCheckpoint: request, boredom: { score: report.score, pass: report.pass, weakest: [], metrics: report.metrics } });
      rendered = await step('handoff', JSON.stringify(request), () => submitDocumentaryOperation({ data: request, context }));
    } else rendered = await step('handoff', JSON.stringify(cp), () => submitHostedRenderOperation({ data: renderRequest.parse({ videoId: job.video_id, checkpoint: cp, clips, captions: settings.burnCaptions, sfx: settings.soundEffects }), context }));
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