import { expect, it } from 'vitest';
import { searchLibrary, shortlist } from '@/lib/object-library';
import { groundLibraryScenes } from '@/lib/library-direction';
import { cartoonStart, sanitizeDirection } from '@/lib/cartoon-job';
it('grounds an elephant sentence in a real elephant model, not a generic map', () => {
  const text = 'An elephant walked into the town.';
  const scenes = groundLibraryScenes([{ world: 'town', props: [{ kind: 'map', place: 'hand', motion: 'none' }] }], [text], shortlist([text]));
  expect(scenes[0]?.props?.[0]?.asset).toMatch(/elephant/i);
  expect(scenes[0]?.props?.[1]?.kind).toBe('map');
});
it('keeps unsupported nouns and faithful built-ins without invented ids', () => {
  const scenes = [{ world: 'lab', props: [{ kind: 'flask', place: 'hand', motion: 'none' }] }];
  expect(groundLibraryScenes(scenes, ['The scientist pours the flask.'], [])).toEqual(scenes);
  const ship = [{ world: 'ship', props: [{ kind: 'pirate_ship', place: 'sea', motion: 'approach' }] }];
  expect(groundLibraryScenes(ship, ['The pirate ship approaches.'], shortlist(['The pirate ship approaches.']))[0]?.props).toHaveLength(1);
});
it('uses supported moving models and produces a valid cartoon handoff', () => {
  const text = 'The velociraptor hunted at night.';
  const scene = { world: 'landscape', light: 'day', action: 'point', expression: 'neutral', actor: 'hero', wide: true, props: [] };
  const grounded = groundLibraryScenes([scene], [text], shortlist([text]));
  const asset = grounded[0]?.props?.[0];
  expect(searchLibrary(text).find(o => o.id === asset?.asset)?.clips?.length).toBeGreaterThan(0);
  expect(asset?.motion).toBe('approach');
  const direction = sanitizeDirection({ cast: [{ id: 'hero', seed: 7, outfit: 'explorer' }], scenes: grounded } as never, [text]);
  expect(cartoonStart.safeParse({ videoId: 'test', voicePath: 'owner/test/voice.wav', script: text, narration: [text], direction, gate: { score: 80, ready: false, parts: {}, blockers: [] }, hookType: 'action', report: { revealSec: 2, shotMix: {} }, captions: true, sfx: true }).success).toBe(true);
});