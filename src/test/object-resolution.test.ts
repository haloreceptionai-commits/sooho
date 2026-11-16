import { describe, it, expect } from 'vitest';
import { fullPhraseMatch, resolveSceneObjects, objectsToPaint } from '@/lib/object-resolution';
import { LIBRARY } from '@/lib/object-library';

const tank = LIBRARY.find(o => o.id === 'q-animatedtanks/Tank')!;
const barrel = LIBRARY.find(o => o.id === 'pirate-kit/barrel')!;
const scene = (objects: unknown[], props: unknown[] = []) => ({ world: 'town', props, objects } as never);

describe('Stage 1 object resolution (owner rule: whole phrase, never a keyword)', () => {
  it('never maps a molasses tank to the army tank model', () => {
    expect(fullPhraseMatch(tank, 'huge riveted steel molasses storage tank, 1919')).toBe(false);
  });
  it('uses a library model only when the whole phrase matches it', () => {
    expect(fullPhraseMatch(barrel, 'barrel')).toBe(true);
    expect(fullPhraseMatch(barrel, 'oak whiskey barrel')).toBe(false);
  });
  it('turns an unmatched phrase into a painted card and drops the keyword-picked model', () => {
    const { scenes } = resolveSceneObjects([scene([{ id: 'molasses_tank', phrase: 'huge riveted steel molasses storage tank, 1919', size: 'huge' }],
      [{ kind: 'asset', asset: 'q-animatedtanks/Tank', place: 'background', motion: 'none' }, { kind: 'telescope', place: 'ground_left', motion: 'none' }])]);
    const props = (scenes[0] as unknown as { props: { asset?: string; size?: string }[] }).props;
    expect(props).toEqual([expect.objectContaining({ asset: 'card/molasses_tank', size: 'huge', place: 'background' })]);
  });
  it('reuses one card per object id across scenes and lists its scenes for painting', () => {
    const { scenes } = resolveSceneObjects([scene([{ id: 'tank', phrase: 'steel molasses tank', size: 'huge' }]), scene([]), scene([{ id: 'tank', phrase: 'leaking steel molasses tank', size: 'huge' }])]);
    expect(objectsToPaint(scenes as never)).toEqual([{ name: 'tank', look: 'steel molasses tank', scenes: [0, 2] }]);
  });
  it('logs objects beyond the painting limit instead of substituting another object', () => {
    const { scenes, missing } = resolveSceneObjects([scene([{ id: 'a', phrase: 'brass bell', size: 'small' }, { id: 'b', phrase: 'iron anvil', size: 'medium' }])], 1);
    expect(objectsToPaint(scenes as never).map(o => o.name)).toEqual(['a']);
    expect(missing).toEqual([{ scene: 0, phrase: 'iron anvil', reason: 'painted object limit reached' }]);
  });
  it('never paints text labels, captions or people as objects', () => {
    const { scenes, missing } = resolveSceneObjects([scene([{ id: 'claim', phrase: "typed claim sheet labeled OWNER'S CLAIM", size: 'medium' }, { id: 'rescuers', phrase: 'covered stretchers with rescuers', size: 'large' }])]);
    expect(objectsToPaint(scenes as never)).toEqual([]);
    expect(missing.map(m => m.reason)).toEqual(['text or graphic, not a physical object', 'a person, not an object']);
  });
  it('paints the most recurring objects first and reuses a card when a new id names it', () => {
    const { scenes } = resolveSceneObjects([
      scene([{ id: 'jar', phrase: 'glass jar of molasses', size: 'small' }]),
      scene([{ id: 'molasses_tank', phrase: 'riveted steel molasses tank', size: 'huge' }]),
      scene([{ id: 'tank_wall', phrase: 'molasses tank wall tearing open', size: 'huge' }, { id: 'molasses_tank', phrase: 'riveted steel molasses tank', size: 'huge' }]),
    ], 1);
    expect(objectsToPaint(scenes as never)).toEqual([{ name: 'molasses_tank', look: 'riveted steel molasses tank', scenes: [1, 2] }]);
  });
});
