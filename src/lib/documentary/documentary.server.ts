// Server-side AI steps of the long-form pipeline. Each one asks for strict JSON, checks it, and never trusts a model with numbers or places:
// whatever it proposes is verified against the narration again before it reaches a card (plan-visuals.ts).
import { azureJson } from '../pipeline-operations.server';
import { packagingPrompt, packagingSchema, type PackagingConcept } from './packaging';
import { chapterPrompt, chapterSchema, coldOpenPrompt, coldOpenSchema, dossierPrompt, dossierSchema, outlinePrompt, outlineSchema, patchSchema, sagPrompt, chapterCount,
  type ChapterDraft, type Dossier, type Outline } from './long-script';
import { CARD_KINDS, MOVES, SFX, TRANSITIONS, type AiBeat, type AiScenePlan, type CardData } from './types';

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
  return { chapters, coldOpen: r.coldOpen, finalReframe: String(r.finalReframe ?? ''), twistChapter: clamp(r.twistChapter, 0, chapters.length - 1, Math.floor(chapters.length / 2)) };
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

// ------------------------------------------------------------------------------------------------ visual plan
const visualSchema = {
  type: 'object', additionalProperties: false, required: ['scenes'],
  properties: { scenes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['scene', 'beats'], properties: {
    scene: { type: 'integer' },
    beats: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['w0', 'w1', 'kind', 'move', 'focus_x', 'focus_y', 'data_json', 'overlay_kind', 'overlay_json', 'sfx', 'transition'], properties: {
      w0: { type: 'integer' }, w1: { type: 'integer' }, kind: { type: 'string', enum: ['image', ...CARD_KINDS.filter(k => k !== 'chapter' && k !== 'title')] }, move: { type: 'string', enum: [...MOVES] },
      focus_x: { type: 'number' }, focus_y: { type: 'number' }, data_json: { type: 'string' }, overlay_kind: { type: 'string', enum: ['none', 'lower_third', 'date_stamp', 'source_tag'] }, overlay_json: { type: 'string' },
      sfx: { type: 'string', enum: [...SFX] }, transition: { type: 'string', enum: [...TRANSITIONS] } } } },
  } } } },
};

export const visualPrompt = (scenes: { index: number; text: string }[], topic: string, sources: string[]) => ({
  system: `You are the editor of a viral history/fact documentary. For each narration line you cut the picture into beats of 2-4 seconds (about 6-10 words each, word ranges [w0,w1) over the line's words, covering the whole line without gaps) and decide what NEW thing the viewer sees on each beat.
Use kind "image" (a different part of the same painting: give focus_x/focus_y 0.15-0.85 where the camera looks and a camera move) most of the time. Use a CARD only when the narration itself says exactly what the card shows:
- number: a counted quantity spoken in the line. data_json {"value":"37,000","label":"soldiers"} (digits of the SPOKEN number only).
- timeline: 2-5 dated events whose years are all spoken. {"events":[{"when":"218 BC","label":"Crosses the Alps"}]}
- location: a journey or place spoken in the line. {"points":[{"name":"Carthage","lat":36.85,"lon":10.32},...],"route":true} (real coordinates, only places named in the line).
- compare: 2-5 spoken quantities to compare. {"items":[{"label":"Eiffel Tower","value":"330","unit":"m"}]}
- quote: words someone said, spoken in the line. {"text":"...","who":"..."}
- keyfact: the single most surprising sentence of the line, repeated big. {"text":"...","tag":"The twist","mark":["half"]}
- document: a letter, record or headline described in the line. {"kind":"headline","masthead":"","title":"...","lines":["..."],"stamp":""}
- steps: a chain of 3-5 spoken causes. {"steps":["..."]}
Cards must not be more than 1 beat in 3. Never invent a number, date, place or quote. Camera: push for tension and focus, pull for reveals and scale, pan/tilt for travel and height, orbit for depth, punch for shocks, drift or hold for quiet. Never repeat the same move twice in a row. overlay_kind: lower_third when a named person first appears (name, sub), date_stamp when a place or year is introduced (place, when), source_tag only for a source named in: ${sources.slice(0, 6).join(' | ') || 'none'}. sfx: hit on a shock, riser before a reveal, whoosh on fast travel, none otherwise. transition: cross between ideas, cut inside one idea, dip for time passing, whip for action, flash for a shock.`,
  user: `Topic: ${topic}\n\n${scenes.map(s => `[${s.index}] ${s.text}`).join('\n')}\n\nFor every line give word-range beats in order. Use data_json "{}" and overlay_json "{}" when unused.`,
});

const parseJson = (s: string): CardData => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v as CardData : {}; } catch { return {}; } };

export async function planVisualsOperation({ data }: { data: { scenes: { index: number; text: string }[]; topic: string; sources: string[]; deployment: string } }): Promise<AiScenePlan[]> {
  const p = visualPrompt(data.scenes, data.topic, data.sources);
  const r = await azureJson<{ scenes: { scene: number; beats: { w0: number; w1: number; kind: string; move: string; focus_x: number; focus_y: number; data_json: string; overlay_kind: string; overlay_json: string; sfx: string; transition: string }[] }[] }>(
    data.deployment, p.system, p.user, 'visuals', visualSchema, 'Visual plan', 'low');
  return parseVisualPlan(r, new Set(data.scenes.map(s => s.index)));
}

/** Turns the model's flat answer into planner input; anything out of range is dropped here and checked again against the words later. */
export function parseVisualPlan(r: { scenes?: { scene: number; beats?: { w0: number; w1: number; kind: string; move: string; focus_x: number; focus_y: number; data_json: string; overlay_kind: string; overlay_json: string; sfx: string; transition: string }[] }[] }, valid: Set<number>): AiScenePlan[] {
  return (r.scenes ?? []).filter(s => valid.has(s.scene)).map(s => ({
    scene: s.scene,
    beats: (s.beats ?? []).slice(0, 12).map((b): AiBeat => ({
      w0: Math.max(0, Math.floor(Number(b.w0) || 0)), w1: Math.floor(Number(b.w1) || 0), kind: (b.kind === 'image' || (CARD_KINDS as readonly string[]).includes(b.kind) ? b.kind : 'image') as AiBeat['kind'],
      move: (MOVES as readonly string[]).includes(b.move) ? b.move as AiBeat['move'] : undefined, focus: [clamp(b.focus_x, .15, .85, .5), clamp(b.focus_y, .15, .85, .45)],
      data: parseJson(b.data_json), sfx: (SFX as readonly string[]).includes(b.sfx) && b.sfx !== 'none' ? b.sfx as AiBeat['sfx'] : undefined,
      transition: (TRANSITIONS as readonly string[]).includes(b.transition) ? b.transition as AiBeat['transition'] : undefined,
      ...(b.overlay_kind && b.overlay_kind !== 'none' ? { overlay: { kind: b.overlay_kind as 'lower_third' | 'date_stamp' | 'source_tag', data: parseJson(b.overlay_json) } } : {}),
    })),
  }));
}
