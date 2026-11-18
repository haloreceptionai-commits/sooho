import { describe, expect, it } from 'vitest';
import { lockConcept, promiseBrief, scoreConcept, type PackagingConcept } from '@/lib/documentary/packaging';
import { applyPatches, assembleLongScript, chapterCount, longScriptIssues, weakLines, withColdOpen, type ChapterDraft, type Dossier, type Outline } from '@/lib/documentary/long-script';
import { LongFormUnavailable, writeLongForm, type LongFormCalls, type LongFormInput } from '@/lib/documentary/long-form';
import { parseVisualPlan } from '@/lib/documentary/visual-ai';
import { manifestProblems } from '@/lib/documentary/validate';
import { documentaryRequest } from '@/lib/documentary/documentary-job';
import { buildManifest } from '@/lib/documentary/build-manifest';

const good = (over: Partial<PackagingConcept> = {}): PackagingConcept => ({ title: 'The Man Who Sold the Eiffel Tower Twice', thumb_text: 'SOLD TWICE', focal_subject: 'a smiling con man holding a tiny tower', emotion: 'smug', layout: 'object', promise: 'How one con artist sold a national monument to two different buyers', gap: 'How can you sell a tower twice?', ...over });

describe('packaging first', () => {
  it('scores a strong concept above weak and clickbait ones', () => {
    const strong = scoreConcept(good()), weak = scoreConcept(good({ title: 'Eiffel', thumb_text: 'A very long thumbnail text here', promise: 'x' })), bait = scoreConcept(good({ title: "You Won't Believe This Shocking Tower Secret" }));
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeGreaterThan(bait.score);
    expect(bait.notes.join(' ')).toMatch(/clickbait/);
  });
  it('locks the best usable concept and skips titles already used', () => {
    const winner = lockConcept([good({ title: 'Eiffel' }), good(), good({ title: 'Why Nobody Wanted the Tower Everyone Loves', thumb_text: 'UGLY' })]);
    expect(winner?.title).toBeTruthy();
    expect(lockConcept([good()], ['the man who sold the eiffel tower twice'])).toBeNull();
    expect(promiseBrief(winner!)).toContain('LOCKED PACKAGING');
  });
});

const dossier: Dossier = { facts: Array.from({ length: 12 }, (_, i) => ({ fact: `Fact number ${i} about the tower`, source: 'archive', surprise: 3 })), people: [{ name: 'Victor Lustig', motive: 'money' }], quotes: [], angle: 'the con needed no tower' };
const outline = (n = 6): Outline => ({
  gag: 'the committee that kept forming committees',
  characters: [{ name: 'Victor Lustig', role: 'con man', look: 'slim man in a grey suit and hat' }],
  chapters: Array.from({ length: n }, (_, i) => ({ title: `Chapter ${i + 1}`, question: `Question ${i + 1}?`, escalation: 'bigger', facts: [i], words: 190, music: i % 2 ? 'epic' : 'suspense', reveal: i === 3, rehooks: ['but then'] })),
  coldOpen: { moments: ['a'], stakes: 's', promise: 'p' }, finalReframe: 'it was never about the tower', twistChapter: 3,
});
const names = ['Lustig', 'Paris', 'Eiffel', 'Andre', 'Poisson', 'Vienna'];
const chapterOf = (ci: number, scenes = 8): ChapterDraft => ({
  summary: `s${ci}`,
  scenes: Array.from({ length: scenes }, (_, k) => ({
    narration: `In scene ${k} of chapter ${ci} ${names[(ci + k) % names.length]} paid ${['one hundred', 'two hundred', 'three thousand'][k % 3]} francs for a paper that proved nothing at all to anyone.`.replace(/\d+/g, w => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][Number(w) % 10]!),
    image_prompt: `A painting of scene ${k}`, characters: ['Victor Lustig'], shot: 'wide', angle: 'wide', mood: k % 2 ? 'reveal' : 'tension', beat: 'context',
    loop_opened: k === 0 ? `q${ci}` : '', loop_closed: k === scenes - 1 && ci > 0 ? `q${ci - 1}` : '', money: false, ambience: 'none', aside: k === 3,
  })),
});

