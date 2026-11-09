import { expect, test } from 'vitest';
import { speakable } from '@/lib/story-v2';

const ok = (s: string) => s.split(/\s+/).every(t => /[A-Za-z]/.test(t)) && !/\d/.test(s);

test('stray closing quote is glued to the previous word (the failed sky video)', () => {
  const out = speakable('The beachgoer says, “It mirrors the ocean. ”');
  expect(out).toBe('The beachgoer says, “It mirrors the ocean.”');
  expect(ok(out)).toBe(true);
});
test('ordinals, decimals and money become spoken words', () => {
  expect(speakable('the 1st try')).toBe('the first try');
  expect(speakable('the 21st day')).toBe('the twenty-first day');
  expect(speakable('3.5 seconds')).toBe('three point five seconds');
  expect(speakable('$50 each')).toBe('fifty dollars each');
  expect(ok(speakable('A — B … 10th 2.25 £3 x²'))).toBe(true);
});
