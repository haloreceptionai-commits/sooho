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
