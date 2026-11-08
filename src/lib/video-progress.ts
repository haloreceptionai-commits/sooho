import type { Video } from '@/lib/store';

// Long script calls can run for eight minutes; silence alone is not proof a tab closed.
export const PROGRESS_STALE_MS = 12 * 60_000;
export function cloudProgress(video: Video, updatedAt: string, now = Date.now()): Video {
  if (video.status !== 'running' || video.hostedRender) return video;
  const updated = Date.parse(updatedAt);
  if (!Number.isFinite(updated) || now - updated <= PROGRESS_STALE_MS) return video;
  const saved = !!(video.seedanceCheckpoint || video.scriptCheckpoint || video.cartoonCheckpoint || video.assemblyCheckpoint);
  return { ...video, status: 'failed', detail: saved ? 'Saved · ready to resume' : 'No recent progress', error: saved ? 'No progress update received for 12 minutes. Saved inputs are safe. Check the original tab before resuming.' : 'No progress update received for 12 minutes. Check the original tab before retrying.' };
}