import { describe, expect, it } from 'vitest';
import { advancedOpeningIssues } from '@/lib/advanced-story';
import { eligibleHooks } from '@/lib/script-repair';
import { validateStory, type StoryInput } from '@/lib/story-v2';

describe('Advanced first three spoken words', () => {
  it('rejects the actual vague phone opening', () => {
    expect(advancedOpeningIssues('This tiny screen knows where you are.', 'phone').length).toBeGreaterThan(0);
  });
  it('accepts a direct subject without forcing a date or location', () => {
    expect(advancedOpeningIssues('Your compass points north without a battery.', 'compass')).toEqual([]);
  });
  it('accepts the benchmark-style concrete action in the first three words', () => {
    expect(advancedOpeningIssues('They shot gold into rock to trick buyers.', 'mine')).toEqual([]);
  });
  it('does not make a strong short opening ineligible for lacking a year', () => {
    const h = { type: 'paradox_image', line: 'Your compass points north without a battery.', text: 'EARTH IS A MAGNET', visual: '', curiosity: 8, clarity: 10, visualness: 8, speakability: 10 };
    const a = { subject: 'compass', year: '', place: '', org: '', stakes: '' };
    expect(eligibleHooks([h], a, '', true)).toHaveLength(1);
    expect(eligibleHooks([h], a, '')).toHaveLength(0);
  });
});

describe('Advanced connected explanation rather than invented drama', () => {
  const input: StoryInput = { kid: true, durationSec: 10, anchors: { subject: 'compass', year: '', place: '', org: '', stakes: '' }, question: 'Why does a compass point north?', hero: { name: 'compass', role: 'object', want: '' }, cast: [], scenes: [
    { beat: 'hook', narration: 'Your compass points north without a battery.', shot: 'wide', characters: [], money: true, loop_opened: 'main', loop_closed: '' },
    { beat: 'proof', narration: 'Its needle is a magnet, so Earth pulls it around until it points north.', shot: 'macro', characters: [], money: true, loop_opened: '', loop_closed: 'main' },
  ] };
  it('does not invent a hero goal, date, failure or myth for a mechanism', () => {
    const r = validateStory(input);
    expect(r.failed.filter(c => ['V1', 'V2', 'V6', 'V7', 'V9', 'CLOCK', 'LANG'].includes(c.id))).toEqual([]);
  });
  it('still rejects an incomplete spoken sentence', () => {
    const first = input.scenes[0];
    if (!first) throw Error('Missing story fixture');
    const r = validateStory({ ...input, scenes: [{ ...first, narration: 'North. Gold. Compass. Rock.' }] });
    expect(r.failed.some(c => c.id === 'LANG')).toBe(true);
  });
});