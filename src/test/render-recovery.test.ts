import { describe, expect, it } from 'vitest';
import { decideRecovery, type Observation } from '@/lib/render-recovery';

const now = Date.parse('2026-11-09T05:00:00Z');
const min = 60_000;
const base: Observation = { mode: 'finish', exec: { status: 'Running', startMs: now - 10 * min }, unconfirmed: false, heartbeatMs: now - 1 * min, nowMs: now, wroteSinceStart: true, parts: 0, verifiedCompletion: false, recovery: {} };

describe('cartoon render watchdog', () => {
  it('leaves a working machine alone', () => {
    expect(decideRecovery(base).action).toBe('wait');
  });
  it('stops a machine with no heartbeat for over 20 minutes', () => {
    expect(decideRecovery({ ...base, exec: { status: 'Running', startMs: now - 40 * min }, heartbeatMs: now - 21 * min }).action).toBe('stop');
  });
  it('restarts a machine that failed before doing any work (the stuck "Measured Earth" case)', () => {
    expect(decideRecovery({ ...base, exec: { status: 'Failed', startMs: now - 15 * min }, heartbeatMs: now - 15 * min, wroteSinceStart: false }).action).toBe('restart');
  });
  it('gives up after 3 machines that never started, with a clear message', () => {
    const d = decideRecovery({ ...base, exec: { status: 'Failed', startMs: now - 15 * min }, heartbeatMs: now - 15 * min, wroteSinceStart: false, recovery: { attempts: 3 } });
    expect(d.action).toBe('fail');
  });
  it('keeps continuing a crashed full render while it saves new frames, up to 6 restarts', () => {
    const crashed = { ...base, exec: { status: 'Failed', startMs: now - 30 * min }, heartbeatMs: now - 10 * min, parts: 20 };
    expect(decideRecovery({ ...crashed, recovery: { attempts: 5, lastParts: 10 } }).action).toBe('restart');
    expect(decideRecovery({ ...crashed, recovery: { attempts: 6, lastParts: 10 } }).action).toBe('fail');
  });
  it('allows only 2 restarts when a crashed render made no new progress', () => {
    const crashed = { ...base, exec: { status: 'Failed', startMs: now - 30 * min }, heartbeatMs: now - 10 * min, parts: 10 };
    expect(decideRecovery({ ...crashed, recovery: { attempts: 1, lastParts: 10 } }).action).toBe('restart');
    expect(decideRecovery({ ...crashed, recovery: { attempts: 2, lastParts: 10 } }).action).toBe('fail');
  });
  it('completes a finished video whose report never arrived', () => {
    expect(decideRecovery({ ...base, exec: { status: 'Succeeded', startMs: now - 30 * min }, heartbeatMs: now - 10 * min, verifiedCompletion: true }).action).toBe('complete');
  });
  it('waits for a recent unconfirmed start, then restarts when Azure has none', () => {
    const pending = { ...base, exec: null, unconfirmed: true, recovery: { claimedAt: now - 1 * min } };
    expect(decideRecovery(pending).action).toBe('wait');
    expect(decideRecovery({ ...pending, heartbeatMs: now - 10 * min, recovery: { claimedAt: now - 10 * min } }).action).toBe('restart');
  });
  it('adopts the execution Azure confirms for an unconfirmed start instead of starting another', () => {
    expect(decideRecovery({ ...base, unconfirmed: true }).action).toBe('adopt');
  });
});
