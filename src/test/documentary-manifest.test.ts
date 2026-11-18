import { describe, expect, it } from 'vitest';
import { boredomReport, describeWeak } from '@/lib/documentary/boredom';
import { buildManifest, moodFor, type BuildInput } from '@/lib/documentary/build-manifest';
import type { DocManifest } from '@/lib/documentary/types';

const SENT = ['The workers carried heavy beams across the muddy field while engineers argued.', 'In eighteen eighty nine the tower rose to three hundred thirty meters above Paris.', 'Nobody in the crowd believed the iron could hold, and Gustave Eiffel knew it.', 'Then the first storm arrived, and the whole city held its breath.'];
const scenesOf = (n: number) => Array.from({ length: n }, (_, i) => ({ narration: SENT[i % SENT.length]!, reveal: i % 9 === 8 }));
const input = (n = 24, over: Partial<BuildInput> = {}): BuildInput => ({
  title: 'The Tower Nobody Wanted', subtitle: 'Paris, 1889', scenes: scenesOf(n), chapters: [{ scene: 0, title: 'The plan' }, { scene: 8, title: 'The storm', music: 'epic' }, { scene: 16, title: 'The crowd' }],
  sceneImage: Array.from({ length: n }, (_, i) => i), images: Array.from({ length: n }, (_, i) => `img-${i}.jpg`), voice: [{ path: 'take0', scenes: Array.from({ length: n }, (_, i) => i) }], ...over,
});

describe('documentary manifest', () => {
  it('builds a valid plan whose beats cover every word once', () => {
    const { manifest } = buildManifest(input());
    expect(manifest.kind).toBe('documentary');
    expect(manifest.beats.length).toBeGreaterThan(manifest.scenes.length * 1.8);
    for (let s = 0; s < manifest.scenes.length; s++) {
      const bs = manifest.beats.filter(b => b.scene === s);
      expect(bs[0]!.w0).toBe(0);
      expect(bs.at(-1)!.w1).toBe(manifest.scenes[s]!.text.split(' ').length);
      for (let i = 1; i < bs.length; i++) expect(bs[i]!.w0).toBe(bs[i - 1]!.w1);
    }
    for (const b of manifest.beats) if (b.visual.type === 'image') expect(b.visual.src).toBeLessThan(manifest.images.length);
  });

  it('puts a chapter card on each chapter start and a counter on the spoken number', () => {
    const { manifest } = buildManifest(input());
    const chapters = manifest.beats.flatMap(b => (b.overlays ?? []).filter(o => o.kind === 'chapter'));
    expect(chapters.map(c => (c.data as { title: string }).title)).toEqual(['The plan', 'The storm', 'The crowd']);
    expect(manifest.beats.some(b => b.visual.type === 'card' && b.visual.card === 'number' && (b.visual.data as { value: string }).value === '330')).toBe(true);
  });

  it('opens with a cold open, then the title, with a hush before it and suspense music', () => {
    const scenes = [{ narration: 'The ground shook and the whole tower swayed.', cold: true }, { narration: 'Nobody had ever built anything like it.', cold: true }, ...scenesOf(10)];
    const { manifest } = buildManifest(input(12, { scenes, chapters: [{ scene: 2, title: 'The plan' }] }));
    const coldBeats = manifest.beats.filter(b => b.scene < 2);
    expect(coldBeats.every(b => b.visual.type === 'image')).toBe(true);
    const title = manifest.beats.find(b => b.scene === 2)!;
    expect(title.overlays?.some(o => o.kind === 'title')).toBe(true);
    expect(title.sfx).toBe('sting');
    expect(manifest.pauses[0]).toMatchObject({ scene: 1, hush: true });
    expect(manifest.music[0]).toEqual({ scene: 0, mood: 'suspense' });
  });

  it('adds breaths of silence before reveals but not too often', () => {
    const { manifest } = buildManifest(input(40));
    expect(manifest.pauses.length).toBeGreaterThan(0);
    for (const p of manifest.pauses) { expect(p.sec).toBeLessThanOrEqual(1.6); expect(p.after_word).toBeGreaterThanOrEqual(0); }
  });

  it('chooses music from the chapter, the outline or the words', () => {
    const { manifest } = buildManifest(input());
    expect(manifest.music.find(m => m.scene === 8)?.mood).toBe('epic');
    expect(moodFor('The army besieged the castle and the legion won the battle for the king.')).toBe('epic');
    expect(moodFor('He disappeared and nobody knew the secret of the missing mystery.')).toBe('suspense');
    expect(moodFor('Nothing much happens here.')).toBe('suspense');
  });

  it('refuses a plan with a picture missing for a scene', () => {
    expect(() => buildManifest(input(5, { sceneImage: [0, 1] }))).toThrow();
  });
});

describe('boredom meter', () => {
  it('passes a plan with fast, varied visuals', () => {
    const r = boredomReport(buildManifest(input(40)).manifest);
    expect(r.metrics.changesPerMin).toBeGreaterThanOrEqual(15);
    expect(r.score).toBeGreaterThanOrEqual(62);
  });

  it('fails a slideshow: one picture per scene, no cards, long holds', () => {
    const slide: DocManifest = { kind: 'documentary', version: 1, width: 1920, height: 1080, title: 't', images: Array.from({ length: 12 }, (_, i) => `i${i}`), voice: [], pauses: [], music: [], captions: true,
      scenes: Array.from({ length: 12 }, () => ({ text: 'The old city sat quietly beside the slow river while the people went about their long and ordinary days without hurry or worry or any real thought.' })),
      beats: Array.from({ length: 12 }, (_, i) => ({ scene: i, w0: 0, w1: 26, visual: { type: 'image' as const, src: i, move: 'push' as const } })) };
    const r = boredomReport(slide);
    expect(r.pass).toBe(false);
    expect(r.metrics.changesPerMin).toBeLessThan(15);
    expect(describeWeak(r).join(' ')).toMatch(/picture/);
  });

  it('counts repeated framings and long sentences', () => {
    const m = buildManifest(input(20)).manifest;
    const bad = { ...m, scenes: m.scenes.map(s => ({ ...s, text: s.text + ' ' + 'and so it went on and on for a very long time without any pause or turn at all in the whole story that anyone could remember hearing' })) };
    expect(boredomReport(bad).metrics.longSentences).toBeGreaterThan(0);
  });
});

describe('wry asides in the manifest', () => {
  it('an aside gets a punch-in and a record scratch on its first picture beat', () => {
    const base = scenesOf(8).map((s, i) => ({ ...s, aside: i === 3 }));
    const { manifest } = buildManifest(input(8, { scenes: base, chapters: [{ scene: 0, title: 'A' }] }));
    const first = manifest.beats.find(b => b.scene === 3 && b.visual.type === 'image')!;
    expect(first.sfx).toBe('scratch');
    expect(first.visual.type === 'image' && first.visual.move).toBe('punch');
    expect(manifest.beats.filter(b => b.sfx === 'scratch')).toHaveLength(1);
  });
});
