import { describe, expect, it, vi } from 'vitest';
import { GenerationCheckpointSaved, preserveGenerationCheckpoint } from '@/lib/generation-checkpoint';
import { writeShort, type WriterCalls } from '@/lib/shorts-writer/orchestrate';

function calls(): WriterCalls {
  return {
    facts: vi.fn(async () => Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, text: `Verified fact ${i}`, certain: true }))),
    spine: vi.fn(async () => ({ shareable: [], premise: 'One true story', hook_contradiction: 'Odd fact', problem: 'Problem', attempts: ['Attempt'], twist: 'Twist', payoff: 'Payoff', closing_line: 'Closing' })),
    spineCheck: vi.fn(async () => { throw new GenerationCheckpointSaved('saved'); }),
    hooks: vi.fn(async () => []), pickHook: vi.fn(async () => ({ index: 0, reason: '' })),
    script: vi.fn(async () => ({ lines: [] })), critic: vi.fn(async () => { throw Error('Must not run'); }),
    verifyNumbers: vi.fn(async () => []), rewrite: vi.fn(async () => ({ lines: [] })),
  };
}
describe('unattended script checkpoints', () => {
  it('preserves saved-step yields rather than treating them as a failed paid call', () => {
    const signal = new GenerationCheckpointSaved('saved');
    expect(() => preserveGenerationCheckpoint(signal)).toThrow(signal);
  });
  it('does not start a second paid call when the first checkpoint yields', async () => {
    const api = calls();
    await expect(writeShort(api, { durationSec: 60, serial: true, budgetMs: Infinity })).rejects.toBeInstanceOf(GenerationCheckpointSaved);
    expect(api.spineCheck).toHaveBeenCalledTimes(1);
    expect(api.hooks).not.toHaveBeenCalled();
  });
});