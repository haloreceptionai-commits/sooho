import { describe, it, expect } from 'vitest';
import { diversifyCast } from '@/lib/pipeline.functions';
import { OUTFITS } from '@/lib/cartoon-job';
describe('cast variety', () => {
  it('offers 30 costumes', () => { expect(OUTFITS.length).toBe(30); });
  it('never gives two cast members the same outfit or seed', () => {
    const c = diversifyCast([{ id: 'a', seed: 5, outfit: 'sailor' }, { id: 'b', seed: 5, outfit: 'sailor' }, { id: 'c', seed: 5, outfit: 'sailor' }]);
    expect(new Set(c.map(x => x.outfit)).size).toBe(3);
    expect(new Set(c.map(x => x.seed)).size).toBe(3);
  });
});
