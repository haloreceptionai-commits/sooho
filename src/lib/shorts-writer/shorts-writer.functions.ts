/** Authenticated wrappers: one Shorts Writer v4 AI step per request, so each call stays inside the gateway timeout. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Step = 'facts' | 'spine' | 'spineCheck' | 'hooks' | 'pickHook' | 'script' | 'critic' | 'rewrite' | 'verifyNumbers';
const STEPS = new Set<Step>(['facts', 'spine', 'spineCheck', 'hooks', 'pickHook', 'script', 'critic', 'rewrite', 'verifyNumbers']);

export const shortsWriterStep = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { step: Step; args: Record<string, unknown> }) => {
    if (!STEPS.has(d.step)) throw new Error("Unknown writer step");
    const deployment = d.args?.['deployment'];
    if (typeof deployment !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(deployment)) throw new Error("Invalid deployment name");
    if (JSON.stringify(d.args).length > 60000) throw new Error("Writer input too large");
    return d;
  })
  .handler(async ({ data }) => {
    const O = await import('./operations.server');
    const a = data.args as never;
    switch (data.step) {
      case 'facts': return O.factSheetOp(a);
      case 'spine': return O.spineOp(a);
      case 'spineCheck': return O.spineCheckOp(a);
      case 'hooks': return O.hooksOp(a);
      case 'pickHook': return O.pickHookOp(a);
      case 'script': return O.scriptOp(a);
      case 'critic': return O.criticOp(a);
      case 'rewrite': return O.rewriteLinesOp(a);
      case 'verifyNumbers': return O.verifyNumbersOp(a);
    }
  });

/** Off switch: Shorts use the new writer only when SHORTS_WRITER_V4 is "on" (owner approval gate). */
export const shortsWriterEnabled = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async () => process.env['SHORTS_WRITER_V4'] === 'on');
