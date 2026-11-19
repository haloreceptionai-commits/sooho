import { describe, expect, it } from 'vitest';
import { assertVideoEngine, isAdvancedEngine, rendererFor, usesCartoonWorker } from '../lib/video-engines';

describe('supported video engines', () => {
  it('rejects removed Gemini Omni', () => { expect(() => assertVideoEngine('omni')).toThrow('removed'); });
  it('rejects removed Seedance 2.5', () => { expect(() => assertVideoEngine('seedance')).toThrow('removed'); });
  it('keeps Own images, Own cartoon and the legacy default available', () => {
    for (const engine of ['own', 'cartoon', undefined]) expect(() => assertVideoEngine(engine)).not.toThrow();
  });
  it('offers Advanced Cartoon v2 as an advanced engine on the cartoon worker', () => {
    expect(() => assertVideoEngine('advanced-v2')).not.toThrow();
    expect(isAdvancedEngine('advanced-v2')).toBe(true);
    expect(usesCartoonWorker('advanced-v2')).toBe(true);
  });
  it('sends the cartoon-v2 renderer flag only for Advanced Cartoon v2', () => {
    expect(rendererFor('advanced-v2')).toBe('cartoon-v2');
    expect(rendererFor('advanced')).toBeUndefined();
    expect(rendererFor(undefined)).toBeUndefined();
  });
});
