import { describe, expect, it } from 'vitest';
import { chunkWords, groundCard, heuristicNumberBeat, limitCards, overlap, planScene, planVideo, newCameraState, type Ctx } from '@/lib/documentary/plan-visuals';
import { findSpokenNumbers } from '@/lib/documentary/spoken-numbers';
import type { DocBeat } from '@/lib/documentary/types';

const TEXT = 'In two hundred eighteen BC a general named Hannibal led thirty-seven thousand soldiers toward the Alps, and nobody believed it was possible.';
const ctxFor = (text: string, around = ''): Ctx => { const words = text.split(/\s+/); const window = (around + ' ' + text).split(/\s+/).filter(Boolean); return { words, window, spoken: findSpokenNumbers(window), sources: ['Livy, History of Rome'] }; };

describe('beat sizes', () => {
  it('cuts a scene into beats of about two to four seconds', () => {
    const words = TEXT.split(' ');
    const r = chunkWords(words);
    expect(r[0]![0]).toBe(0);
    expect(r.at(-1)![1]).toBe(words.length);
    expect(r.length).toBeGreaterThanOrEqual(2);
    for (const [a, b] of r) expect(b - a).toBeLessThanOrEqual(13);
    for (let i = 1; i < r.length; i++) expect(r[i]![0]).toBe(r[i - 1]![1]);
  });
  it('breaks at a comma when one is close to the target', () => {
    const w = 'He crossed the river at dawn, and then the real trouble started for everyone involved'.split(' ');
    expect(chunkWords(w, 0, w.length, 7, 4, 13)[0]![1]).toBe(6);
  });
});

describe('grounding: a card may only show what the narrator says', () => {
  it('accepts a number that is spoken and rejects one that is not', () => {
    const ctx = ctxFor(TEXT);
    expect(groundCard('number', { value: '37,000', label: 'soldiers' }, ctx)).toMatchObject({ value: '37,000', label: 'soldiers', count: true });
    expect(groundCard('number', { value: '40,000', label: 'soldiers' }, ctx)).toBeNull();
    expect(groundCard('number', { value: '218', label: 'BC' }, ctx)).toMatchObject({ value: '218' });
  });
  it('quotes and key facts must be spoken', () => {
    const ctx = ctxFor('He said we will either find a way or make one.');
    expect(groundCard('quote', { text: 'We will either find a way, or make one.', who: 'Hannibal' }, ctx)).not.toBeNull();
    expect(groundCard('quote', { text: 'Rome must fall before the winter ends.' }, ctx)).toBeNull();
    expect(groundCard('keyfact', { text: 'Invented claim about elephants swimming rivers', tag: 'Fact' }, ctx)).toBeNull();
  });
  it('timelines keep only the years that are spoken, and need two', () => {
    const ctx = ctxFor('In two hundred eighteen BC he crossed the Alps and in two hundred two BC he lost at Zama.');
    const ok = groundCard('timeline', { events: [{ when: '218 BC', label: 'Crosses the Alps' }, { when: '202 BC', label: 'Defeat at Zama' }, { when: '216 BC', label: 'Cannae' }] }, ctx) as { events: unknown[] };
    expect(ok.events).toHaveLength(2);
    expect(groundCard('timeline', { events: [{ when: '216 BC', label: 'Cannae' }, { when: '200 BC', label: 'Nothing' }] }, ctx)).toBeNull();
  });
  it('maps need valid coordinates and a place the narrator names', () => {
    const ctx = ctxFor('The army left Carthage and reached Rome.');
    const card = groundCard('location', { points: [{ name: 'Carthage', lat: 36.8, lon: 10.3 }, { name: 'Rome', lat: 41.9, lon: 12.5 }, { name: 'Bad', lat: 999, lon: 0 }] }, ctx) as { points: { name: string }[]; route: boolean };
    expect(card.points.map(p => p.name)).toEqual(['Carthage', 'Rome']);
    expect(card.route).toBe(true);
    expect(groundCard('location', { points: [{ name: 'Atlantis', lat: 10, lon: 10 }] }, ctx)).toBeNull();
  });
  it('compare bars need spoken values', () => {
    const ctx = ctxFor('The tower is three hundred thirty meters tall, the statue only ninety three.');
    expect(groundCard('compare', { items: [{ label: 'Tower', value: '330', unit: 'm' }, { label: 'Statue', value: '93', unit: 'm' }] }, ctx)).not.toBeNull();
    expect(groundCard('compare', { items: [{ label: 'Tower', value: '330' }, { label: 'Statue', value: '120' }] }, ctx)).toBeNull();
  });
  it('overlap measures the share of content words spoken', () => {
    expect(overlap('find a way or make one', 'we will find a way or make one'.split(' '))).toBe(1);
    expect(overlap('completely unrelated sentence here', 'we will find a way'.split(' '))).toBe(0);
  });
});

