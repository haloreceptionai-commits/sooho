import { describe, expect, it } from 'vitest';
import { alignedTimeline } from '@/lib/speech-timeline';

describe('measured Ink cut timing', () => {
  it('cuts at the spoken phrase onset even when equal-length phrases take different times', () => {
    const result = alignedTimeline([{ scenes: [0, 1], start: .15, from: .1, dur: 4, alignment: [
      { scene: 0, words: [{ text: 'roads', start: .1, end: .6 }] },
      { scene: 1, words: [{ text: 'stone', start: 2.8, end: 4 }] },
    ] }], ['roads', 'stone']);
    expect(result[1]?.start).toBeCloseTo(2.85);
    expect(result[0]?.end).toBeCloseTo(2.85);
    expect(result[1]?.words[0]?.t0).toBeCloseTo(2.85);
  });
  it('rejects timing associated with the wrong picture instead of guessing', () => {
    expect(() => alignedTimeline([{ scenes: [0], start: 0, from: 0, dur: 2, alignment: [{ scene: 1, words: [{ text: 'road', start: 0, end: 1 }] }] }], ['road'])).toThrow('association');
  });
  it('rejects missing word alignment rather than silently producing mismatched cuts', () => {
    expect(() => alignedTimeline([{ scenes: [0], start: 0, from: 0, dur: 2, alignment: [{ scene: 0, words: [{ text: 'road', start: 0, end: 1 }] }] }], ['stone road'])).toThrow('differs');
  });
});