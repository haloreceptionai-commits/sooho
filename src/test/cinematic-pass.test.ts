import { describe, expect, it } from 'vitest';
import { cinematicPass } from '@/lib/cinematic-pass';

const base = { world: 'lab', shot: 'wide', move: 'static', mood: 'calm' };
const flask = { kind: 'flask', place: 'ground_left', motion: 'none' };

describe('cinematic pass', () => {
  it('carries the last main prop into an empty scene', () => {
    const out = cinematicPass([{ ...base, props: [flask] }, { ...base, shot: 'close', props: [] }]);
    expect(out[1]!.props?.[0].kind).toBe('flask');
  });
  it('never repeats the same shot and move, nor two static cuts', () => {
    const out = cinematicPass([{ ...base }, { ...base }]);
    expect(out[1]!.move).toBe('push_in');
  });
  it('cuts to an insert of the main object after three non-close shots', () => {
    const s = ['wide', 'medium', 'low', 'high'].map((shot, i) => ({ ...base, shot, move: i % 2 ? 'push_in' : 'pull_back', props: [flask] }));
    expect(cinematicPass(s)[3]!.shot).toBe('insert');
  });
  it('adds a burst on the reveal and rain at storm sea, max 3 effects', () => {
    const out = cinematicPass([{ ...base, world: 'storm_sea', mood: 'reveal', fx: ['smoke', 'fire'] }]);
    expect(out[0]!.fx).toEqual(['smoke', 'fire', 'burst']);
  });
});