describe('planning a scene', () => {
  const input = (over = {}) => ({ index: 0, text: TEXT, image: 0, ...over });

  it('covers every word exactly once, in order', () => {
    const beats = planScene(input(), newCameraState());
    const n = TEXT.split(' ').length;
    expect(beats[0]!.w0).toBe(0);
    expect(beats.at(-1)!.w1).toBe(n);
    for (let i = 1; i < beats.length; i++) expect(beats[i]!.w0).toBe(beats[i - 1]!.w1);
  });

  it('makes a counter for a big spoken number and shows the exact value', () => {
    const beats = planScene(input(), newCameraState());
    const card = beats.find(b => b.visual.type === 'card');
    expect(card).toBeTruthy();
    expect(card!.visual).toMatchObject({ type: 'card', card: 'number', data: { value: '37,000', label: 'soldiers' } });
  });

  it('drops an invented card from the planner and keeps the narration covered', () => {
    const beats = planScene(input({ ai: { scene: 0, beats: [{ w0: 0, w1: 8, kind: 'number', data: { value: '99,999', label: 'ghosts' } }] } }), newCameraState());
    expect(beats.every(b => b.visual.type === 'image' || (b.visual.type === 'card' && (b.visual.data as { value?: string }).value === '37,000'))).toBe(true);
    expect(beats.at(-1)!.w1).toBe(TEXT.split(' ').length);
  });

  it('never ends a scene with only cards', () => {
    const t = 'The army had thirty thousand soldiers.';
    const beats = planScene({ index: 0, text: t, image: 0, ai: { scene: 0, beats: [{ w0: 0, w1: 7, kind: 'number', data: { value: '30,000', label: 'soldiers' } }] } }, newCameraState());
    expect(beats.some(b => b.visual.type === 'image')).toBe(true);
  });

  it('cold open scenes use short beats and no cards', () => {
    const beats = planScene(input({ cold: true }), newCameraState());
    expect(beats.every(b => b.visual.type === 'image')).toBe(true);
    for (const b of beats) expect(b.w1 - b.w0).toBeLessThanOrEqual(7);
    expect(beats[0]!.sfx).toBe('hit');
  });

  it('a second beat on the same picture looks closer at a different part', () => {
    const beats = planScene(input(), newCameraState()).filter(b => b.visual.type === 'image');
    const second = beats[1]!.visual as { zoom?: number[]; focus?: number[] };
    expect(second.zoom).toBeTruthy();
    expect(second.focus).not.toEqual((beats[0]!.visual as { focus?: number[] }).focus);
  });

  it('keeps an overlay only when the name or year is in the narration', () => {
    const ok = planScene(input({ ai: { scene: 0, beats: [{ w0: 0, w1: 9, kind: 'image', overlay: { kind: 'lower_third', data: { name: 'Hannibal', sub: 'General' } } }] } }), newCameraState());
    expect(ok[0]!.overlays?.[0]?.kind).toBe('lower_third');
    const bad = planScene(input({ ai: { scene: 0, beats: [{ w0: 0, w1: 9, kind: 'image', overlay: { kind: 'lower_third', data: { name: 'Napoleon', sub: 'Emperor' } } }] } }), newCameraState());
    expect(bad[0]!.overlays?.some(o => o.kind === 'lower_third')).toBeFalsy();
  });
});

