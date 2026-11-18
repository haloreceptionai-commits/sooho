import { describe, expect, it } from 'vitest';
import { attachCast, sceneBible, buildCast, cutoutPrompts, detectRoles, eraOf, heuristicFigures, mentions, nameTokens, parseCast, roleLook, type CastEntry } from '@/lib/documentary/cast';
import { cutoutName, paintCutouts } from '@/lib/documentary/cast-paint';
import { buildManifest } from '@/lib/documentary/build-manifest';
import { manifestProblems } from '@/lib/documentary/validate';
import type { DocBeat } from '@/lib/documentary/types';

const LINES = [
  'In fifteen eighty eight Queen Elizabeth waited while the Spanish fleet sailed north.',
  'English sailors loaded fire ships and soldiers watched the coast.',
  'Philip the Second had trusted his admirals and his priests more than the weather.',
  'The storm scattered the fleet and the survivors sailed home around Scotland.',
];

describe('cast: who is in the story', () => {
  it('finds the era from the years the narrator says', () => {
    expect(eraOf(LINES)).toBe('early-modern');
    expect(eraOf(['In two hundred eighteen BC an army crossed the Alps.'])).toBe('ancient');
    expect(eraOf(['In nineteen sixty two the world held its breath.'])).toBe('20th');
    expect(eraOf(['No year is spoken here at all.'])).toBe('modern');
  });

  it('knows which words of a name the narrator says', () => {
    expect(nameTokens('Queen Elizabeth I')).toEqual(['Elizabeth']);
    expect(mentions('Queen Elizabeth I', LINES[0]!)).toBe(true);
    expect(mentions('Queen Elizabeth I', LINES[1]!)).toBe(false);
    expect(mentions('Napoleon Bonaparte', 'Then napoleon marched north.')).toBe(false);   // a name is capitalised
    expect(mentions('Philip II', LINES[2]!)).toBe(true);
  });

  it('finds roles and dresses them for the era', () => {
    const roles = detectRoles(LINES);
    expect(roles.map(r => r.id)).toEqual(expect.arrayContaining(['soldier', 'sailor', 'priest']));
    expect(roleLook('soldier', 'ancient')).toMatch(/bronze helmet/);
    expect(roleLook('soldier', 'early-modern')).toMatch(/musket/);
    expect(roleLook('sailor', '19th')).not.toBe(roleLook('sailor', 'ancient'));
    expect(roleLook('nonsense', 'ancient')).toMatch(/ordinary person/);
  });

  it('keeps only spoken figures from the model and drops invented ones', () => {
    const cast = parseCast({ cast: [
      { name: 'Queen Elizabeth I', kind: 'figure', label: 'Queen of England', look: 'red wig, ruff collar, pale face' },
      { name: 'Winston Churchill', kind: 'figure', label: 'Prime Minister', look: 'bowler hat' },          // never mentioned
      { name: 'soldier', kind: 'role', label: 'Soldier', look: '' },
      { name: 'astronaut', kind: 'role', label: 'Astronaut', look: '' },                                   // never mentioned
    ] }, LINES, 'early-modern');
    expect(cast.map(c => c.name)).toEqual(['Queen Elizabeth I', 'Soldier']);
    expect(cast[1]!.look).toMatch(/musket/);
    expect(cast[0]!.id).toBe('queen-elizabeth-i');
  });

  it('works without the model: figures from the known names, roles from the words', () => {
    const cast = buildCast({ lines: LINES, era: 'early-modern', names: [{ name: 'Queen Elizabeth I', role: 'Queen of England' }, { name: 'Napoleon', role: 'Emperor' }] });
    expect(cast.filter(c => c.kind === 'figure').map(c => c.name)).toEqual(['Queen Elizabeth I']);
    expect(cast.filter(c => c.kind === 'role').length).toBeGreaterThan(0);
    expect(cast.filter(c => c.kind === 'role').length).toBeLessThanOrEqual(3);
    expect(heuristicFigures([{ name: 'Nobody Named' }], LINES, 'modern')).toEqual([]);
  });
});

