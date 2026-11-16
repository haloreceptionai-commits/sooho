import type { StepRunner } from './calls';

/** Server-side runner calling operations directly (background coordinator, proofs). */
export const directRunner: StepRunner = async (step, args) => {
  const O = await import('./operations.server');
  const a = args as never;
  const map: Record<string, (x: never) => Promise<unknown>> = { facts: O.factSheetOp, spine: O.spineOp, spineCheck: O.spineCheckOp, hooks: O.hooksOp, pickHook: O.pickHookOp, script: O.scriptOp, critic: O.criticOp, rewrite: O.rewriteLinesOp, verifyNumbers: O.verifyNumbersOp };
  const fn = map[step];
  if (!fn) throw new Error(`Unknown writer step ${step}`);
  return fn(a);
};
