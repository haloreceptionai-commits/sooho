import { expect, it } from 'vitest';
import { canResumeApprovedCartoon, verifiedCartoonLock } from '@/lib/cartoon-resume';
const review = { hash: 'a'.repeat(64), storeId: 'cartoon-test', sheets: ['sheet'], voicePath: 'voice', alignmentPath: 'alignment', duration: 6, approved: true };
it('resumes only failed approved cartoons, never active, done, cancelled or unapproved ones', () => {
  expect(canResumeApprovedCartoon('failed', review)).toBe(true);
  for (const status of ['running', 'submitting', 'review', 'done', 'cancelled']) expect(canResumeApprovedCartoon(status, review)).toBe(false);
  expect(canResumeApprovedCartoon('failed', { ...review, approved: false })).toBe(false);
});
it('requires the original job, approval and canonical request hashes before reuse', () => {
  const lock = { jobId: 'job', hash: review.hash, requestHash: 'b'.repeat(64) };
  expect(verifiedCartoonLock(lock, 'job', review.hash, lock.requestHash)).toBe(true);
  expect(verifiedCartoonLock(lock, 'other', review.hash, lock.requestHash)).toBe(false);
  expect(verifiedCartoonLock(lock, 'job', 'c'.repeat(64), lock.requestHash)).toBe(false);
  expect(verifiedCartoonLock(lock, 'job', review.hash, 'c'.repeat(64))).toBe(false);
  expect(verifiedCartoonLock(null, 'job', review.hash, lock.requestHash)).toBe(false);
});