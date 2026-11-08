import { describe, expect, it } from 'vitest';
import { generationPath, safePaidRetry } from '@/lib/generation-policy';
describe('durable paid generation safety', () => {
  it('does not repeat paid requests after an uncertain timeout', () => {
    expect(safePaidRetry('[504] AI took too long')).toBe(false);
    expect(safePaidRetry('[500] Provider error')).toBe(false);
    expect(safePaidRetry('Failed to fetch')).toBe(false);
  });
  it('keeps private assets isolated per generation', () => {
    expect(generationPath('owner', 'video', 'job-1', 'voice:0.wav')).not.toBe(generationPath('owner', 'video', 'job-2', 'voice:0.wav'));
  });
  it('rejects path traversal in saved assets', () => {
    expect(() => generationPath('owner', '../another', 'job', 'voice')).toThrow();
  });
});