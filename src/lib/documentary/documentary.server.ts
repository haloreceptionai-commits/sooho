// Server-side AI steps of the long-form pipeline. Each one asks for strict JSON, checks it, and never trusts a model with numbers or places:
// whatever it proposes is verified against the narration again before it reaches a card (plan-visuals.ts).
import { azureJson } from '../pipeline-operations.server';
import { azureOpenAIRequest } from '../azure-openai.server';
import { castPrompt, castSchema, parseCast, type CastEntry, type Era } from './cast';
import { packagingPrompt, packagingSchema, type PackagingConcept } from './packaging';
import { chapterPrompt, chapterSchema, coldOpenPrompt, coldOpenSchema, dossierPrompt, dossierSchema, outlinePrompt, outlineSchema, patchSchema, sagPrompt, chapterCount,
  type ChapterDraft, type Dossier, type Outline } from './long-script';
import type { AiScenePlan } from './types';
import { parseVisualPlan, visualPrompt, visualSchema, type VisualAnswer } from './visual-ai';

const clamp = (n: unknown, lo: number, hi: number, d: number) => { const v = Number(n); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

export async function packagingOperation({ data }: { data: { topic: string; facts: string; research: string; past: string[]; deployment: string } }): Promise<{ concepts: PackagingConcept[] }> {
  const p = packagingPrompt(data.topic, data.facts, data.research, data.past);
  const r = await azureJson<{ concepts: PackagingConcept[] }>(data.deployment, p.system, p.user, 'packaging', packagingSchema, 'Packaging concepts', 'low');
  return { concepts: (r.concepts ?? []).filter(c => c?.title && c.promise).slice(0, 12) };
}

export async function dossierOperation({ data }: { data: { topic: string; facts: string; research: string; deployment: string } }): Promise<Dossier> {
  const p = dossierPrompt(data.topic, data.facts, data.research);
  const r = await azureJson<Dossier>(data.deployment, p.system, p.user, 'dossier', dossierSchema, 'Research dossier', 'low');
  return {
    facts: (r.facts ?? []).filter(f => f?.fact?.trim()).slice(0, 40).map(f => ({ fact: f.fact.trim().slice(0, 400), source: String(f.source ?? '').slice(0, 120), surprise: clamp(f.surprise, 1, 5, 3) })),
    people: (r.people ?? []).slice(0, 8), quotes: (r.quotes ?? []).filter(q => q?.text && q.who).slice(0, 6), angle: String(r.angle ?? '').slice(0, 400),
  };
}

export async function outlineOperation({ data }: { data: { topic: string; promise: string; title: string; hook: string; durationSec: number; dossier: Dossier; archetype: string; deployment: string } }): Promise<Outline> {
  const p = outlinePrompt(data);
  const r = await azureJson<Outline>(data.deployment, p.system, p.user, 'outline', outlineSchema, 'Chapter outline', 'low');
  const n = chapterCount(data.durationSec);
  const chapters = (r.chapters ?? []).slice(0, 16).map(c => ({ ...c, facts: (c.facts ?? []).filter(i => Number.isInteger(i) && i >= 0 && i < data.dossier.facts.length).slice(0, 8), words: clamp(c.words, 80, 400, 190), rehooks: (c.rehooks ?? []).slice(0, 4) }));
  if (chapters.length < Math.max(3, Math.floor(n / 2))) throw new Error('The outline came back with too few chapters');
  return { characters: (r.characters ?? []).filter(c => c?.name?.trim()).slice(0, 4).map(c => ({ name: c.name.trim().slice(0, 60), role: String(c.role ?? '').slice(0, 80), look: String(c.look ?? '').slice(0, 240) })), chapters, coldOpen: r.coldOpen, finalReframe: String(r.finalReframe ?? ''), twistChapter: clamp(r.twistChapter, 0, chapters.length - 1, Math.floor(chapters.length / 2)) };
}

export async function chapterOperation({ data }: { data: { topic: string; title: string; index: number; outline: Outline; dossier: Dossier; style: string; priorLine: string; hook: string; first: boolean; deployment: string } }): Promise<ChapterDraft> {
  const p = chapterPrompt(data);
  const r = await azureJson<ChapterDraft>(data.deployment, p.system, p.user, 'chapter', chapterSchema, `Chapter ${data.index + 1}`, 'low');
  const scenes = (r.scenes ?? []).filter(s => s?.narration?.trim() && s.image_prompt?.trim());
  if (scenes.length < 3) throw new Error(`Chapter ${data.index + 1} came back too short`);
  return { scenes, summary: String(r.summary ?? '').slice(0, 300) };
}

export async function sagOperation({ data }: { data: { lines: { scene: number; text: string }[]; problems: string[]; deployment: string } }): Promise<{ patches: { scene: number; narration: string }[] }> {
  const p = sagPrompt(data.lines, data.problems);
  const r = await azureJson<{ patches: { scene: number; narration: string; why: string }[] }>(data.deployment, p.system, p.user, 'patches', patchSchema, 'Script edit pass', 'low');
  const ok = new Set(data.lines.map(l => l.scene));
  return { patches: (r.patches ?? []).filter(x => ok.has(x.scene) && x.narration?.trim()).slice(0, 40).map(x => ({ scene: x.scene, narration: x.narration })) };
}

export async function coldOpenOperation({ data }: { data: { topic: string; title: string; outline: Outline; style: string; deployment: string } }): Promise<{ scenes: { narration: string; image_prompt: string; characters: string[] }[]; titleSubtitle: string }> {
  const p = coldOpenPrompt(data);
  const r = await azureJson<{ scenes: { narration: string; image_prompt: string; characters: string[] }[]; titleSubtitle: string }>(data.deployment, p.system, p.user, 'coldopen', coldOpenSchema, 'Cold open', 'low');
  const scenes = (r.scenes ?? []).filter(s => s?.narration?.trim() && s.image_prompt?.trim()).slice(0, 6);
  if (scenes.length < 3) throw new Error('The cold open came back too short');
  return { scenes, titleSubtitle: String(r.titleSubtitle ?? '').slice(0, 60) };
}

export async function planVisualsOperation({ data }: { data: { scenes: { index: number; text: string }[]; topic: string; sources: string[]; deployment: string } }): Promise<AiScenePlan[]> {
  const p = visualPrompt(data.scenes, data.topic, data.sources);
  const r = await azureJson<VisualAnswer>(data.deployment, p.system, p.user, 'visuals', visualSchema, 'Visual plan', 'low');
  return parseVisualPlan(r, new Set(data.scenes.map(s => s.index)));
}

// ------------------------------------------------------------------------------------------------ the cast
export async function castOperation({ data }: { data: { topic: string; era: Era; lines: { index: number; text: string }[]; known: string[]; deployment: string } }): Promise<{ cast: CastEntry[] }> {
  const p = castPrompt(data.topic, data.era, data.lines, data.known);
  const r = await azureJson<{ cast: { name: string; kind: string; label: string; look: string }[] }>(data.deployment, p.system, p.user, 'cast', castSchema, 'Casting', 'low');
  return { cast: parseCast(r, data.lines.map(l => l.text), data.era) };
}

/** One transparent cutout. `prompts` are tried in order: a 400 (the image service refused, usually because of a real person) moves on to the next, plainer one. */
export async function paintCutoutOperation({ data }: { data: { prompts: string[]; deployment: string } }): Promise<{ image: string; tried: number }> {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(data.deployment)) throw new Error('Invalid deployment name');
  for (let i = 0; i < data.prompts.length; i++) {
    const res = await azureOpenAIRequest(`${data.deployment}/images/generations`, { prompt: data.prompts[i]!.slice(0, 3900), size: '1024x1536', quality: 'medium', background: 'transparent', output_format: 'png', n: 1 });
    if (res.ok) { const j = await res.json() as { data?: { b64_json?: string }[] }; const b = j.data?.[0]?.b64_json; if (b) return { image: b, tried: i }; continue; }
    if (res.status === 429 || res.status >= 500) throw new Error(`[${res.status}] The image service is busy`);   // the caller retries these; they are not refusals
  }
  throw new Error('The image service refused every version of this character');
}
