// Pure decisions for the cartoon render watchdog. Azure is the source of truth for whether a machine is
// still working; the worker's saved files tell us whether anything was spent and whether a retry made progress.

export type RenderMode = 'preflight' | 'finish';
export interface Recovery { attempts?: number; lastParts?: number; claimedAt?: number; inputKey?: string; mode?: RenderMode }
export interface Observation {
  mode: RenderMode;
  /** Newest Azure execution for this job and stage, or null when Azure has none. */
  exec: { status: string; startMs: number; inputKey: string } | null;
  /** Last time the worker reported in (render_jobs.updated_at). */
  heartbeatMs: number;
  nowMs: number;
  wroteSinceStart: boolean;
  parts: number;
  pendingCompletion: boolean;
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

const ENDED = new Set(['Failed', 'Stopped', 'Degraded']);

export function decideRecovery(o: Observation): Decision {
  const attempts = o.recovery.attempts ?? 0;
  const claimed = o.recovery.claimedAt ?? 0;
  // A start we requested has no matching Azure execution yet.
  const current = o.exec && (!o.recovery.inputKey || o.exec.inputKey === o.recovery.inputKey || o.exec.startMs >= claimed - 60_000) ? o.exec : null;
  if (!current) {
    if (o.pendingCompletion && o.mode === 'finish') return { action: 'complete', why: 'finished output is checkpointed' };
    if (o.nowMs - Math.max(claimed, o.heartbeatMs) < START_GRACE_MS) return { action: 'wait', why: 'start requested recently' };
    if (attempts >= LIMITS.neverStarted) return fail('Azure never started the render machines. Nothing was spent — press Resume or Retry.');
    return { action: 'restart', why: 'Azure has no execution for the requested start' };
  }
  if (o.recovery.inputKey && current.inputKey === o.recovery.inputKey && o.exec !== null && claimed && !o.recovery.mode) return { action: 'adopt', why: 'execution matches requested start' };
  if (current.status === 'Running' || current.status === 'Processing') {
    if (o.nowMs - Math.max(o.heartbeatMs, current.startMs) > HEARTBEAT_STALE_MS) return { action: 'stop', why: 'no heartbeat for 20 minutes' };
    return { action: 'wait', why: 'machine is working' };
  }
  if (o.pendingCompletion && o.mode === 'finish') return { action: 'complete', why: 'finished output is checkpointed' };
  if (current.status === 'Succeeded') {
    // Preview/finish callbacks normally arrive before the execution ends; give them a moment.
    if (o.nowMs - o.heartbeatMs < START_GRACE_MS) return { action: 'wait', why: 'result report may still be arriving' };
  } else if (!ENDED.has(current.status)) return { action: 'wait', why: `Azure status ${current.status}` };
  if (!o.wroteSinceStart) return attempts < LIMITS.neverStarted ? { action: 'restart', why: 'machine stopped before doing any work' } : fail('Azure render machines kept failing to start. Nothing was spent — press Resume or Retry.');
  const progressed = o.mode === 'finish' && o.parts > (o.recovery.lastParts ?? 0);
  const limit = progressed ? LIMITS.progressing : LIMITS.crashed;
  if (attempts < limit) return { action: 'restart', why: progressed ? 'machine stopped after saving new frames' : 'machine stopped mid-render' };
  return fail(o.mode === 'finish'
    ? 'The full render stopped repeatedly without new progress. Saved frames are kept — press Resume render.'
    : 'The cartoon preview stopped repeatedly. Your script and voice are saved — press Resume.');
}

function fail(message: string): Decision { return { action: 'fail', why: message, message }; }
