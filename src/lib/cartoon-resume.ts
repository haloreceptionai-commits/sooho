import type { CartoonReview } from './cartoon-job';

export function canResumeApprovedCartoon(status: string, review: CartoonReview | undefined) {
  return status === 'failed' && review?.approved === true && /^[a-f0-9]{64}$/.test(review.hash);
}

export function verifiedCartoonLock(lock: { jobId?: string; hash?: string; requestHash?: string } | null, jobId: string, reviewHash: string, requestHash: string) {
  return Boolean(lock && lock.jobId === jobId && lock.hash === reviewHash && lock.requestHash === requestHash);
}