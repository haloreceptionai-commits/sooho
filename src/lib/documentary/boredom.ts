// The boredom meter: numbers that say how a cut will feel, measured on the plan before any picture is painted or any machine is paid.
// It looks at what the viewer sees (how often the picture changes, how many different things they look at, how long anything sits still)
// and at what they hear (sentence rhythm, filler, facts per half minute), minute by minute, and says exactly which minute is weak and why.
import { findSpokenNumbers } from './spoken-numbers';
import { DOC_WPS, type DocManifest, type DocBeat } from './types';

export const TARGETS = { changesPerMin: [15, 26], distinctPerMin: 12, maxStaticSec: 4.6, minTypesPerMin: 2, factsPer30s: 1.2, longSentence: 32 } as const;

export interface MinuteReport { minute: number; score: number; changes: number; distinct: number; types: number; maxStatic: number; facts30: number; reasons: string[] }
export interface BoredomReport {
  score: number; pass: boolean; minutes: MinuteReport[]; weakest: number[];
  metrics: { changesPerMin: number; distinctPerMin: number; maxStaticSec: number; cardShare: number; repeatedFramings: number; sentenceMean: number; sentenceSd: number; longSentences: number; filler: number; repeatedPhrases: number; durationSec: number };
}

const FILLER = new Set(['really', 'very', 'just', 'actually', 'basically', 'literally', 'simply', 'quite', 'somewhat', 'definitely', 'certainly']);
const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');
const CARD_SEC: Record<string, number> = { timeline: 2.6, location: 3.2, compare: 2.6, steps: 3.0, document: 2.6, chapter: 2.0, title: 2.4 };

/** Estimated start/end of every beat from word counts (the real timings come from the narration later; this is for planning). */
export function estimateTimes(m: Pick<DocManifest, 'scenes' | 'beats' | 'pauses'>): { start: number; end: number; beat: DocBeat }[] {
  const sceneStart: number[] = [];
  let t = 0;
  for (const sc of m.scenes) { sceneStart.push(t); t += sc.text.split(/\s+/).filter(Boolean).length / DOC_WPS + .18; }
  const pauseBefore = (scene: number) => m.pauses.filter(p => p.scene < scene).reduce((a, p) => a + p.sec, 0);
  const sorted = [...m.beats].sort((a, b) => a.scene - b.scene || a.w0 - b.w0);
  const starts = sorted.map(b => sceneStart[b.scene]! + b.w0 / DOC_WPS + pauseBefore(b.scene));
  for (let i = 1; i < starts.length; i++) starts[i] = Math.max(starts[i]!, starts[i - 1]! + .25);
  for (let i = 0; i < sorted.length - 1; i++) {
    const v = sorted[i]!.visual;
    const need = v.type === 'card' ? CARD_SEC[v.card] ?? 1.7 : .8;
    if (starts[i + 1]! - starts[i]! < need) starts[i + 1] = starts[i]! + need;
  }
  const end = Math.max(t, (starts.at(-1) ?? 0) + 1);
  return sorted.map((beat, i) => ({ start: starts[i]!, end: i + 1 < sorted.length ? starts[i + 1]! : end, beat }));
}

const signature = (b: DocBeat) => {
  const v = b.visual;
  if (v.type === 'card') return `card:${v.card}:${JSON.stringify(v.data).slice(0, 80)}`;
  const f = v.focus ?? [.5, .5], z = v.zoom ? Math.round(v.zoom[1] * 10) : 0;
  return `img:${v.src}:${Math.round(f[0] * 3)}:${Math.round(f[1] * 3)}:${z}`;
};
const kindOf = (b: DocBeat) => (b.visual.type === 'card' ? `card:${b.visual.card}` : 'picture');

