// The visual planner's model call: prompt, strict schema and the safe reading of its answer. Pure, so it is tested without a model.
import { CARD_KINDS, MOVES, SFX, TRANSITIONS, type AiBeat, type AiScenePlan, type CardData } from './types';

const clamp = (n: unknown, lo: number, hi: number, d: number) => { const v = Number(n); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
export interface VisualAnswer { scenes?: { scene: number; beats?: { w0: number; w1: number; kind: string; move: string; focus_x: number; focus_y: number; data_json: string; overlay_kind: string; overlay_json: string; sfx: string; transition: string }[] }[] }

// ------------------------------------------------------------------------------------------------ visual plan
export const visualSchema = {
  type: 'object', additionalProperties: false, required: ['scenes'],
  properties: { scenes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['scene', 'beats'], properties: {
    scene: { type: 'integer' },
    beats: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['w0', 'w1', 'kind', 'move', 'focus_x', 'focus_y', 'data_json', 'overlay_kind', 'overlay_json', 'sfx', 'transition'], properties: {
      w0: { type: 'integer' }, w1: { type: 'integer' }, kind: { type: 'string', enum: ['image', ...CARD_KINDS.filter(k => k !== 'chapter' && k !== 'title')] }, move: { type: 'string', enum: [...MOVES] },
      focus_x: { type: 'number' }, focus_y: { type: 'number' }, data_json: { type: 'string' }, overlay_kind: { type: 'string', enum: ['none', 'lower_third', 'date_stamp', 'source_tag', 'speech'] }, overlay_json: { type: 'string' },
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
- balance: two spoken quantities weighed against each other (arms race, army sizes, budgets). {"left":{"label":"USA","value":"6,000","unit":"warheads"},"right":{...},"title":"..."}
Cards must not be more than 1 beat in 3. Never invent a number, date, place or quote. Camera: push for tension and focus, pull for reveals and scale, pan/tilt for travel and height, orbit for depth, punch for shocks, drift or hold for quiet. Never repeat the same move twice in a row. overlay_kind: lower_third when a named person first appears (name, sub), date_stamp when a place or year is introduced (place, when), speech when a person says something quoted in the line (data {"text":"the exact spoken words","side":"left"|"right"}), shown as a speech bubble; source_tag only for a source named in: ${sources.slice(0, 6).join(' | ') || 'none'}. sfx: hit on a shock, riser before a reveal, whoosh on fast travel, scratch or boing on a wry aside, none otherwise. transition: cross between ideas, cut inside one idea, dip for time passing, whip for action, flash for a shock.`,
  user: `Topic: ${topic}\n\n${scenes.map(s => `[${s.index}] ${s.text}`).join('\n')}\n\nFor every line give word-range beats in order. Use data_json "{}" and overlay_json "{}" when unused.`,
});

const parseJson = (s: string): CardData => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v as CardData : {}; } catch { return {}; } };

/** Turns the model's flat answer into planner input; anything out of range is dropped here and checked again against the words later. */
export function parseVisualPlan(r: VisualAnswer, valid: Set<number>): AiScenePlan[] {
  return (r.scenes ?? []).filter(s => valid.has(s.scene)).map(s => ({
    scene: s.scene,
    beats: (s.beats ?? []).slice(0, 12).map((b): AiBeat => ({
      w0: Math.max(0, Math.floor(Number(b.w0) || 0)), w1: Math.floor(Number(b.w1) || 0), kind: (b.kind === 'image' || (CARD_KINDS as readonly string[]).includes(b.kind) ? b.kind : 'image') as AiBeat['kind'],
      move: (MOVES as readonly string[]).includes(b.move) ? b.move as AiBeat['move'] : undefined, focus: [clamp(b.focus_x, .15, .85, .5), clamp(b.focus_y, .15, .85, .45)],
      data: parseJson(b.data_json), sfx: (SFX as readonly string[]).includes(b.sfx) && b.sfx !== 'none' ? b.sfx as AiBeat['sfx'] : undefined,
      transition: (TRANSITIONS as readonly string[]).includes(b.transition) ? b.transition as AiBeat['transition'] : undefined,
      ...(b.overlay_kind && b.overlay_kind !== 'none' ? { overlay: { kind: b.overlay_kind as 'lower_third' | 'date_stamp' | 'source_tag' | 'speech', data: parseJson(b.overlay_json) } } : {}),
    })),
  }));
}