describe('long script validators', () => {
  it('counts chapters and words from the length', () => { expect(chapterCount(600)).toBe(8); expect(chapterCount(120)).toBe(4); expect(chapterCount(3000)).toBe(14); });

  it('accepts a varied script and flags digits, repeats, list runs, filler and banned phrases', () => {
    const scenes = assembleLongScript({ chapters: Array.from({ length: 6 }, (_, i) => chapterOf(i)), outline: outline() }).scenes;
    expect(longScriptIssues(scenes, 480).find(i => i.id === 'DIGITS')).toBeUndefined();
    const bad = scenes.map((s, i) => ({ ...s, narration: i < 4 ? 'So the con went on and on and on again and again until nothing at all changed anymore.' : i === 5 ? 'Buckle up because in 1925 it was really very actually basically wild.' : s.narration }));
    const ids = longScriptIssues(bad, 480).map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(['DIGITS', 'BANNED', 'REPEAT', 'LISTY']));
  });

  it('applies edit patches only when the length stays close and no digits come back', () => {
    const scenes = [{ narration: 'The inspector walked slowly through the cold empty hall again.' }, { narration: 'He found a letter.' }];
    const out = applyPatches(scenes, [{ scene: 0, narration: 'Inspector Dupont walked alone through the cold hall, and the letter was gone.' }, { scene: 1, narration: 'Nothing, absolutely nothing, remained of the entire archive that had once stood in that room at all.' }]);
    expect(out.applied).toBe(1);
    expect(out.scenes[1]!.narration).toBe('He found a letter.');
    const spelled = applyPatches(scenes, [{ scene: 0, narration: 'He walked in 1925 through the cold hall again today.' }]);   // digits are spelled for the narrator, never kept
    expect(spelled.scenes[0]!.narration).toMatch(/nineteen twenty-five/);
    expect(/\d/.test(spelled.scenes[0]!.narration)).toBe(false);
  });

  it('puts the cold open first and moves the chapters down', () => {
    const base = assembleLongScript({ chapters: [chapterOf(0), chapterOf(1)], outline: outline(2) });
    const withCold = withColdOpen(base, [{ narration: 'A tower stood for sale.', image_prompt: 'a tower', characters: [] }, { narration: 'Nobody noticed the lie.', image_prompt: 'a crowd', characters: [] }]);
    expect(withCold.coldCount).toBe(2);
    expect(withCold.scenes[0]!.cold).toBe(true);
    expect(withCold.chapters[0]!.scene).toBe(2);
    expect(weakLines(base.scenes, []).length).toBeGreaterThan(0);
  });
});

describe('writeLongForm (injected calls)', () => {
  const inp: LongFormInput = { topic: 'The tower con', durationSec: 480, archetype: 'con', style: 'painted', facts: 'f', research: 'r', hook: 'The tower was for sale.', hookText: 'FOR SALE', description: 'd', hero: { name: 'Victor Lustig', role: 'con man', want: 'money' }, question: 'q', premise: 'p', palette: 'warm', pastTitles: [], sources: ['Archive'] };
  const calls = (over: Partial<LongFormCalls> = {}): LongFormCalls => ({
    packaging: async () => ({ concepts: [good()] }), dossier: async () => dossier, outline: async () => outline(6),
    chapter: async a => chapterOf(a.index), sag: async a => ({ patches: a.lines.slice(0, 2).map(l => ({ scene: l.scene, narration: `${l.text} Moreover Inspector Dupont wrote it down.` })) }),
    coldOpen: async () => ({ scenes: [1, 2, 3].map(k => ({ narration: `Trailer line ${['one', 'two', 'three'][k - 1]} about the tower.`, image_prompt: 'tower', characters: [] })), titleSubtitle: 'Paris, nineteen twenty five' }), ...over,
  });

  it('writes packaging, dossier, outline, chapters, a sag pass and a cold open into one plan', async () => {
    const seen: string[] = [];
    const r = await writeLongForm(inp, calls(), d => seen.push(d));
    expect(r.plan.title).toBe('The Man Who Sold the Eiffel Tower Twice');
    expect(r.plan.documentary?.coldCount).toBe(3);
    expect(r.plan.documentary?.chapters).toHaveLength(6);
    expect(r.plan.scenes[0]!.cold).toBe(true);
    expect(r.plan.scenes.length).toBe(3 + 6 * 8);
    expect(r.plan.documentary?.packaging?.thumb_text).toBe('SOLD TWICE');
    expect(r.plan.characters[0]!.name).toBe('Victor Lustig');
    expect(seen.some(s => /chapters/.test(s))).toBe(true);
    expect(r.steps.join(' ')).toMatch(/cold open/);
  });

  it('keeps going without packaging, sag pass or cold open', async () => {
    const r = await writeLongForm(inp, calls({ packaging: async () => { throw new Error('x'); }, sag: async () => { throw new Error('x'); }, coldOpen: async () => { throw new Error('x'); } }));
    expect(r.plan.title).toBe('The tower con');
    expect(r.plan.documentary?.coldCount).toBe(0);
    expect(r.steps.join(' ')).toMatch(/skipped/);
  });

  it('tells the pipeline to use the old writer when a core step fails', async () => {
    await expect(writeLongForm(inp, calls({ dossier: async () => ({ ...dossier, facts: dossier.facts.slice(0, 3) }) }))).rejects.toBeInstanceOf(LongFormUnavailable);
    await expect(writeLongForm(inp, calls({ chapter: async a => { if (a.index === 2) throw new Error('boom'); return chapterOf(a.index); } }))).rejects.toBeInstanceOf(LongFormUnavailable);
  });

  it('retries a step once before giving up', async () => {
    let n = 0;
    const r = await writeLongForm(inp, calls({ outline: async () => { if (n++ === 0) throw new Error('flaky'); return outline(6); } }));
    expect(r.plan.scenes.length).toBeGreaterThan(40);
  });
});

