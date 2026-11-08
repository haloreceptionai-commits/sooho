import { expect, it } from 'vitest';
import { canonical } from '../../hosted-renderer/cartoon/canonical.mjs';
it('preserves manifest approval across cloud JSON key reordering without allowing changed values', () => {
  const original = { script: 'pour', cast: [{ id: 'hero', seed: 3 }], fps: 30 };
  expect(canonical(original)).toBe(canonical({ fps: 30, cast: [{ seed: 3, id: 'hero' }], script: 'pour' }));
  expect(canonical(original)).not.toBe(canonical({ ...original, fps: 29 }));
});