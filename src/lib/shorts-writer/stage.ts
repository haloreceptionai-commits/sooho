/** Shorts Writer v4 script stage shared by the browser pipeline, background coordinator and Script Writer page.
 * Writes the narration (facts -> spine -> hooks -> script -> critic), then the scene director splits it word for word. */
import type { Plan, PlanInput } from '@/lib/pipeline-operations.server';
import type { GateResult } from '@/lib/story-v2';
import { writeShort, type Progress, type WriterCalls, type WriterResult } from './orchestrate';

export interface V4Script { plan: Plan; gate: GateResult; report: { revealSec: number; shotMix: Record<string, number> }; judgeOk: boolean; hookType: string; moneyShot: string; writer: WriterResult }

export function v4Gate(w: WriterResult): GateResult {
  const c = w.critic;
  const blockers = [
    ...w.checks,
    ...c.lines.filter((l) => !(l.follows && l.clear && l.narration && l.new_fact)).map((l) => `Line ${l.n}: ${l.reason || 'weak line'}`),
    c.curiosity < 8 ? `Critic: curiosity ${c.curiosity}/10 (needs 8)` : '',
    c.clarity < 8 ? `Critic: clarity ${c.clarity}/10 (needs 8)` : '',
    c.hook_reveals_answer ? 'Critic: the hook gives the answer away' : '',
    c.ending_copies_hook ? 'Critic: the ending copies the hook' : '',
    !c.ending_makes_sense ? 'Critic: the ending does not make sense' : '',
    !c.real_twist ? 'Critic: no real twist' : '',
    c.coherence < 8 ? `Critic: coherence ${c.coherence}/10 (needs 8)` : '',
  ].filter(Boolean);
  return { score: Math.round(((c.coherence * 2 + c.clarity + c.curiosity) / 40) * 100), ready: w.ready, parts: { coherence: c.coherence, clarity: c.clarity, curiosity: c.curiosity }, blockers };
}

export async function runShortsV4(o: { calls: WriterCalls; durationSec: number; base: PlanInput; plan: (data: PlanInput) => Promise<Plan>; progress?: Progress | undefined; durable?: boolean }): Promise<V4Script> {
  const writer = await writeShort(o.calls, { durationSec: o.durationSec, progress: o.progress, ...(o.durable ? { serial: true, budgetMs: Infinity } : {}) });
  await o.progress?.('Splitting the approved narration into scenes…');
  const facts = writer.facts.filter((f) => f.certain).map((f) => `- ${f.text}`).join('\n');
  const { repair: _r, ...rest } = o.base; void _r;
  const plan = await o.plan({ ...rest, facts, hook: writer.hook, lockedNarration: writer.lines, shape: false });
  const total = plan.scenes.reduce((a, s) => a + s.narration.split(/\s+/).filter(Boolean).length, 0) || 1;
  let acc = 0, revealSec = 0;
  for (const s of plan.scenes) { if (!revealSec && /twist|payoff|reveal/i.test(s.beat)) revealSec = (acc / total) * o.durationSec; acc += s.narration.split(/\s+/).filter(Boolean).length; }
  const shotMix: Record<string, number> = {};
  for (const s of plan.scenes) shotMix[s.shot] = (shotMix[s.shot] ?? 0) + 1 / plan.scenes.length;
  const money = plan.scenes.find((s) => s.money && s.beat !== 'hook') ?? plan.scenes[0];
  return { plan, gate: v4Gate(writer), report: { revealSec, shotMix }, judgeOk: true, hookType: 'contradiction', moneyShot: money?.image_prompt ?? '', writer };
}

/** Owner's exact script: lines are final (never rewritten or judged). Only the scene director splits them, word for word. */
export function exactLines(script: string): string[] {
  return script.replace(/\r/g, "").split(/\n\s*\n|\n/).map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean);
}
export async function runExactScript(o: { script: string; durationSec: number; base: PlanInput; plan: (data: PlanInput) => Promise<Plan>; progress?: Progress | undefined }): Promise<Omit<V4Script, 'writer'> & { hook: string }> {
  const lines = exactLines(o.script);
  if (!lines.length) throw new Error('The script is empty.');
  await o.progress?.('Using your exact script · splitting it into scenes…');
  const { repair: _r, ...rest } = o.base; void _r;
  const plan = await o.plan({ ...rest, facts: '', hook: lines[0]!, lockedNarration: lines, shape: false });
  const shotMix: Record<string, number> = {};
  for (const s of plan.scenes) shotMix[s.shot] = (shotMix[s.shot] ?? 0) + 1 / plan.scenes.length;
  const money = plan.scenes.find((s) => s.money && s.beat !== 'hook') ?? plan.scenes[0];
  return { plan, gate: { score: 100, ready: true, parts: { owner: 100 }, blockers: [] }, report: { revealSec: 0, shotMix }, judgeOk: true, hookType: 'owner-script', moneyShot: money?.image_prompt ?? '', hook: lines[0]! };
}
/** Narration length for an exact script at the Shorts pace (~153 words per minute), clamped to Shorts limits. */
export const exactDuration = (script: string) => Math.max(15, Math.min(120, Math.round(script.split(/\s+/).filter(Boolean).length / 153 * 60)));
