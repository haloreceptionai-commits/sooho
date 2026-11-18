import { describe, expect, it } from 'vitest';
import { numberToWords } from '@/lib/story-v2';
import { cardValue, findSpokenNumbers, labelAfter } from '@/lib/documentary/spoken-numbers';

const find = (s: string) => findSpokenNumbers(s.split(/\s+/));

describe('spoken numbers', () => {
  it('reads counts', () => {
    expect(find('He led thirty-seven thousand soldiers north')[0]).toMatchObject({ value: 37000, year: false, start: 2, end: 4 });
    expect(find('two hundred and eighteen men')[0]!.value).toBe(218);
    expect(find('one thousand two hundred ships')[0]!.value).toBe(1200);
    expect(find('a hundred elephants')[0]!.value).toBe(100);
    expect(find('three million people')[0]!.value).toBe(3_000_000);
  });

  it('reads years spoken as pairs and eras', () => {
    expect(find('In nineteen sixty-five it opened')[0]).toMatchObject({ value: 1965, year: true });
    expect(find('in eighteen eighty nine the tower')[0]).toMatchObject({ value: 1889, year: true });
    expect(find('in twenty twenty four we')[0]).toMatchObject({ value: 2024, year: true });
    const bc = find('In two hundred eighteen BC a general')[0]!;
    expect(bc).toMatchObject({ value: 218, era: 'BC', end: 5 });
    expect(cardValue(bc)).toBe('218');
    expect(cardValue(find('nineteen oh five was')[0]!)).toBe('1905');
  });

  it('formats counts with separators and years plainly', () => {
    expect(cardValue(find('thirty seven thousand soldiers')[0]!)).toBe('37,000');
  });

  it('round-trips everything the pipeline can spell', () => {
    for (const n of [7, 12, 19, 20, 21, 45, 99, 100, 101, 250, 999, 1000, 1001, 2500, 10_000, 37_000, 125_000, 1_000_000, 2_300_000]) {
      const words = numberToWords(n).split(' ');
      const found = findSpokenNumbers(words);
      expect(found.length, String(n)).toBe(1);
      expect(found[0]!.value, numberToWords(n)).toBe(n);
    }
    for (const y of [1100, 1492, 1776, 1889, 1912, 1965, 2015, 2024]) {
      const found = findSpokenNumbers(numberToWords(y, true).split(' '));
      expect(found[0]!.value, String(y)).toBe(y);
    }
  });

  it('ignores ordinary words and malformed runs', () => {
    expect(find('one of the many reasons')).toHaveLength(1);   // "one" alone is a number word; callers decide what counts
    expect(find('the army marched north')).toHaveLength(0);
    expect(find('five five five').length === 0 || find('five five five')[0]!.value !== 15).toBe(true);
  });

  it('names what is counted', () => {
    const w = 'He had thirty seven thousand soldiers and a herd of elephants'.split(' ');
    const n = findSpokenNumbers(w)[0]!;
    expect(labelAfter(w, n.end)).toBe('soldiers');
    expect(labelAfter('over ten thousand of them died'.split(' '), 3)).toBe('');
  });
});
