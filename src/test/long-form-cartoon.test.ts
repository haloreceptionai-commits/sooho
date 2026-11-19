import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cartoonStart, sanitizeDirection } from '@/lib/cartoon-job';
import { joinWavs, groupTakes, parseWav } from '@/lib/wav';
import { badgeLayout } from '@/lib/thumbnail-text';
import { toMapSpec } from '@/lib/pipeline-operations.server';
import { validateManifest } from '../../hosted-renderer/cartoon/validate-manifest.mjs';

const mapScene = { world: 'map', light: 'day', action: 'idle', expression: 'neutral', actor: 'hero', wide: true,
  map: { regions: ['ottoman_empire'], focus: [32, 38, 1.6], reveal: 'grow', label: 'Ottoman', years: '1299 - 1923' } };
const start = (format?: 'short' | 'long') => ({ videoId: 'lf', voicePath: 'o/lf/voice.wav', script: 'An empire rose.', narration: ['An empire rose.'],
  direction: { cast: [{ id: 'hero', seed: 3, outfit: 'king' }], scenes: [mapScene] }, gate: { score: 80, ready: false, parts: {}, blockers: [] },
  hookType: 'x', report: { revealSec: 1, shotMix: {} }, captions: false, sfx: true, ...(format ? { format } : {}) });

it('allows map scenes only in long-form videos', () => {
  expect(cartoonStart.safeParse(start('long')).success).toBe(true);
  expect(cartoonStart.safeParse(start('short')).success).toBe(false);
  expect(cartoonStart.safeParse(start()).success).toBe(false);
});

it('keeps Shorts at 120 scenes while long-form allows up to 600', () => {
  const many = (n: number, format: 'short' | 'long') => {
    const narration = Array.from({ length: n }, (_, i) => `Line ${'x'.repeat(1)} ${i}.`.replace(/\d+/, 'n'));
    const s = start(format); s.narration = narration; s.script = narration.join(' ');
    s.direction.scenes = narration.map(() => ({ ...mapScene, world: format === 'long' ? 'map' : 'landscape' }));
    return s;
  };
  expect(cartoonStart.safeParse(many(121, 'short')).success).toBe(false);
  expect(cartoonStart.safeParse(many(400, 'long')).success).toBe(true);
});

it('falls back to landscape when a character scene asks for the map world without map data', () => {
  const d = sanitizeDirection({ cast: [{ id: 'hero', seed: 1, outfit: 'king' }], scenes: [{ world: 'map', light: 'day', action: 'idle', expression: 'neutral', actor: 'hero', wide: false }] }, ['Hello there.']);
  expect(d.scenes[0]!.world).toBe('landscape');
});

it('clamps map director output to engine-safe values and drops unknown regions', () => {
  const spec = toMapSpec({ regions: ['tur', 'atlantis'], focus: [200, 95, 20], reveal: 'grow', label: 'OTTOMAN<script>', years: '1299 - 1923',
    cities: [{ name: 'Constantinople', at: [28.98, 41.01] }], armies: [{ from: [34, 39], to: [29.5, 41], side: 'red' }] }, new Set(['tur']));
  expect(spec!.regions).toEqual(['tur']);
  expect(spec!.focus).toEqual([180, 85, 8]);
  expect(spec!.label).toBe('OTTOMANscript');
});

it('the hosted worker accepts a 16:9 map shot and rejects unknown regions or cast cards on maps', () => {
  const m = { version: 'cartoon-v2', videoId: 'lf', fps: 30, width: 1920, height: 1080, captions: false,
    narration: { path: 'voice.wav', sha256: 'a'.repeat(64), samples: 48000 * 2, rate: 48000 },
    words: [{ text: 'empire', start: 0, end: 1, confidence: .9 }], caption_words: ['empire'], cast: [{ id: 'hero', outfit: 'king', seed: 3 }],
    shots: [{ start: 0, end: 60, world: 'map', light: 'day', shot: 'high', move: 'orbit', mood: 'calm', shake: 0, speaker: null, keyword: null, props: [], fx: [], actors: [],
      map: { regions: ['ottoman_empire'], focus: [32, 38, 1.6], reveal: 'grow', label: 'Ottoman', years: '1299 - 1923' },
      camera: [{ frame: 0, pos: [16, 25, 0], look: [16, 0, -19], fov: 40, roll: 0 }], events: [] }] };
  expect(() => validateManifest(m)).not.toThrow();
  const bad = structuredClone(m); bad.shots[0]!.map.regions = ['atlantis']; expect(() => validateManifest(bad)).toThrow('Unknown map region');
  const cards = structuredClone(m); (cards.shots[0] as { actors: unknown[] }).actors = [{ id: 'hero', pos: [0, 0, 0], action: 'idle', expression: 'neutral', facing: 0 }];
  expect(() => validateManifest(cards)).toThrow('Map shots');
  const shortMap = structuredClone(m); shortMap.width = 1080; shortMap.height = 1920; expect(() => validateManifest(shortMap)).not.toThrow();
});

function wav(samples: number[], rate = 24000) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b), w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true)); return b;
}

it('joins narration takes into one WAV with a 0.35 s gap', () => {
  const out = parseWav(joinWavs([wav([1, 2, 3]), wav([4, 5])]));
  expect(out.rate).toBe(24000);
  expect(out.data.length / 2).toBe(3 + 2 + Math.round(0.35 * 24000));
  expect(() => joinWavs([wav([1]), wav([1], 48000)])).toThrow('different formats');
});

it('groups narration into takes of at most 140 words without splitting sentences', () => {
  const s = Array.from({ length: 10 }, () => Array(50).fill('word').join(' ') + '.');
  const takes = groupTakes(s, 140);
  expect(takes.length).toBe(5);
  expect(takes.every(t => t.split(' ').length <= 140)).toBe(true);
});

it('wraps a long thumbnail title onto two badge lines and keeps years below', () => {
  const measure = (t: string, size: number) => t.length * size * 0.62;
  const b = badgeLayout('Rise of England', '1066 - 2027', 1280, measure);
  expect(b.map(x => x.text)).toEqual(['RISE OF', 'ENGLAND', '1066 - 2027']);
  expect(b[2]!.y).toBeGreaterThan(b[1]!.y);
  expect(badgeLayout('Ottoman', '', 1280, measure).map(x => x.text)).toEqual(['OTTOMAN']);
});

it('ships a bundled region list with the empire presets the map director may use', () => {
  const ids = JSON.parse(readFileSync('hosted-renderer/cartoon/assets/map/region-ids.json', 'utf8')) as string[];
  for (const id of ['ottoman_empire', 'roman_empire', 'mongol_empire', 'british_empire', 'tur', 'egy']) expect(ids).toContain(id);
});
