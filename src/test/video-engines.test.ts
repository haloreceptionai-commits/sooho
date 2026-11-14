import { describe, expect, it } from 'vitest';
import { assertVideoEngine } from '../lib/video-engines';

describe('supported video engines', () => {
  it('rejects removed Gemini Omni', () => { expect(() => assertVideoEngine('omni')).toThrow('removed'); });
  it('rejects removed Seedance 2.5', () => { expect(() => assertVideoEngine('seedance')).toThrow('removed'); });
  it('keeps Own images, Own cartoon and the legacy default available', () => {
    for (const engine of ['own', 'cartoon', undefined]) expect(() => assertVideoEngine(engine)).not.toThrow();
  });
});