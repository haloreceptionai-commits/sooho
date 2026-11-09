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
  it('matches camel-case and underscore names and ranks full objects above parts', () => {
    expect(searchLibrary('The rocket landed')[0]?.name.toLowerCase()).toContain('rocket');
    expect(searchLibrary('A yellow dragon flew').some(o => o.id.includes('YellowDragon'))).toBe(true);
    expect(searchLibrary('An elephant walks')[0]?.type).toBe('model');
  });
  it('does not fill results with pack-wide tag matches or opening-scene variants', () => {
    expect(searchLibrary('A sailor knows the sea').length).toBe(0);
    const result = shortlist(['A tree grows', 'An elephant walks', 'The velociraptor hunts'], 3);
    expect(result.some(o => /elephant/i.test(o.name))).toBe(true);
    expect(result.some(o => /velociraptor/i.test(o.name))).toBe(true);
  });
  it('requires an id for library objects and forbids holding them', () => {
    const base = { world: 'town', light: 'day', action: 'idle', expression: 'neutral', actor: 'hero', wide: false } as const;
    expect(cartoonScene.safeParse({ ...base, props: [{ kind: 'asset', place: 'ground_left', motion: 'none', asset: 'animal-pack/elephant' }] }).success).toBe(true);
    expect(cartoonScene.safeParse({ ...base, props: [{ kind: 'asset', place: 'ground_left', motion: 'none' }] }).success).toBe(false);
    expect(cartoonScene.safeParse({ ...base, props: [{ kind: 'asset', place: 'hand', motion: 'none', asset: 'animal-pack/elephant' }] }).success).toBe(false);
  });
});

describe('Quaternius additions', () => {
  it('adds over 2,000 Quaternius objects with hundreds of animated ones', async () => {
    const { LIBRARY } = await import('@/lib/object-library');
    const q = LIBRARY.filter(o => o.pack.startsWith('q-'));
    expect(q.length).toBeGreaterThan(2000);
    expect(q.filter(o => o.clips?.length).length).toBeGreaterThan(100);
  });
  it('finds a moving dinosaur for a dinosaur sentence', async () => {
    const { searchLibrary } = await import('@/lib/object-library');
    expect(searchLibrary('The velociraptor hunted at night').some(o => o.clips?.length)).toBe(true);
  });
});