const cast: CastEntry[] = [
  { id: 'queen-elizabeth-i', name: 'Queen Elizabeth I', kind: 'figure', label: 'Queen of England', look: 'red wig and ruff' },
  { id: 'soldier', name: 'Soldier', kind: 'role', label: 'Soldier', look: 'a soldier' },
];
const beat = (scene: number, w0: number, w1: number, visual: DocBeat['visual'] = { type: 'image', src: scene, move: 'push' }): DocBeat => ({ scene, w0, w1, visual });

describe('placing the cast on beats', () => {
  const texts = LINES;
  const beats = [beat(0, 0, 6), beat(0, 6, 13), beat(1, 0, 5), beat(1, 5, 11), beat(2, 0, 8), beat(3, 0, 7)];

  it('shows a person when the narrator says their name and keeps them for a few beats', () => {
    const out = attachCast(beats, texts, cast);
    expect(out[0]!.cast).toEqual([{ id: 'queen-elizabeth-i', side: 'left' }]);
    expect(out[1]!.cast?.[0]?.id).toBe('queen-elizabeth-i');
    expect(out[5]!.cast).toBeUndefined();                       // gone after the name stopped being mentioned
  });

  it('adds a role cutout while it is talked about, on the other side', () => {
    const out = attachCast(beats, texts, cast);
    const withBoth = out.find(b => (b.cast?.length ?? 0) === 2)!;
    expect(withBoth.cast!.map(c => c.side).sort()).toEqual(['left', 'right']);
  });

  it('labels a famous person once, on the side opposite the cutout', () => {
    const out = attachCast(beats, texts, cast);
    const labels = out.flatMap(b => (b.overlays ?? []).filter(o => o.kind === 'lower_third'));
    expect(labels).toHaveLength(1);
    expect(labels[0]!.data).toMatchObject({ name: 'Queen Elizabeth I', sub: 'Queen of England', side: 'right' });
  });

  it('never puts a cutout on a card beat', () => {
    const cardBeats = [beat(0, 0, 6), beat(0, 6, 13, { type: 'card', card: 'keyfact', data: { text: 'x' }, bg: 0 }), beat(1, 0, 5)];
    expect(attachCast(cardBeats, texts, cast)[1]!.cast).toBeUndefined();
  });

  it('leaves everything alone with an empty cast', () => {
    expect(attachCast(beats, texts, [])).toBe(beats);
  });
});

describe('one look in every picture', () => {
  it('dresses ordinary people for the era and repeats the same role description every time', () => {
    const a = sceneBible(LINES[1]!, cast, 'early-modern'), b = sceneBible(LINES[1]!, cast, 'early-modern');
    expect(a).toBe(b);
    expect(a).toMatch(/doublets, breeches/);
    expect(a).toMatch(/Any soldiers in the picture wear: a soldier/);
    expect(sceneBible(LINES[3]!, cast, 'early-modern')).not.toMatch(/soldiers in the picture/);
    expect(sceneBible('The tower was built in Paris.', cast, '19th')).toMatch(/frock coats/);
  });

  it('keeps named figures out of the background because their cutout is added separately', () => {
    expect(sceneBible(LINES[0]!, cast, 'early-modern')).toMatch(/Queen Elizabeth I is added separately: do not draw them/);
    expect(sceneBible(LINES[1]!, cast, 'early-modern')).not.toMatch(/added separately/);
  });
});

