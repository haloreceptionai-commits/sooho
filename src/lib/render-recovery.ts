// Pure decisions for the cartoon render watchdog. Azure is the source of truth for whether a machine is
// still working; the worker's saved files tell us whether anything was spent and whether a retry made progress.

export type RenderMode = 'preflight' | 'finish';
export interface Recovery { attempts?: number; lastParts?: number; claimedAt?: number; inputKey?: string }
export interface Observation {
  mode: RenderMode;
  /** Azure execution for this job and stage: the one given the requested input, else the newest. Null when none exists. */
  exec: { status: string; startMs: number } | null;
  /** True while the tracked run id is not yet confirmed (a start was requested but not recorded). */
  unconfirmed: boolean;
  /** Last time the worker reported in (render_jobs.updated_at). */
  heartbeatMs: number;
  nowMs: number;
  wroteSinceStart: boolean;
  parts: number;
  /** A finished output is checkpointed and the private file is verified. */
  verifiedCompletion: boolean;
  recovery: Recovery;
}
export type Decision =
  | { action: 'wait'; why: string }
  | { action: 'adopt'; why: string }
  | { action: 'complete'; why: string }
  | { action: 'stop'; why: string }
  | { action: 'restart'; why: string }
  | { action: 'fail'; why: string; message: string };

export const HEARTBEAT_STALE_MS = 20 * 60_000;
export const START_GRACE_MS = 4 * 60_000;
/** Restarts allowed: machines that never ran cost nothing; a crashed full render may keep going while it saves new frames. */
export const LIMITS = { neverStarted: 3, crashed: 2, progressing: 6 } as const;

const RUNNING = new Set(['Running', 'Processing']);
const ENDED = new Set(['Failed', 'Stopped', 'Degraded', 'Succeeded']);

export function decideRecovery(o: Observation): Decision {
  const attempts = o.recovery.attempts ?? 0;
  const e = o.exec;
  if (o.verifiedCompletion && o.mode === 'finish' && !(e && RUNNING.has(e.status))) return { action: 'complete', why: 'finished output is saved and checkpointed' };
  if (!e) {
    if (o.nowMs - Math.max(o.recovery.claimedAt ?? 0, o.heartbeatMs) < START_GRACE_MS) return { action: 'wait', why: 'start requested recently' };
    if (attempts >= LIMITS.neverStarted) return fail('Azure never started the render machines. Nothing was spent — press Resume or Retry.');
    return { action: 'restart', why: 'Azure has no execution for the requested start' };
  }
  if (o.unconfirmed) return { action: 'adopt', why: 'Azure confirms the requested start' };
  if (RUNNING.has(e.status)) {
    if (o.nowMs - Math.max(o.heartbeatMs, e.startMs) > HEARTBEAT_STALE_MS) return { action: 'stop', why: 'no heartbeat for 20 minutes' };
    return { action: 'wait', why: 'machine is working' };
  }
  if (!ENDED.has(e.status)) return { action: 'wait', why: `Azure status ${e.status}` };
  // Result reports normally arrive just before the execution ends; give them a moment.
  if (e.status === 'Succeeded' && o.nowMs - o.heartbeatMs < START_GRACE_MS) return { action: 'wait', why: 'result report may still be arriving' };
  if (!o.wroteSinceStart) return attempts < LIMITS.neverStarted ? { action: 'restart', why: 'machine stopped before doing any work' } : fail('Azure render machines kept failing to start. Nothing was spent — press Resume or Retry.');
  const progressed = o.mode === 'finish' && o.parts > (o.recovery.lastParts ?? 0);
  if (attempts < (progressed ? LIMITS.progressing : LIMITS.crashed)) return { action: 'restart', why: progressed ? 'machine stopped after saving new frames' : 'machine stopped mid-render' };
  return fail(o.mode === 'finish'
    ? 'The full render stopped repeatedly without new progress. Saved frames are kept — press Resume render.'
    : 'The cartoon preview stopped repeatedly. Your script and voice are saved — press Resume.');
}

function fail(message: string): Decision { return { action: 'fail', why: message, message }; }