describe('visual plan answer', () => {
  it('reads the model answer safely and drops what is out of range', () => {
    const plan = parseVisualPlan({ scenes: [
      { scene: 3, beats: [{ w0: 0, w1: 6, kind: 'number', move: 'push', focus_x: 2, focus_y: -1, data_json: '{"value":"37,000","label":"soldiers"}', overlay_kind: 'none', overlay_json: '{}', sfx: 'hit', transition: 'flash' },
        { w0: 6, w1: 12, kind: 'banana', move: 'spin', focus_x: .5, focus_y: .5, data_json: 'not json', overlay_kind: 'lower_third', overlay_json: '{"name":"Hannibal"}', sfx: 'none', transition: 'cut' }] },
      { scene: 99, beats: [] }] }, new Set([3]));
    expect(plan).toHaveLength(1);
    expect(plan[0]!.beats[0]).toMatchObject({ kind: 'number', data: { value: '37,000' }, focus: [.85, .15], sfx: 'hit', transition: 'flash' });
    expect(plan[0]!.beats[1]).toMatchObject({ kind: 'image', data: {}, overlay: { kind: 'lower_third' } });
    expect(plan[0]!.beats[1]!.move).toBeUndefined();
  });
});

describe('manifest checks and the render request', () => {
  const m = () => buildManifest({
    title: 'T', scenes: chapterOf(0, 6).scenes.map(s => ({ narration: s.narration })), chapters: [{ scene: 0, title: 'One' }], sceneImage: [0, 1, 2, 3, 4, 5], images: Array.from({ length: 6 }, (_, i) => `u/v/assets/render-image-${i}.jpg`),
    voice: [{ path: 'u/v/assets/render-voice-0.wav', scenes: [0, 1, 2, 3, 4, 5] }],
  }).manifest;

  it('accepts a built plan and names the problem in a broken one', () => {
    expect(manifestProblems(m())).toEqual([]);
    const bad = m(); bad.beats[0]!.w1 = 500; bad.scenes[1]!.text += ' in 1999';
    expect(manifestProblems(bad).join(' ')).toMatch(/word range/);
    expect(manifestProblems(bad).join(' ')).toMatch(/digits/);
    const noVoice = m(); noVoice.voice = [{ path: 'x', scenes: [0, 1] }];
    expect(manifestProblems(noVoice).join(' ')).toMatch(/no recorded narration/);
  });

  it('the request schema accepts a built plan and rejects a wrong kind', () => {
    const body = { videoId: 'abc', doc: m(), checkpoint: { gate: { score: 80, ready: true, parts: {}, blockers: [] }, report: { revealSec: 10, shotMix: {} }, hookType: 'x', continuity: 1, plan: { characters: [] } } };
    expect(documentaryRequest.safeParse(body).success).toBe(true);
    expect(documentaryRequest.safeParse({ ...body, doc: { ...m(), kind: 'cartoon' } }).success).toBe(false);
  });
});

describe('the running gag and wry asides', () => {
  it('the chapter prompt carries the gag and allows one short aside, never at anyone\'s expense', async () => {
    const { chapterPrompt, outlinePrompt } = await import('@/lib/documentary/long-script');
    const p = chapterPrompt({ topic: 't', title: 'T', index: 1, outline: outline(), dossier, style: 'flat', priorLine: 'x', hook: 'h', first: false });
    expect(p.user).toContain('the committee that kept forming committees');
    expect(p.user).toMatch(/AT MOST ONE short wry aside/);
    expect(p.user).toMatch(/never joke about deaths/);
    expect(outlinePrompt({ topic: 't', promise: 'p', title: 'T', hook: 'h', durationSec: 600, dossier, archetype: 'a' }).user).toMatch(/running joke/);
  });

  it('asides flow into the plan scenes', () => {
    const s = assembleLongScript({ chapters: [chapterOf(0)], outline: outline(1) }).scenes;
    expect(s.filter(x => x.aside)).toHaveLength(1);
  });
});
