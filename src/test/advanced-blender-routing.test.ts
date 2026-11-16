import { describe, it, expect, afterEach } from 'vitest';
import { usesBlender } from '@/lib/azure-render';

describe('Advanced Video AI finishing uses the Blender 3D engine', () => {
  afterEach(() => { delete process.env['ADVANCED_BLENDER']; });
  it('routes finishing of a painted-card (Advanced) job to Blender', () => {
    expect(usesBlender('finish', { manifest: { cards: [{ id: 'bird' }] } })).toBe(true);
  });
  it('keeps other cartoon jobs and all previews on the existing engine', () => {
    expect(usesBlender('finish', { manifest: { cards: [] } })).toBe(false);
    expect(usesBlender('finish', { manifest: {} })).toBe(false);
    expect(usesBlender('preflight', { manifest: { cards: [{ id: 'bird' }] } })).toBe(false);
  });
  it('can be switched off', () => {
    process.env['ADVANCED_BLENDER'] = 'off';
    expect(usesBlender('finish', { manifest: { cards: [{ id: 'bird' }] } })).toBe(false);
  });
});
