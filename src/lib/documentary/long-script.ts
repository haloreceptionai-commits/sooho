// Outline-first long-form script: dossier -> chapter outline -> chapters written side by side -> a pass that rewrites the weakest lines -> cold open.
// One call cannot hold 2,000 words in mind (chapters 4-6 restate chapters 1-3 and the middle sags), so every chapter is its own call that
// knows the whole outline. This file holds the pure parts: schemas, prompts, validators and the assembly into the app's Plan shape.
import type { Plan, PlanScene } from '@/lib/pipeline.functions';
import { speakable, spellNumbers } from '@/lib/story-v2';
import type { MusicMood } from './types';
import { MUSIC } from './types';

export const CHAPTER_SEC = 75;
export const WPS_LONG = 2.5;

export interface DossierFact { fact: string; source: string; surprise: number }
export interface Dossier { facts: DossierFact[]; people: { name: string; motive: string }[]; quotes: { text: string; who: string; source: string }[]; angle: string }
export interface OutlineChapter { title: string; question: string; escalation: string; facts: number[]; words: number; music: MusicMood; reveal: boolean; rehooks: string[] }
export interface Outline { chapters: OutlineChapter[]; coldOpen: { moments: string[]; stakes: string; promise: string }; finalReframe: string; twistChapter: number }
export interface ChapterScene {
  narration: string; image_prompt: string; characters: string[]; shot: PlanScene['shot']; angle: string; mood: 'tension' | 'reveal'; beat: string;
  loop_opened: string; loop_closed: string; money: boolean; ambience: string;
}
export interface ChapterDraft { scenes: ChapterScene[]; summary: string }

/** Chapters for a video of this length: about one every 75 s, between 4 and 14. */
export const chapterCount = (durationSec: number) => Math.max(4, Math.min(14, Math.round(durationSec / CHAPTER_SEC)));
/** Narration words for a video of this length. */
export const wordTarget = (durationSec: number) => Math.round(durationSec * WPS_LONG);

const S = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items: unknown) => ({ type: 'array', items });

export const dossierSchema = obj({
  facts: arr(obj({ fact: S, source: S, surprise: { type: 'integer' } })),
  people: arr(obj({ name: S, motive: S })),
  quotes: arr(obj({ text: S, who: S, source: S })),
  angle: S,
});
export const outlineSchema = obj({
  chapters: arr(obj({ title: S, question: S, escalation: S, facts: arr({ type: 'integer' }), words: { type: 'integer' }, music: { type: 'string', enum: [...MUSIC] }, reveal: { type: 'boolean' }, rehooks: arr(S) })),
  coldOpen: obj({ moments: arr(S), stakes: S, promise: S }),
  finalReframe: S,
  twistChapter: { type: 'integer' },
});
export const chapterSchema = obj({
  scenes: arr(obj({
    narration: S, image_prompt: S, characters: arr(S), shot: { type: 'string', enum: ['wide', 'aerial', 'action', 'macro', 'face'] },
    angle: { type: 'string', enum: ['wide', 'close', 'aerial', 'top_down', 'macro', 'pov', 'low_angle', 'over_shoulder'] }, mood: { type: 'string', enum: ['tension', 'reveal'] },
    beat: { type: 'string', enum: ['context', 'question', 'try', 'fail', 'escalation', 'myth', 'reveal', 'analogy', 'proof', 'payoff'] },
    loop_opened: S, loop_closed: S, money: { type: 'boolean' }, ambience: { type: 'string', enum: ['none', 'rain', 'wind', 'traffic', 'chatter', 'crickets', 'birds', 'fire', 'water'] },
  })),
  summary: S,
});
export const patchSchema = obj({ patches: arr(obj({ scene: { type: 'integer' }, narration: S, why: S })) });
export const coldOpenSchema = obj({ scenes: arr(obj({ narration: S, image_prompt: S, characters: arr(S) })), titleSubtitle: S });

// ---------------------------------------------------------------------------------------------------- prompts
const RULES = `STYLE (documentary narration for YouTube, spoken aloud):
- Every 10 seconds the viewer must learn something NEW: a fact, a name, a number, a reversal. Never restate what was already said.
- Concrete over abstract: people, places, objects, numbers. No vague summaries ("this changed everything", "a remarkable story").
- Sentences vary: mostly 8-20 words, a few very short ones for impact, none over 28 words. No list-like runs ("First... Second... Third...").
- Spell every number the way a narrator says it (thirty-seven thousand, nineteen sixty-five). No digits, no symbols, no dashes standing alone.
- Banned: "in this video", "let's dive in", "buckle up", "you won't believe", "little did he know", "game changer", filler (really, very, actually, basically).
- Plain words a teenager knows. Names and places stay exact.
- Never invent facts. Use only the dossier. If a detail is uncertain, say so in the narration.`;

