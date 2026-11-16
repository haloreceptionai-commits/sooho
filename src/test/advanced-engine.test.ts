import { describe, it, expect } from 'vitest';
import { assertVideoEngine, usesCartoonWorker } from '@/lib/video-engines';
import { cartoonStart } from '@/lib/cartoon-job';

const base = ({ videoId: 'test', voicePath: 'owner/test/voice.wav', script: 'A sailor pours oil.', narration: ['A sailor pours oil.'], direction: { cast: [{ id: 'hero', seed: 3, outfit: 'sailor' }], scenes: [{ world: 'ship', light: 'day', action: 'pour', expression: 'neutral', actor: 'hero', wide: false }] }, gate: { score: 85, ready: true, parts: {}, blockers: [] }, hookType: 'action', report: { revealSec: 1, shotMix: {} }, captions: false, sfx: true });
describe('Advanced Video AI engine', () => {
  it('is an allowed engine that runs on the cartoon worker', () => {
    expect(() => assertVideoEngine('advanced')).not.toThrow();
    expect(usesCartoonWorker('advanced')).toBe(true);
    expect(usesCartoonWorker('own')).toBe(false);
  });
  it('requires a saved card for every carded cast member', () => {
    const carded = { ...base, direction: { ...base.direction, cast: [{ ...base.direction.cast[0]!, card: true }] } };
    expect(cartoonStart.safeParse({ ...carded, advanced: true }).success).toBe(false);
    expect(cartoonStart.safeParse({ ...carded, advanced: true, cards: [{ id: 'hero', path: 'owner/test/media/card-hero.png' }] }).success).toBe(true);
  });
  it('rejects cards on the plain Own cartoon engine', () => {
    const r = cartoonStart.safeParse({ ...base, direction: { ...base.direction, cast: [{ ...base.direction.cast[0]!, card: true }] }, cards: [{ id: 'hero', path: 'owner/test/media/card-hero.png' }] });
    expect(r.success).toBe(false);
  });
});

import { placeObjectCards } from '@/lib/advanced-cards';
import { validateStory } from '@/lib/story-v2';

const carded = { ...base, advanced: true, direction: { ...base.direction, cast: [{ ...base.direction.cast[0]!, card: true }] } };
describe('Advanced Video AI cards', () => {
  it('accepts pose cards for cast members but not for unknown ids', () => {
    const cards = [{ id: 'hero', path: 'p' }, { id: 'hero-shock', path: 'p' }];
    expect(cartoonStart.safeParse({ ...carded, cards }).success).toBe(true);
    expect(cartoonStart.safeParse({ ...carded, cards: [...cards, { id: 'ghost-shock', path: 'p' }] }).success).toBe(false);
  });
  it('allows four cast members so an animal can act beside three people', () => {
    const cast = ['hero', 'pig', 'cap', 'adm'].map((id, i) => ({ id, seed: i + 1, outfit: 'sailor', card: true }));
    const r = cartoonStart.safeParse({ ...carded, direction: { ...carded.direction, cast }, cards: cast.map(c => ({ id: c.id, path: 'p' })) });
    expect(r.success).toBe(true);
  });
  it('places a painted object only in the scenes where it is said and keeps its card', () => {
    const painted = { cards: [{ id: 'hero', path: 'p' }, { id: 'obj-potato_patch', path: 'p' }, { id: 'obj-fence', path: 'p' }], objects: [{ name: 'potato_patch', scenes: [0] }, { name: 'fence', scenes: [5] }], log: [] };
    const out = placeObjectCards(carded.direction as never, painted);
    expect(out.direction.scenes[0]!.props).toEqual([{ kind: 'asset', asset: 'card/potato_patch', place: 'ground_right', motion: 'none' }]);
    expect(out.cards.map(c => c.id)).toEqual(['hero', 'obj-potato_patch']);
    expect(cartoonStart.safeParse({ ...carded, direction: out.direction, cards: out.cards }).success).toBe(true);
  });
});

describe('Advanced Video AI script rules', () => {
  const scene = (narration: string, characters = ['Lyman']) => ({ beat: 'try', narration, characters, shot: 'wide' as const, money: false, loop_opened: '', loop_closed: '' });
  const story = (lines: string[], durationSec: number, kid = true) => ({ scenes: lines.map(l => scene(l)), anchors: { year: '1859', place: 'San Juan Island', org: 'army', subject: 'pig', stakes: 'war' }, question: 'How can a pig start a war?', hero: { name: 'Lyman', role: 'farmer', want: 'keep his potatoes' }, cast: [{ name: 'Lyman', role: 'farmer' }], durationSec, kid });
  it('flags adult words for kid scripts', () => {
    const r = validateStory(story(['A pig crosses the boundary on San Juan Island.', 'The dispute starts to escalate fast.', 'Lyman grabs his rifle.'], 12));
    expect(r.failed.find(c => c.id === 'KID')?.msg).toContain('boundary (say "line between lands")');
  });
  it('flags a 12-second script that is far too long', () => {
    const long = Array.from({ length: 12 }, () => 'Lyman runs after the pig in the mud.');
    expect(validateStory(story(long, 12)).failed.find(c => c.id === 'LANG')?.msg).toMatch(/too long: \d+ words \(max 39\)/);
  });
  it('does not demand escalation or a myth line in a loop Short', () => {
    const r = validateStory(story(['A pig almost starts a war in 1859.', 'How can a pig start a war?', 'Lyman sees it eat his potatoes.'], 12));
    expect(r.checks.find(c => c.id === 'V9')?.pass).toBe(true);
    expect(r.checks.find(c => c.id === 'V7')?.pass).toBe(true);
  });
});

import { ensureAnimalCast } from '@/lib/advanced-cards';
describe('Advanced Video AI animal casting', () => {
  it('adds the emus to the cast and to every scene that names them', () => {
    const cast = ['major', 'gunner', 'farmer', 'reader'].map((id, i) => ({ id, seed: i + 1, outfit: 'sailor' }));
    const sc = (actor: string) => ({ world: 'town', light: 'day', action: 'point', expression: 'neutral', actor, wide: false });
    const d = ensureAnimalCast({ cast, scenes: [sc('major'), sc('gunner'), sc('major')] } as never, ['Emus run into the wheat!', 'The gunner aims at the fields.', 'The emus dash away.']);
    expect(d.cast.map(c => c.id)).toEqual(['major', 'gunner', 'reader', 'emu']);
    expect(d.scenes[0]!.actors!.find(a => a.actor === 'emu')?.action).toBe('run');
    expect(d.scenes[1]!.actors!.some(a => a.actor === 'emu')).toBe(false);
    expect(d.scenes[2]!.actors!.some(a => a.actor === 'emu')).toBe(true);
  });
  it('leaves the cast alone when the animal is already cast', () => {
    const d = { cast: [{ id: 'pig', seed: 1, outfit: 'sailor' }], scenes: [{ world: 'town', light: 'day', action: 'idle', expression: 'grin', actor: 'pig', wide: false }] };
    expect(ensureAnimalCast(d as never, ['The pig eats potatoes.'])).toBe(d);
  });
});
