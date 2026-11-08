import { describe, expect, it } from 'vitest';
import { cloudProgress, PROGRESS_STALE_MS } from '@/lib/video-progress';
import type { Video } from '@/lib/store';
const now = Date.parse('2026-11-08T21:45:00Z');
const video = { id: 'dragon', status: 'running', detail: 'Writing the beat sheet and script…', progress: 8 } as Video;
describe('cloud generation progress', () => {
  it('does not mark fresh work interrupted just because this browser did not start it', () => {
    expect(cloudProgress(video, new Date(now - 60_000).toISOString(), now)).toBe(video);
  });
  it('allows a full eight-minute long script call to keep running', () => {
    expect(cloudProgress(video, new Date(now - 8 * 60_000).toISOString(), now).status).toBe('running');
  });
  it('reports stale work without falsely asserting the page closed', () => {
    const result = cloudProgress(video, new Date(now - PROGRESS_STALE_MS - 1).toISOString(), now);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('No progress update received for 12 minutes. Check the original tab before retrying.');
  });
  it('leaves hosted assembly under service ownership regardless of age', () => {
    const hosted = { ...video, hostedRender: { id: 'job', status: 'running' } };
    expect(cloudProgress(hosted, '2026-11-08T20:00:00Z', now)).toBe(hosted);
  });
  it('does not mark a cloud-owned generation interrupted when its browser closes', () => {
    const background = { ...video, generationJob: { id: 'job', status: 'running' } };
    expect(cloudProgress(background, '2026-11-08T20:00:00Z', now)).toBe(background);
  });
  it('keeps checkpoints and offers resume for stale saved work', () => {
    const saved = { ...video, scriptCheckpoint: {} } as Video;
    const result = cloudProgress(saved, '2026-11-08T20:00:00Z', now);
    expect(result.scriptCheckpoint).toBe(saved.scriptCheckpoint);
    expect(result.detail).toBe('Saved · ready to resume');
  });
});