export const dossierPrompt = (topic: string, facts: string, research: string) => ({
  system: `You are a documentary researcher. Build a dossier for a long YouTube video on the topic. ${'Only facts you are confident are true; mark source as the best named source (book, record, archive) or "uncertain".'}`,
  user: `Topic: ${topic}\nKnown claims:\n${facts.slice(0, 4000)}\nResearch notes:\n${research.slice(0, 3000)}\n\nReturn 18-30 facts (each 1 sentence, with a surprise score 1-5), 3-6 people with their motive, up to 5 real quotes (only if you are sure of wording and speaker; otherwise none), and one counterintuitive angle that makes the story worth ten minutes.`,
});

export const outlinePrompt = (o: { topic: string; promise: string; title: string; hook: string; durationSec: number; dossier: Dossier; archetype: string }) => {
  const n = chapterCount(o.durationSec);
  const facts = o.dossier.facts.map((f, i) => `${i}. ${f.fact}`).join('\n');
  return {
    system: `You are a showrunner outlining a ${Math.round(o.durationSec / 60)}-minute documentary video. ${RULES}\nStructure: ${n} chapters of about ${CHAPTER_SEC} seconds. Each chapter asks its OWN question, makes things harder or bigger than the last (escalation), and ends by opening the next question before the old one closes. A twist that reframes the story sits near the middle. The last chapter answers the main question plainly and ends with a line that changes what the opening meant.`,
    user: `Topic: ${o.topic}\nLocked title (the video must deliver exactly this promise): "${o.title}"\nPromise: ${o.promise}\nOpening hook: ${o.hook}\nArchetype: ${o.archetype}\nAngle: ${o.dossier.angle}\nFacts (use their numbers in "facts"):\n${facts}\nPeople: ${o.dossier.people.map(p => `${p.name} (${p.motive})`).join('; ')}\n\nReturn: ${n} chapters (title 2-6 words, question, escalation, fact numbers, words ≈ ${Math.round(CHAPTER_SEC * WPS_LONG)}, music mood, reveal = true when the chapter ends on a reveal, rehooks = 2-3 short teases placed every ~20 seconds); coldOpen = the 3 most striking moments (one sentence each, with fact numbers resolved into plain words), the stakes in one sentence, the promise in one sentence; finalReframe; twistChapter (index).`,
  };
};

