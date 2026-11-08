import { expect, it } from 'vitest';
import { cartoonStart, reviewMatches } from '@/lib/cartoon-job';
const fixture = () => ({ videoId: 'test', voicePath: 'owner/test/voice.wav', script: 'A sailor pours oil.', narration: ['A sailor pours oil.'], direction: { cast: [{ id: 'hero', seed: 3, outfit: 'sailor' }], scenes: [{ world: 'ship', light: 'day', action: 'pour', expression: 'neutral', actor: 'hero', wide: false }] }, gate: { score: 85, ready: true, parts: {}, blockers: [] }, hookType: 'action', report: { revealSec: 1, shotMix: {} }, captions: false, sfx: true });
it('blocks cartoon work below the approved 85-point story gate', () => {
  const f = fixture(); f.gate.score = 84; expect(cartoonStart.safeParse(f).success).toBe(false);
  f.gate.score = 85; expect(cartoonStart.safeParse(f).success).toBe(true);
});
it('requires matching immutable owner review and rejects duplicate approvals', () => {
  const review = { hash: 'a'.repeat(64), storeId: 'store', sheets: ['sheet'], alignmentPath: 'words', voicePath: 'voice', duration: 34 };
  expect(reviewMatches(review, 'b'.repeat(64))).toBe(false); expect(reviewMatches(review, review.hash)).toBe(true);
  expect(reviewMatches({ ...review, approved: true }, review.hash)).toBe(false);
});
it('rejects unsupported actions and mismatched narration before hosted work', () => {
  const f = fixture(); const scene = f.direction.scenes[0]; if (!scene) throw Error('fixture'); scene.action = 'fly'; expect(cartoonStart.safeParse(f).success).toBe(false);
  const g = fixture(); g.script = 'Different story'; expect(cartoonStart.safeParse(g).success).toBe(false);
});
it('accepts Visual Director scenes and rejects things the engine cannot draw', () => {
  const f = fixture(); const scene = f.direction.scenes[0] as Record<string, unknown>;
  f.direction.cast.push({ id: 'captain', seed: 9, outfit: 'captain' });
  Object.assign(scene, { shot: 'close', move: 'shake', mood: 'tense', speaker: 'captain', keyword: 'oil', fx: ['rain'], cues: [{ word: 3, kind: 'splash' }],
    props: [{ kind: 'oil_jar', place: 'hand', motion: 'none' }, { kind: 'pirate_ship', place: 'sea', motion: 'approach' }],
    actors: [{ actor: 'hero', action: 'pour', expression: 'grin', slot: 'left', facing: 1 }, { actor: 'captain', action: 'shout', expression: 'stern', slot: 'right', facing: -1 }] });
  expect(cartoonStart.safeParse(f).success).toBe(true);
  const bad = (patch: Record<string, unknown>) => { const g = structuredClone(f); Object.assign(g.direction.scenes[0] as object, patch); return cartoonStart.safeParse(g).success; };
  expect(bad({ props: [{ kind: 'dragon', place: 'sea', motion: 'none' }] })).toBe(false);
  expect(bad({ cues: [{ word: 4, kind: 'splash' }] })).toBe(false); // sentence has 4 words, index 4 is past it
  expect(bad({ speaker: 'stranger' })).toBe(false);
  expect(bad({ actors: [{ actor: 'hero', action: 'idle', expression: 'neutral', slot: 'left', facing: 0 }, { actor: 'captain', action: 'idle', expression: 'neutral', slot: 'left', facing: 0 }] })).toBe(false);
});
