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