describe('painting cutouts', () => {
  const png = (): string => btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, ...Array.from({ length: 2500 }, (_, i) => i % 250)));
  const deps = (over: Partial<Parameters<typeof paintCutouts>[2]> = {}) => {
    const saved: string[] = [], prompts: string[][] = [];
    return { saved, prompts, d: { have: new Set<string>(), save: async (n: string) => { saved.push(n); }, paint: async (p: string[]) => { prompts.push(p); return { image: png(), tried: 0 }; }, report: () => undefined, ...over } };
  };

  it('writes the prompts in the video style: the named person first, plainer ones after', () => {
    const p = cutoutPrompts(cast[0]!, 'early-modern', 'Oil painting look.');
    expect(p).toHaveLength(3);
    expect(p[0]).toContain('Queen Elizabeth I');
    expect(p[0]).toContain('Oil painting look.');
    expect(p[0]).toContain('transparent background');
    expect(p[1]).not.toContain('Queen Elizabeth I');
    expect(cutoutPrompts(cast[1]!, 'early-modern')[0]).toContain('3D animated cartoon');
  });

  it('paints every cast member, saves each at once and reuses saved ones on resume', async () => {
    const x = deps();
    x.d.have.add(cutoutName('soldier'));
    const r = await paintCutouts(cast, 'early-modern', x.d);
    expect(x.saved).toEqual(['cast-queen-elizabeth-i.png']);
    expect(r.painted.map(c => c.id)).toEqual(['queen-elizabeth-i', 'soldier']);
  });

  it('drops a person that cannot be painted and says so, without stopping', async () => {
    const x = deps({ paint: async (p: string[]) => { if (p[0]!.includes('Queen')) throw new Error('refused'); return { image: png(), tried: 0 }; } });
    const r = await paintCutouts(cast, 'early-modern', x.d);
    expect(r.painted.map(c => c.id)).toEqual(['soldier']);
    expect(r.log.join(' ')).toMatch(/Queen Elizabeth I: no cutout/);
  });

  it('notes when a look-alike stand-in was drawn instead of the real person', async () => {
    const x = deps({ paint: async () => ({ image: png(), tried: 1 }) });
    const r = await paintCutouts([cast[0]!], 'early-modern', x.d);
    expect(r.log.join(' ')).toMatch(/stand-in/);
  });

  it('refuses something that is not a PNG', async () => {
    const x = deps({ paint: async () => ({ image: btoa('not a picture at all'.repeat(200)), tried: 0 }) });
    expect((await paintCutouts([cast[1]!], 'modern', x.d)).painted).toEqual([]);
  });
});

describe('manifest with a cast', () => {
  const scenes = LINES.map(narration => ({ narration }));
  const input = { title: 'T', scenes, chapters: [{ scene: 0, title: 'One' }], sceneImage: [0, 1, 2, 3], images: ['i0', 'i1', 'i2', 'i3'].map(x => `u/v/media/${x}.jpg`), voice: [{ path: 'u/v/assets/v0.wav', scenes: [0, 1, 2, 3] }] };

  it('carries cutouts and cast and passes the checks', () => {
    const { manifest } = buildManifest({ ...input, cast, cutouts: ['u/v/media/cast-queen-elizabeth-i.png', 'u/v/media/cast-soldier.png'] });
    expect(manifest.cutouts).toHaveLength(2);
    expect(manifest.cast![0]).toMatchObject({ id: 'queen-elizabeth-i', cutout: 0 });
    expect(manifest.beats.some(b => b.cast?.length)).toBe(true);
    expect(manifestProblems(manifest)).toEqual([]);
  });

  it('has no cast fields when nothing was painted', () => {
    const { manifest } = buildManifest(input);
    expect(manifest.cast).toBeUndefined();
    expect(manifest.beats.every(b => !b.cast)).toBe(true);
  });

  it('the checks catch a beat that shows someone who is not in the cast', () => {
    const { manifest } = buildManifest({ ...input, cast, cutouts: ['a', 'b'] });
    manifest.beats[0]!.cast = [{ id: 'ghost', side: 'left' }];
    expect(manifestProblems(manifest).join(' ')).toMatch(/not in the cast/);
  });
});
