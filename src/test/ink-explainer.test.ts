import { describe, expect, it } from 'vitest';
import { pickInkCards, cardLines } from '@/lib/ink-card';
import { inkTitleLayout } from '@/lib/thumbnail-text';

describe('ink idea cards', () => {
  it('drops the first scene, neighbours and long text, caps to one in four', () => {
    const r = pickInkCards([
      { index: 0, text: 'START', icon: 'x' }, { index: 2, text: '3 billion years ago', icon: 'timeline' },
      { index: 3, text: 'NEXT', icon: 'x' }, { index: 5, text: 'way too many words here', icon: 'x' },
      { index: 6, text: 'night owl?', icon: 'owl' }, { index: 9, text: 'ONE MORE', icon: 'x' },
    ], 12);
    expect(r.map(c => c.index)).toEqual([2, 6, 9]);
    expect(r[0]!.text).toBe('3 BILLION YEARS AGO');
  });
  it('never returns more than floor(n/4) cards', () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({ index: i * 2 + 1, text: 'A', icon: '' }));
    expect(pickInkCards(raw, 20)).toHaveLength(5);
  });
  it('balances two lines', () => {
    expect(cardLines('THREE BILLION YEARS AGO', 10, t => t.length)).toEqual(['THREE BILLION', 'YEARS AGO']);
  });
});

describe('ink thumbnail title', () => {
  it('keeps words inside the right side of the frame', () => {
    const b = inkTitleLayout('still survived?', 1280, 720, (t, s) => t.length * s * 0.6);
    for (const x of b) { expect(x.x).toBeGreaterThan(1280 * 0.38); expect(x.x + x.w).toBeLessThanOrEqual(1280); }
  });
});

import { liftWhite } from '@/lib/ink-card';
describe('card paper', () => {
  it('turns off-white paper pure white and keeps black ink', () => {
    expect(liftWhite(225)).toBe(255); expect(liftWhite(0)).toBe(0);
  });
});