export function boredomReport(m: DocManifest): BoredomReport {
  const timed = estimateTimes(m);
  const duration = timed.at(-1)?.end ?? 1;
  const minutes: MinuteReport[] = [];
  const spokenAll: { t: number }[] = [];
  // facts: numbers and capitalised names (not at the start of a sentence), placed at the time of their scene
  let clock = 0;
  m.scenes.forEach(sc => {
    const words = sc.text.split(/\s+/).filter(Boolean);
    const dur = words.length / DOC_WPS;
    findSpokenNumbers(words).forEach(n => spokenAll.push({ t: clock + n.start / DOC_WPS }));
    words.forEach((w, i) => { if (i > 0 && /^[A-Z][a-z]{2,}/.test(w) && !/[.!?]$/.test(words[i - 1]!)) spokenAll.push({ t: clock + i / DOC_WPS }); });
    clock += dur + .18;
  });
  const total = Math.max(1, Math.ceil(duration / 60));
  for (let mi = 0; mi < total; mi++) {
    const a = mi * 60, b = Math.min(duration, a + 60);
    if (b - a < 15) continue;
    const inside = timed.filter(x => x.start >= a && x.start < b);
    const changes = inside.length * 60 / (b - a);
    const distinct = new Set(inside.map(x => signature(x.beat))).size * 60 / (b - a);
    const types = new Set(inside.map(x => kindOf(x.beat))).size;
    const maxStatic = Math.max(0, ...timed.filter(x => x.end > a && x.start < b).map(x => Math.min(x.end, b) - Math.max(x.start, a)));
    const facts = spokenAll.filter(f => f.t >= a && f.t < b).length * 30 / (b - a);
    const reasons: string[] = [];
    let score = 100;
    const [lo] = TARGETS.changesPerMin;
    if (changes < lo) { score -= (lo - changes) * 3.2; reasons.push(`only ${changes.toFixed(0)} picture changes (aim ${lo}+)`); }
    if (distinct < TARGETS.distinctPerMin) { score -= (TARGETS.distinctPerMin - distinct) * 3; reasons.push(`only ${distinct.toFixed(0)} different things to look at (aim ${TARGETS.distinctPerMin}+)`); }
    if (maxStatic > TARGETS.maxStaticSec) { score -= (maxStatic - TARGETS.maxStaticSec) * 7; reasons.push(`one picture stays ${maxStatic.toFixed(1)} s`); }
    if (types < TARGETS.minTypesPerMin) { score -= 10; reasons.push('only one kind of visual'); }
    if (facts < TARGETS.factsPer30s * .5 && inside.length) { score -= 8; reasons.push('almost no names or numbers: nothing new to learn'); }
    minutes.push({ minute: mi, score: Math.max(0, Math.round(score)), changes: Math.round(changes), distinct: Math.round(distinct), types, maxStatic: Math.round(maxStatic * 10) / 10, facts30: Math.round(facts * 10) / 10, reasons });
  }
  // words
  const text = m.scenes.map(s => s.text).join(' ');
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.split(/\s+/).filter(Boolean).length).filter(n => n > 0);
  const mean = sentences.reduce((a, n) => a + n, 0) / Math.max(1, sentences.length);
  const sd = Math.sqrt(sentences.reduce((a, n) => a + (n - mean) ** 2, 0) / Math.max(1, sentences.length));
  const toks = text.split(/\s+/).map(norm).filter(Boolean);
  const filler = toks.filter(w => FILLER.has(w)).length / Math.max(1, toks.length);
  const grams = new Map<string, number>();
  for (let i = 0; i + 4 <= toks.length; i++) { const g = toks.slice(i, i + 4).join(' '); grams.set(g, (grams.get(g) ?? 0) + 1); }
  const repeatedPhrases = [...grams.values()].filter(c => c > 1).length;
  let repeats = 0;
  for (let i = 1; i < timed.length; i++) { const p = timed[i - 1]!.beat.visual, c = timed[i]!.beat.visual; if (p.type === 'image' && c.type === 'image' && p.src === c.src && p.move === c.move) repeats++; }
  const longSentences = sentences.filter(n => n > TARGETS.longSentence).length;
  const cards = timed.filter(x => x.beat.visual.type === 'card').length;
  const avg = minutes.length ? minutes.reduce((a, x) => a + x.score, 0) / minutes.length : 0;
  let score = avg - Math.min(10, longSentences * 2) - Math.min(8, filler * 200) - Math.min(8, repeatedPhrases * 2) - Math.min(10, repeats * 3);
  if (sd < 4 && sentences.length > 8) score -= 6;    // every sentence the same length reads as a drone
  score = Math.max(0, Math.round(score));
  const worst = [...minutes].sort((a, b) => a.score - b.score).filter(x => x.score < 70).slice(0, 5).map(x => x.minute);
  return {
    score, pass: score >= 62 && !minutes.some(x => x.score < 35), minutes, weakest: worst,
    metrics: { changesPerMin: Math.round(timed.length * 60 / duration), distinctPerMin: Math.round(new Set(timed.map(x => signature(x.beat))).size * 60 / duration), maxStaticSec: Math.round(Math.max(...timed.map(x => x.end - x.start)) * 10) / 10,
      cardShare: Math.round(cards / Math.max(1, timed.length) * 100) / 100, repeatedFramings: repeats, sentenceMean: Math.round(mean * 10) / 10, sentenceSd: Math.round(sd * 10) / 10, longSentences, filler: Math.round(filler * 1000) / 1000, repeatedPhrases, durationSec: Math.round(duration) },
  };
}

export const describeWeak = (r: BoredomReport) => r.weakest.map(i => { const m = r.minutes.find(x => x.minute === i)!; return `minute ${i + 1}: ${m.reasons.join('; ') || 'below target'}`; });
