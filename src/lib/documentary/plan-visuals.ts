// Visual beats: every scene is cut into beats of about 2-4 seconds, and each beat decides what NEW thing the viewer looks at:
// a different part of the picture, or a card drawn by code from exact data (a counter, a map, a timeline, a quote, a document).
// A card is only used when the words it shows are really spoken in the narration, so a graphic can never state something the narrator did not say.
import { cardValue, findSpokenNumbers, labelAfter, type SpokenNumber } from './spoken-numbers';
import { DOC_WPS, type AiBeat, type AiScenePlan, type BeatVisual, type CardData, type CardKind, type DocBeat, type Move, type Mood, type OverlaySpec, type Sfx, type Transition, MOVES, CARD_KINDS } from './types';

const STOP = new Set('a an the of and or to in on at for with from by as is was were are be been it its they their his her this that these those who which had has have not no but he she we you i so than then there here what when where how'.split(' '));
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
const contentWords = (s: string) => s.split(/\s+/).map(norm).filter(w => w.length > 2 && !STOP.has(w));

/** Share of the content words of `text` that the narration actually says (0..1). */
export function overlap(text: string, narration: string[]): number {
  const have = new Set(narration.map(norm));
  const mine = contentWords(text);
  if (!mine.length) return 0;
  return mine.filter(w => have.has(w) || have.has(w.replace(/s$/, '')) || have.has(`${w}s`)).length / mine.length;
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---------------------------------------------------------------------------------------------------- beat sizes
/** Cuts `n` words into runs of about `target` words, preferring to break at punctuation. Returns [w0, w1) ranges. */
export function chunkWords(words: string[], from = 0, to = words.length, target = 8, min = 4, max = 13): [number, number][] {
  const out: [number, number][] = [];
  let start = from;
  while (start < to) {
    const left = to - start;
    if (left <= Math.max(min * 2 - 1, Math.min(max, 9))) { out.push([start, to]); break; }   // under ~3.5 s stays one beat
    // the best break within [min, max] words: a clause end near the target, else the target itself
    let best = -1, bestScore = -1;
    for (let len = min; len <= Math.min(max, left - min); len++) {   // aim for the target, or half of what is left when that is closer
      const w = words[start + len - 1] ?? '';
      const punct = /[,;:.!?]$/.test(w) ? 3 : /^(and|but|then|so|while|until|because|when|after|before)$/i.test(words[start + len] ?? '') ? 2 : 0;
      const score = punct * 10 - Math.abs(len - Math.min(target, Math.ceil(left / 2)));
      if (score > bestScore) { bestScore = score; best = len; }
    }
    out.push([start, start + (best > 0 ? best : target)]);
    start += best > 0 ? best : target;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- grounding
export interface Ctx {
  /** Narration words of this scene and of the scenes around it (for dates and names mentioned just before or after). */
  words: string[];
  window: string[];
  spoken: SpokenNumber[];
  sources: string[];
}

/** Returns a safe copy of a card's data, or null when something on it is not spoken in the narration. */
export function groundCard(kind: CardKind, data: CardData | undefined, ctx: Ctx): CardData | null {
  const d = data ?? {};
  const win = ctx.window;
  if (kind === 'number') {
    const raw = clip(d['value'], 24).replace(/[^0-9,.]/g, '');
    const v = Number(raw.replace(/,/g, ''));
    if (!raw || !Number.isFinite(v)) return null;
    const hit = ctx.spoken.find(n => n.value === v);
    if (!hit) return null;
    return { value: hit.year ? String(hit.value) : hit.value.toLocaleString('en-US'), label: clip(d['label'], 60), prefix: clip(d['prefix'], 4), suffix: clip(d['suffix'], 12), count: !hit.year };
  }
  if (kind === 'quote') {
    const text = clip(d['text'], 200);
    if (text.split(' ').length < 3 || overlap(text, ctx.words) < .7) return null;
    return { text, who: clip(d['who'], 50), role: clip(d['role'], 60) };
  }
  if (kind === 'keyfact') {
    const text = clip(d['text'], 120);
    if (text.split(' ').length < 3 || overlap(text, ctx.words) < .6) return null;
    const mark = (Array.isArray(d['mark']) ? d['mark'] : []).map(m => clip(m, 20)).filter(m => m && overlap(m, ctx.words) > 0).slice(0, 3);
    return { text, tag: clip(d['tag'], 24), mark };
  }
  if (kind === 'timeline') {
    const spokenYears = new Set(ctx.spoken.filter(n => n.year || n.value >= 100).map(n => n.value));
    const events = (Array.isArray(d['events']) ? d['events'] : []).map(e => e as Record<string, unknown>).map(e => ({ when: clip(e['when'], 16), label: clip(e['label'], 60) }))
      .filter(e => { const y = Number(e.when.replace(/[^0-9]/g, '')); return e.label && Number.isFinite(y) && y > 0 && spokenYears.has(y); }).slice(0, 6);
    return events.length >= 2 ? { events, focus: Math.min(events.length - 1, Math.max(0, Number(d['focus']) || events.length - 1)) } : null;
  }
  if (kind === 'compare') {
    const values = new Set(ctx.spoken.map(n => n.value));
    const items = (Array.isArray(d['items']) ? d['items'] : []).map(e => e as Record<string, unknown>).map(e => ({ label: clip(e['label'], 40), value: clip(e['value'], 16).replace(/[^0-9,.]/g, ''), unit: clip(e['unit'], 10) }))
      .filter(e => e.label && values.has(Number(e.value.replace(/,/g, '')))).slice(0, 5);
    return items.length >= 2 ? { items, title: clip(d['title'], 60) } : null;
  }
  if (kind === 'balance') {
    const values = new Set(ctx.spoken.map(n => n.value));
    const side = (x: unknown) => { const e = (x ?? {}) as Record<string, unknown>; return { label: clip(e['label'], 24), value: clip(e['value'], 16).replace(/[^0-9,.]/g, ''), unit: clip(e['unit'], 12) }; };
    const l = side(d['left']), r = side(d['right']);
    return l.label && r.label && values.has(Number(l.value.replace(/,/g, ''))) && values.has(Number(r.value.replace(/,/g, ''))) && l.value !== r.value ? { left: l, right: r, title: clip(d['title'], 60) } : null;
  }
  if (kind === 'location') {
    const points = (Array.isArray(d['points']) ? d['points'] : []).map(p => p as Record<string, unknown>)
      .map(p => ({ name: clip(p['name'], 28), lat: Number(p['lat']), lon: Number(p['lon']) }))
      .filter(p => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 85 && Math.abs(p.lon) <= 180).slice(0, 6);
    if (!points.length || !points.some(p => overlap(p.name, win) > 0)) return null;
    return { points: points.filter(p => overlap(p.name, win) > 0 || points.length <= 3), route: d['route'] !== false && points.length > 1, title: clip(d['title'], 40) };
  }
  if (kind === 'document') {
    const lines = (Array.isArray(d['lines']) ? d['lines'] : []).map(l => clip(l, 120)).filter(l => l && overlap(l, win) >= .6).slice(0, 5);
    const title = clip(d['title'], 80);
    if (!lines.length && !(title && overlap(title, win) >= .6)) return null;
    const masthead = clip(d['masthead'], 40);
    return { kind: d['kind'] === 'headline' ? 'headline' : 'letter', masthead: masthead && overlap(masthead, win) > 0 ? masthead : '', title, lines, stamp: clip(d['stamp'], 20), date: clip(d['date'], 30) };
  }
  if (kind === 'steps') {
    const steps = (Array.isArray(d['steps']) ? d['steps'] : []).map(s => clip(s, 40)).filter(s => s && overlap(s, win) >= .5).slice(0, 5);
    return steps.length >= 3 ? { steps, title: clip(d['title'], 60) } : null;
  }
  if (kind === 'chapter' || kind === 'title') return { number: clip(d['number'], 3), title: clip(d['title'], 70), subtitle: clip(d['subtitle'], 80) };
  return null;
}

function groundOverlay(o: AiBeat['overlay'], ctx: Ctx): OverlaySpec | null {
  if (!o) return null;
  const d = o.data ?? {};
  if (o.kind === 'lower_third') {
    const name = clip(d['name'], 40);
    return name && overlap(name, ctx.window) > 0 ? { kind: 'lower_third', data: { name, sub: clip(d['sub'], 60) }, at: .4, dur: 3 } : null;
  }
  if (o.kind === 'date_stamp') {
    const when = clip(d['when'], 20), place = clip(d['place'], 30);
    const y = Number(when.replace(/[^0-9]/g, ''));
    const okWhen = !when || ctx.spoken.some(n => n.value === y);
    const okPlace = !place || overlap(place, ctx.window) > 0;
    return (when || place) && okWhen && okPlace ? { kind: 'date_stamp', data: { when, place }, at: .3, dur: 3 } : null;
  }
  if (o.kind === 'speech') {
    const text = clip(d['text'], 120);
    return text.split(' ').length >= 3 && overlap(text, ctx.words) >= .7 ? { kind: 'speech', data: { text, side: d['side'] === 'right' ? 'right' : 'left' }, at: .3, dur: 3 } : null;   // only words the narrator really says
  }
  if (o.kind === 'source_tag') {
    const text = clip(d['text'], 60);
    return text && ctx.sources.some(s => s.toLowerCase().includes(text.toLowerCase().slice(0, 30)) || text.toLowerCase().includes(s.toLowerCase().slice(0, 30))) ? { kind: 'source_tag', data: { text }, at: .6, dur: 3 } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------- planning one scene
export interface SceneInput {
  index: number;
  text: string;
  mood?: Mood | undefined;
  /** The scene is part of the cold open: short beats, strongest pictures, tension. */
  cold?: boolean | undefined;
  /** First scene of a chapter (its card is added by the manifest builder). */
  chapterStart?: boolean | undefined;
  ai?: AiScenePlan | undefined;
  prev?: string[] | undefined;
  next?: string[] | undefined;
  sources?: string[] | undefined;
  /** Index of the scene's own picture in the manifest's image list. */
  image: number;
  /** 'long' = long-form pacing: held pictures (about 14-22 s) and animated boards every third picture. */
  pace?: 'long' | undefined;
}

const ACTION = /\b(ran|run|runs|charg\w+|attack\w*|fled|flee\w*|fell|fall\w*|crash\w*|rush\w*|storm\w*|fight\w*|fought|burn\w*|exploded|escap\w+|chas\w+|march\w*|raced|jump\w*|leap\w*|sailed|crossed)\b/i;
const REVEAL = /\b(but|until|then|suddenly|however|actually|truth|turns out|secret|finally|except)\b/i;

/** Number cards the planner can build on its own: a counted thing spoken as a round, big number. */
export function heuristicNumberBeat(words: string[], spoken: SpokenNumber[], taken: [number, number][]): AiBeat | null {
  for (const n of spoken) {
    if (n.year || n.value < 100 || n.end - n.start > 5) continue;
    if (taken.some(([a, b]) => n.start < b && n.end > a)) continue;
    const label = labelAfter(words, n.end);
    if (!label || label.split(' ').length > 3) continue;
    // a counter that would come after one or two lead-in words starts with the line instead of a blink-long picture beat
    return { w0: n.start < 3 ? 0 : n.start, w1: Math.min(words.length, Math.max(n.end + 2, n.start + 4)), kind: 'number', data: { value: cardValue(n), label } };
  }
  return null;
}

export function planScene(s: SceneInput, state: CameraState): DocBeat[] {
  const words = s.text.split(/\s+/).filter(Boolean);
  const n = words.length;
  const spoken = findSpokenNumbers(words);
  const win = [...(s.prev ?? []), ...words, ...(s.next ?? [])];
  const ctx: Ctx = { words, window: win, spoken: findSpokenNumbers(win), sources: s.sources ?? [] };
  // 1) the proposed beats that survive the checks (cards must be grounded; images just need a sane range)
  const picked: { range: [number, number]; ai: AiBeat; data?: CardData | undefined }[] = [];
  for (const b of (s.ai?.beats ?? []).slice().sort((x, y) => x.w0 - y.w0)) {
    const w0 = Math.max(0, Math.floor(b.w0)), w1 = Math.min(n, Math.ceil(b.w1));
    if (!(w1 - w0 >= 2) || picked.some(p => w0 < p.range[1] && w1 > p.range[0])) continue;
    if (b.kind === 'image') { picked.push({ range: [w0, w1], ai: b }); continue; }
    if (!CARD_KINDS.includes(b.kind as CardKind) || b.kind === 'chapter' || b.kind === 'title') continue;
    const data = groundCard(b.kind as CardKind, b.data, { ...ctx, spoken: ctx.spoken });
    if (data) picked.push({ range: [w0, w1], ai: b, data });
  }
  // 2) a spoken counted number nobody planned a card for gets one (never in the cold open, which is all pictures)
  if (!s.cold && !picked.some(p => p.ai.kind !== 'image')) {
    const h = heuristicNumberBeat(words, spoken, picked.map(p => p.range));
    if (h && n >= 8) { const data = groundCard('number', h.data, ctx); if (data) picked.push({ range: [h.w0, h.w1], ai: h, data }); }
  }
  picked.sort((a, b) => a.range[0] - b.range[0]);
  // 3) fill everything not covered with picture beats of a sensible length
  const long = s.pace === 'long';
  const target = s.cold ? 5 : long ? 30 : 8, min = s.cold ? 3 : long ? 18 : 4, max = s.cold ? 7 : long ? 44 : 13;
  const spans: { range: [number, number]; ai?: AiBeat | undefined; data?: CardData | undefined }[] = [];
  let at = 0;
  const pushImages = (a: number, b: number) => { for (const r of chunkWords(words, a, b, target, min, max)) spans.push({ range: r }); };
  for (const p of picked) {
    if (p.range[0] > at) pushImages(at, p.range[0]);
    if (p.ai.kind === 'image') {
      // an image beat the planner sized itself is kept if it is not too long
      if (p.range[1] - p.range[0] > max + 2) pushImages(p.range[0], p.range[1]); else spans.push({ range: p.range, ai: p.ai });
    } else spans.push({ range: p.range, ai: p.ai, data: p.data });
    at = p.range[1];
  }
  if (at < n) pushImages(at, n);
  // a card right at the start of a scene would hide its picture; keep at least one picture beat in the scene
  if (spans.length && spans.every(sp => sp.data)) spans[0] = { range: spans[0]!.range };
  // 4) beats: camera, transition, sound
  const beats: DocBeat[] = [];
  spans.forEach((sp, k) => {
    const card = sp.data && sp.ai ? (sp.ai.kind as CardKind) : null;
    const first = k === 0;
    const sfx: Sfx | undefined = sp.ai?.sfx ?? (card === 'keyfact' ? 'hit' : s.cold && first ? 'hit' : undefined);
    const mood = s.mood ?? (s.cold ? 'tension' : undefined);
    const text = words.slice(sp.range[0], sp.range[1]).join(' ');
    let transition: Transition = sp.ai?.transition ?? (first ? (s.chapterStart ? 'dip' : card ? (card === 'number' ? 'flash' : 'cross') : ACTION.test(text) ? 'whip' : 'cross') : card ? 'cross' : 'cut');
    if (s.cold && !card) transition = first ? 'cut' : 'cut';
    const overlay = groundOverlay(sp.ai?.overlay, ctx);
    const overlays = overlay ? [overlay] : undefined;
    if (card) {
      beats.push({ scene: s.index, w0: sp.range[0], w1: sp.range[1], visual: { type: 'card', card, data: sp.data!, bg: s.image }, transition, ...(sfx ? { sfx } : {}), ...(overlays ? { overlays } : {}), ...(mood ? { mood } : {}) });
    } else {
      beats.push({ scene: s.index, w0: sp.range[0], w1: sp.range[1], visual: pickCamera(state, { text, mood, first, image: s.image, cold: !!s.cold, ai: sp.ai }), transition, ...(sfx ? { sfx } : {}), ...(overlays ? { overlays } : {}), ...(mood ? { mood } : {}) });
    }
  });
  // a date stamp the first time a year is spoken, then at most one every ~25 seconds (the way history channels mark time)
  for (const b of beats) {
    state.stampGap--;
    if (b.visual.type !== 'image' || b.overlays?.length || state.stampGap > 0) continue;
    const y = spoken.find(n => (n.year || n.era) && n.start >= b.w0 && n.start < b.w1);
    if (y) { b.overlays = [{ kind: 'date_stamp', data: { when: cardValue(y) }, at: .3, dur: 3 }]; state.stampGap = 8; }
  }
  return beats;
}

// ---------------------------------------------------------------------------------------------------- camera choice
export interface CameraState { count: number; last?: Move; lastSrc?: number; lastWide: boolean; cursor: Record<string, number>; stampGap: number }
export const newCameraState = (): CameraState => ({ count: 0, lastWide: false, cursor: {}, stampGap: 0 });

const POOL: Record<string, Move[]> = {
  action: ['pan_left', 'pan_right', 'punch', 'orbit_left', 'orbit_right'],
  tension: ['push', 'drift', 'orbit_left', 'punch', 'push'],
  reveal: ['pull', 'push', 'orbit_right', 'pull'],
  calm: ['push', 'pan_right', 'orbit_right', 'pull', 'pan_left', 'drift', 'tilt_up', 'orbit_left', 'tilt_down'],
};
const FOCI: [number, number][] = [[.5, .46], [.34, .5], [.66, .48], [.45, .4], [.58, .55], [.3, .42], [.7, .42]];

export function pickCamera(state: CameraState, o: { text: string; mood?: Mood | undefined; first: boolean; image: number; cold: boolean; ai?: AiBeat | undefined }): BeatVisual {
  const kind = ACTION.test(o.text) ? 'action' : o.mood === 'tension' || o.mood === 'dark' ? 'tension' : o.mood === 'reveal' || REVEAL.test(o.text) ? 'reveal' : 'calm';
  const pool = POOL[kind]!;
  const sameSrc = state.lastSrc === o.image;
  const detailBeat = sameSrc && !o.first;
  // a close-up beat never pulls back (it would undo the zoom), and no beat repeats the move of the one before it
  const allowed = (m: Move) => !(detailBeat && (m === 'pull' || m === 'hold')) && m !== state.last;
  let move: Move = o.ai?.move && (MOVES as readonly string[]).includes(o.ai.move) && allowed(o.ai.move) ? o.ai.move : pool[(state.cursor[kind] = (state.cursor[kind] ?? (o.cold ? 1 : -1)) + 1) % pool.length]!;
  for (let k = 0; !allowed(move) && k < pool.length; k++) move = pool[(pool.indexOf(move) + 1 + pool.length) % pool.length]!;
  if (!allowed(move)) move = MOVES.find(allowed) ?? 'drift';
  // a second beat on the same picture looks at a different part of it, closer in, so the eye sees something new
  const focus = (o.ai?.focus && o.ai.focus.length === 2 ? [Math.min(.85, Math.max(.15, o.ai.focus[0]!)), Math.min(.85, Math.max(.15, o.ai.focus[1]!))] : FOCI[(state.count * 2 + (sameSrc ? 3 : 0)) % FOCI.length]!) as [number, number];
  const detail = detailBeat;
  const v: BeatVisual = { type: 'image', src: o.image, move, focus, strength: o.cold ? 1.25 : .8 + ((state.count * 7) % 5) * .1 };
  if (detail) v.zoom = [1.32, 1.55];
  if (o.cold && !detail) v.zoom = [1.1, 1.38];
  state.count++; state.last = v.move; state.lastSrc = o.image;
  return v;
}

// ---------------------------------------------------------------------------------------------------- whole video
/** Plans every scene in order with one shared camera state, so no two neighbouring beats move the same way. */
export function planVideo(scenes: SceneInput[], opts: { pace?: 'long' | undefined } = {}): DocBeat[] {
  const state = newCameraState();
  const out: DocBeat[] = [];
  scenes.forEach((sc, i) => out.push(...planScene({ ...sc, ...(opts.pace ? { pace: opts.pace } : {}), prev: i > 0 ? scenes[i - 1]!.text.split(/\s+/).slice(-14) : [], next: i + 1 < scenes.length ? scenes[i + 1]!.text.split(/\s+/).slice(0, 14) : [] }, state)));
  if (opts.pace === 'long') {
    // long-form: every third held picture (never in the cold open) becomes an animated board that carries the story's elements
    let plain = 0;
    return limitCards(out.map(b => {
      if (b.visual.type !== 'image' || scenes[b.scene]?.cold) return b;
      if (plain++ % 3 !== 2) return b;
      return { ...b, visual: { type: 'card', card: 'board', data: { style: (plain / 3) % 2 === 1 ? 'parchment' : 'plaster', seed: b.scene * 7 + plain }, bg: b.visual.src } as BeatVisual, transition: 'cross' as Transition };
    }));
  }
  return limitCards(out);
}

/** Cards are a tool, not wallpaper: never two in a row, and at most 35% of the beats. */
export function limitCards(beats: DocBeat[]): DocBeat[] {
  const max = Math.ceil(beats.length * .35);
  let cards = 0;
  return beats.map((b, i) => {
    if (b.visual.type !== 'card') return b;
    if (b.visual.card === 'board') return b;   // boards are backgrounds for the story, not wallpaper cards: never capped
    const prev = beats[i - 1];
    if (cards >= max || (prev?.visual.type === 'card' && prev.scene === b.scene && prev.visual.card !== 'chapter')) {
      const bg = b.visual.bg ?? 0;
      return { ...b, visual: { type: 'image', src: bg, move: 'drift', focus: [.5, .45] } as BeatVisual, transition: 'cross' };
    }
    cards++;
    return b;
  });
}
