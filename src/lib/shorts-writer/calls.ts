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