describe('history-channel touches', () => {
  it('stamps the date when a year is first spoken, then not on every beat', () => {
    const scenes = Array.from({ length: 6 }, (_, i) => ({ index: i, image: i, text: i % 2 === 0 ? 'In eighteen eighty nine the workers raised the iron tower above the city streets of Paris.' : 'The engineers argued about the plans for hours while the crowds waited outside in the cold.' }));
    const stamps = planVideo(scenes).flatMap(b => (b.overlays ?? []).filter(o => o.kind === 'date_stamp'));
    expect(stamps.length).toBeGreaterThanOrEqual(1);
    expect(stamps[0]!.data).toMatchObject({ when: '1889' });
    expect(stamps.length).toBeLessThan(3);
  });

  it('shows a speech bubble only for words the narrator says', () => {
    const ctx = { index: 0, image: 0, text: 'He turned to his officers and said we will either find a way or make one.' };
    const ok = planScene({ ...ctx, ai: { scene: 0, beats: [{ w0: 0, w1: 15, kind: 'image', overlay: { kind: 'speech', data: { text: 'We will either find a way or make one', side: 'right' } } }] } }, newCameraState());
    expect(ok[0]!.overlays?.[0]).toMatchObject({ kind: 'speech', data: { side: 'right' } });
    const bad = planScene({ ...ctx, ai: { scene: 0, beats: [{ w0: 0, w1: 15, kind: 'image', overlay: { kind: 'speech', data: { text: 'Retreat at once to the harbour now', side: 'left' } } }] } }, newCameraState());
    expect(bad[0]!.overlays?.some(o => o.kind === 'speech')).toBeFalsy();
  });
});

describe('balance scale', () => {
  it('weighs two spoken quantities and refuses unspoken or equal ones', () => {
    const ctx = ctxFor('The Americans held six thousand warheads while the Soviets held four thousand.');
    const ok = groundCard('balance', { left: { label: 'USA', value: '6,000', unit: 'warheads' }, right: { label: 'USSR', value: '4,000', unit: 'warheads' }, title: 'Arms race' }, ctx) as { left: { value: string } };
    expect(ok.left.value).toBe('6,000');
    expect(groundCard('balance', { left: { label: 'USA', value: '6,000' }, right: { label: 'USSR', value: '9,000' } }, ctx)).toBeNull();
    expect(groundCard('balance', { left: { label: 'A', value: '6,000' }, right: { label: 'B', value: '6,000' } }, ctx)).toBeNull();
  });
});

describe('planning a video', () => {
  const scenes = Array.from({ length: 30 }, (_, i) => ({ index: i, image: i, text: i % 5 === 2 ? 'The tower rose to three hundred thirty meters above the city streets below it.' : 'The workers carried heavy beams across the muddy field while the engineers argued about the plans for hours.' }));

  it('moves the camera differently from one beat to the next', () => {
    const beats = planVideo(scenes).filter(b => b.visual.type === 'image');
    let repeats = 0;
    for (let i = 1; i < beats.length; i++) {
      const a = beats[i - 1]!.visual as { move: string; src: number }, b = beats[i]!.visual as { move: string; src: number };
      if (a.move === b.move && a.src === b.src) repeats++;
    }
    expect(repeats).toBe(0);
    expect(new Set(beats.map(b => (b.visual as { move: string }).move)).size).toBeGreaterThanOrEqual(5);
  });

  it('produces more than one beat per scene on average', () => {
    expect(planVideo(scenes).length).toBeGreaterThan(scenes.length * 1.8);
  });

  it('limits how many cards a video may have', () => {
    const beats: DocBeat[] = Array.from({ length: 20 }, (_, i) => ({ scene: i, w0: 0, w1: 5, visual: { type: 'card', card: 'number', data: { value: '1,000' }, bg: i } }));
    expect(limitCards(beats).filter(b => b.visual.type === 'card').length).toBeLessThanOrEqual(7);
  });

  it('finds no number card in text with no spoken numbers', () => {
    expect(heuristicNumberBeat('the army marched north'.split(' '), [], [])).toBeNull();
  });
});
