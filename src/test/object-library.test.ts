import { describe, expect, it } from 'vitest';
import { LIBRARY, searchLibrary, shortlist } from '@/lib/object-library';
import { cartoonScene } from '@/lib/cartoon-job';

describe('object library', () => {
  it('bundles thousands of CC0 objects with unique ids', () => {
    expect(LIBRARY.length).toBeGreaterThan(2500);
    expect(new Set(LIBRARY.map(o => o.id)).size).toBe(LIBRARY.length);
  });
  it('finds the named noun for a sentence', () => {
    expect(searchLibrary('An elephant walked into the town').map(o => o.id)).toContain('animal-pack/elephant');
    expect(searchLibrary('The rocket landed').some(o => o.name.includes('rocket'))).toBe(true);
  });
  it('caps the shortlist size', () => {
    expect(shortlist(Array(40).fill('tree rock car ship food house'), 120).length).toBeLessThanOrEqual(120);
  });
  it('requires an id for library objects and forbids holding them', () => {
    const base = { world: 'town', light: 'day', action: 'idle', expression: 'neutral', actor: 'hero', wide: false } as const;
    expect(cartoonScene.safeParse({ ...base, props: [{ kind: 'asset', place: 'ground_left', motion: 'none', asset: 'animal-pack/elephant' }] }).success).toBe(true);
    expect(cartoonScene.safeParse({ ...base, props: [{ kind: 'asset', place: 'ground_left', motion: 'none' }] }).success).toBe(false);
    expect(cartoonScene.safeParse({ ...base, props: [{ kind: 'asset', place: 'hand', motion: 'none', asset: 'animal-pack/elephant' }] }).success).toBe(false);
  });
});
