/** Builds WriterCalls from any single-step runner (browser server fn, or direct server-side operation). */
import type { WriterCalls } from './orchestrate';

export type StepRunner = (step: string, args: Record<string, unknown>) => Promise<unknown>;

export function writerCalls(run: StepRunner, d: { topic: string; deployment: string; durationSec: number; kid?: boolean; research?: string }): WriterCalls {
  const { topic, deployment, durationSec, kid } = d;
  const r = <T,>(step: string, args: Record<string, unknown>) => run(step, { deployment, ...args }) as Promise<T>;
  return {
    facts: () => r('facts', { topic, research: d.research }),
    spine: (facts, avoid) => r('spine', { topic, facts, avoid }),
    spineCheck: (spine, facts) => r('spineCheck', { spine, facts }),
    hooks: (facts, spine, feedback) => r('hooks', { topic, facts, spine, feedback }),
    pickHook: (hooks, spine) => r('pickHook', { hooks, spine }),
    script: (facts, spine, hook) => r('script', { topic, facts, spine, hook, durationSec, kid }),
    critic: (lines, facts) => r('critic', { lines, facts, durationSec }),
    rewrite: (lines, flagged, problems, facts, spine) => r('rewrite', { lines, flagged, problems, facts, spine, durationSec, kid }),
  };
}

/** Server-side runner calling operations directly (background coordinator, proofs). */
export const directRunner: StepRunner = async (step, args) => {
  const O = await import('./operations.server');
  const a = args as never;
  const map: Record<string, (x: never) => Promise<unknown>> = { facts: O.factSheetOp, spine: O.spineOp, spineCheck: O.spineCheckOp, hooks: O.hooksOp, pickHook: O.pickHookOp, script: O.scriptOp, critic: O.criticOp, rewrite: O.rewriteLinesOp };
  const fn = map[step];
  if (!fn) throw new Error(`Unknown writer step ${step}`);
  return fn(a);
};
