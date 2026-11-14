import { describe, it, expect } from 'vitest';
import { assertVideoEngine, usesCartoonWorker } from '@/lib/video-engines';
import { cartoonStart } from '@/lib/cartoon-job';

const base = {
  videoId: 'v1', voicePath: 'u/v1/cartoon/original-voice.wav', script: 'One pig almost started a war.', narration: ['One pig almost started a war.'],
  direction: { cast: [{ id: 'pig', seed: 3, outfit: 'farmer' }], scenes: [{ actor: 'pig', action: 'idle', expression: 'happy', shot: 'medium', world: 'village', light: 'day', camera: 'push_in' }] },
  gate: { score: 80, ready: true, parts: {}, blockers: [] }, hookType: 'contrast', report: { revealSec: 3, shotMix: {} }, captions: true, sfx: true,
};
describe('Advanced Video AI engine', () => {
  it('is an allowed engine that runs on the cartoon worker', () => {
    expect(() => assertVideoEngine('advanced')).not.toThrow();
    expect(usesCartoonWorker('advanced')).toBe(true);
    expect(usesCartoonWorker('own')).toBe(false);
  });
  it('requires a saved card for every carded cast member', () => {
    const carded = { ...base, direction: { ...base.direction, cast: [{ ...base.direction.cast[0]!, card: true }] } };
    expect(cartoonStart.safeParse({ ...carded, advanced: true }).success).toBe(false);
    expect(cartoonStart.safeParse({ ...carded, advanced: true, cards: [{ id: 'pig', path: 'u/v1/media/card-pig.png' }] }).error?.issues.map(i => i.message) ?? []).not.toContain('Character cards must match the cast');
  });
  it('rejects cards on the plain Own cartoon engine', () => {
    const r = cartoonStart.safeParse({ ...base, direction: { ...base.direction, cast: [{ ...base.direction.cast[0]!, card: true }] }, cards: [{ id: 'pig', path: 'u/v1/media/card-pig.png' }] });
    expect(r.error?.issues.map(i => i.message)).toContain('Character cards must match the cast');
  });
});