export const chapterPrompt = (o: { topic: string; title: string; index: number; outline: Outline; dossier: Dossier; style: string; priorLine: string; hook: string; first: boolean }) => {
  const c = o.outline.chapters[o.index]!;
  const facts = c.facts.map(i => o.dossier.facts[i]?.fact).filter(Boolean).join('\n- ');
  const all = o.outline.chapters.map((x, i) => `${i + 1}. ${x.title} — ${x.question}`).join('\n');
  const last = o.index === o.outline.chapters.length - 1;
  return {
    system: `You write ONE chapter of a documentary script. ${RULES}\nEvery scene = one or two sentences of narration (10-22 words) plus the picture shown while it is spoken. The picture is a literal painting of what the words describe: a place, a person doing something, an object, a crowd. Never ask for text, signs, maps or numbers inside the picture (graphics are added separately). Characters recur by name. Style of the pictures: ${o.style}.`,
    user: `Topic: ${o.topic}\nFull outline:\n${all}\n\nWrite chapter ${o.index + 1}: "${c.title}". Question it asks: ${c.question}. Escalation: ${c.escalation}. About ${c.words} words (${Math.round(c.words / 15)} scenes). ${o.first ? `Open with this hook (exact first line): ${o.hook}` : `Continue naturally from the previous chapter's last line: "${o.priorLine}". Do not greet or recap.`}\nFacts you may use:\n- ${facts}\nRe-hooks to place about every 20 seconds: ${c.rehooks.join(' | ')}\n${c.reveal ? 'End on a reveal.' : 'End by opening the next chapter\'s question.'}${last ? `\nThis is the last chapter: answer the main question plainly, then end on this reframe: ${o.outline.finalReframe}` : ''}\nloop_opened / loop_closed: short ids of questions opened or answered in a scene ("" when none). Return a one-sentence summary of what the chapter established.`,
  };
};

export const sagPrompt = (lines: { scene: number; text: string }[], problems: string[]) => ({
  system: `You are a ruthless script editor. ${RULES}`,
  user: `Here is a documentary script, one numbered line per scene. Known problems:\n${problems.join('\n') || 'none'}\n\nFind the weakest 15-20% of lines (restating an earlier idea, vague, list-like, no new information, flat). Rewrite each so it adds a NEW concrete fact, name or reversal using only facts already in the script, keeping about the same length. Return only the patches.\n\n${lines.map(l => `${l.scene}: ${l.text}`).join('\n')}`,
});

export const coldOpenPrompt = (o: { topic: string; title: string; outline: Outline; style: string }) => ({
  system: `You write the first 20 seconds of a documentary: a trailer of its most striking moment. ${RULES}`,
  user: `Title: "${o.title}". Moments to tease: ${o.outline.coldOpen.moments.join(' | ')}\nStakes: ${o.outline.coldOpen.stakes}\nPromise: ${o.outline.coldOpen.promise}\nWrite 4-5 scenes of narration, each 6-12 words, total 40-55 words, building tension and ending on the promise. Do not reveal the final answer. Each scene has a vivid picture (style: ${o.style}), no text in the picture. Also give a short subtitle for the title card (place and year, 2-5 words).`,
});

// ---------------------------------------------------------------------------------------------------- assembly
const BEATS = new Set(['hook', 'context', 'question', 'try', 'fail', 'escalation', 'myth', 'reveal', 'analogy', 'proof', 'payoff']);

/** The app's scene shape from a chapter scene; fields the picture stage needs get safe defaults. Narration is made safe for speech timing. */
export function toPlanScene(s: ChapterScene, extra: Partial<PlanScene> = {}): PlanScene {
  return {
    beat: BEATS.has(s.beat) ? s.beat : 'context', narration: speakable(spellNumbers(s.narration.trim())), image_prompt: s.image_prompt.trim(), characters: s.characters ?? [],
    camera: 'push_in', sfx: 'none', mood: s.mood === 'reveal' ? 'reveal' : 'tension', color: 'bright', angle: s.angle || 'wide', shot: s.shot || 'wide', money: !!s.money,
    loop_opened: s.loop_opened ?? '', loop_closed: s.loop_closed ?? '', purpose: '', ...extra,
  };
}

export interface LongScript { scenes: (PlanScene & { cold?: boolean; chapter: number; ambience: string })[]; chapters: { scene: number; title: string; music: MusicMood }[]; coldCount: number }

export function assembleLongScript(o: { chapters: ChapterDraft[]; outline: Outline; cold?: { scenes: { narration: string; image_prompt: string; characters: string[] }[] } }): LongScript {
  const scenes: LongScript['scenes'] = [];
  const marks: LongScript['chapters'] = [];
  for (const c of o.cold?.scenes ?? []) {
    scenes.push({ ...toPlanScene({ narration: c.narration, image_prompt: c.image_prompt, characters: c.characters, shot: 'wide', angle: 'wide', mood: 'tension', beat: 'hook', loop_opened: '', loop_closed: '', money: false, ambience: 'none' }), cold: true, chapter: -1, ambience: 'none' });
  }
  const coldCount = scenes.length;
  o.chapters.forEach((ch, ci) => {
    marks.push({ scene: scenes.length, title: o.outline.chapters[ci]?.title ?? `Chapter ${ci + 1}`, music: o.outline.chapters[ci]?.music ?? 'suspense' });
    for (const s of ch.scenes) scenes.push({ ...toPlanScene(s), chapter: ci, ambience: s.ambience && s.ambience !== 'none' ? s.ambience : '' });
  });
  return { scenes, chapters: marks, coldCount };
}

// ---------------------------------------------------------------------------------------------------- validators
export interface LongIssue { id: string; msg: string; scenes?: number[] }
const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');

/** Long-form checks the single-call script never had: length, repeated ideas, list runs, sentence rhythm, filler, new information per half minute. */
export function longScriptIssues(scenes: { narration: string; loop_opened?: string; loop_closed?: string }[], durationSec: number): LongIssue[] {
  const issues: LongIssue[] = [];
  const text = scenes.map(s => s.narration).join(' ');
  const words = text.split(/\s+/).filter(Boolean);
  const target = wordTarget(durationSec);
  if (words.length < target * .82 || words.length > target * 1.18) issues.push({ id: 'LEN', msg: `${words.length} words for ${durationSec}s (aim ${target})` });
  const tooLong = scenes.map((s, i) => [i, s.narration.split(/\s+/).length] as const).filter(([, n]) => n > 30).map(([i]) => i);
  if (tooLong.length) issues.push({ id: 'SCENE_LONG', msg: `${tooLong.length} scenes run over 30 words (cut them into two)`, scenes: tooLong });
  const toks = words.map(norm).filter(Boolean);
  const grams = new Map<string, number[]>();
  scenes.forEach((s, i) => { const t = s.narration.split(/\s+/).map(norm).filter(Boolean); for (let k = 0; k + 5 <= t.length; k++) { const g = t.slice(k, k + 5).join(' '); const a = grams.get(g) ?? []; if (!a.includes(i)) a.push(i); grams.set(g, a); } });
  const repeats = [...grams.entries()].filter(([, a]) => a.length > 1);
  if (repeats.length > 2) issues.push({ id: 'REPEAT', msg: `the same phrase appears in several scenes ("${repeats[0]![0]}")`, scenes: [...new Set(repeats.flatMap(([, a]) => a))] });
  let run = 0; const listRuns: number[] = [];
  scenes.forEach((s, i) => { const f = norm(s.narration.split(/\s+/)[0] ?? ''); const prev = norm(scenes[i - 1]?.narration.split(/\s+/)[0] ?? ''); run = f && f === prev ? run + 1 : 0; if (run >= 2) listRuns.push(i); });
  if (listRuns.length) issues.push({ id: 'LISTY', msg: 'three or more scenes in a row start with the same word (reads like a list)', scenes: listRuns });
  const filler = toks.filter(w => ['really', 'very', 'actually', 'basically', 'literally', 'just'].includes(w)).length / Math.max(1, toks.length);
  if (filler > .012) issues.push({ id: 'FILLER', msg: `filler words are ${(filler * 100).toFixed(1)}% of the script` });
  const banned = /\b(in this video|let's dive in|buckle up|you won't believe|little did (he|she|they) know|game changer)\b/i.exec(text);
  if (banned) issues.push({ id: 'BANNED', msg: `banned phrase "${banned[0]}"` });
  if (/\d/.test(text)) issues.push({ id: 'DIGITS', msg: 'narration contains digits; numbers must be spelled' });
  // new information: every 30-second window (about 75 words) should contain a name, a number or a year
  let dry = 0;
  for (let i = 0; i + 75 <= words.length; i += 75) { const w = words.slice(i, i + 75); const facts = w.filter((x, k) => (k > 0 && /^[A-Z][a-z]{2,}/.test(x) && !/[.!?]$/.test(w[k - 1]!)) || /^(hundred|thousand|million|billion)$/i.test(x)).length; if (facts < 1) dry++; }
  if (dry > 1) issues.push({ id: 'DRY', msg: `${dry} half-minute stretches have no name or number: nothing new to learn` });
  const opened = new Set(scenes.map(s => s.loop_opened).filter(Boolean)), closed = new Set(scenes.map(s => s.loop_closed).filter(Boolean));
  if (opened.size < Math.max(3, Math.floor(durationSec / 150))) issues.push({ id: 'LOOPS', msg: `only ${opened.size} open questions across the video` });
  if ([...opened].some(o => !closed.has(o)) && opened.size > 0) issues.push({ id: 'OPEN', msg: 'some questions are opened and never answered' });
  return issues;
}

/** The lines the sag pass should look at first: the ones involved in a flagged problem plus the lowest-information lines. */
export function weakLines(scenes: { narration: string }[], issues: LongIssue[], max = 18): { scene: number; text: string }[] {
  const flagged = new Set(issues.flatMap(i => i.scenes ?? []));
  const info = (t: string) => { const w = t.split(/\s+/); return w.filter((x, k) => (k > 0 && /^[A-Z][a-z]{2,}/.test(x)) || /^(hundred|thousand|million)$/i.test(x)).length; };
  const ranked = scenes.map((s, i) => ({ scene: i, text: s.narration, score: (flagged.has(i) ? -10 : 0) + info(s.narration) * 2 + Math.min(4, s.narration.split(/\s+/).length / 6) })).sort((a, b) => a.score - b.score);
  return ranked.slice(0, max).map(({ scene, text }) => ({ scene, text }));
}

/** Applies the editor's patches, refusing any that change the length by more than a third or reintroduce digits. */
export function applyPatches<T extends { narration: string }>(scenes: T[], patches: { scene: number; narration: string }[]): { scenes: T[]; applied: number } {
  let applied = 0;
  const out = scenes.map((s, i) => {
    const p = patches.find(x => x.scene === i);
    if (!p) return s;
    const text = speakable(spellNumbers(p.narration.trim()));
    const a = s.narration.split(/\s+/).length, b = text.split(/\s+/).length;
    if (!text || b < a * .67 || b > a * 1.34 || /\d/.test(text)) return s;
    applied++;
    return { ...s, narration: text };
  });
  return { scenes: out, applied };
}

/** Plan scaffold for the app: the pieces of the old single-call plan that later stages read (title, hook text, cast), filled from the new script. */
export function toPlan(o: { script: LongScript; title: string; description: string; hero: { name: string; role: string; want: string }; question: string; premise: string; characters: Plan['characters']; palette: string; hookText: string }): Plan {
  return {
    premise: o.premise, question: o.question, hero: o.hero, beats: [], script: o.script.scenes.map(s => s.narration).join(' '), title: o.title, description: o.description, palette: o.palette,
    hookText: o.hookText, loopLine: '', characters: o.characters, scenes: o.script.scenes,
  };
}
