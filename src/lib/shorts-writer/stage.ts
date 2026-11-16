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
    c.hook_reveals_answer ? 'Critic: the hook gives the answer away' : '',
    c.ending_copies_hook ? 'Critic: the ending copies the hook' : '',
    !c.ending_makes_sense ? 'Critic: the ending does not make sense' : '',
    !c.real_twist ? 'Critic: no real twist' : '',
    c.coherence < 8 ? `Critic: coherence ${c.coherence}/10 (needs 8)` : '',
  ].filter(Boolean);
  return { score: Math.round(((c.coherence * 2 + c.clarity + c.curiosity) / 40) * 100), ready: w.ready, parts: { coherence: c.coherence, clarity: c.clarity, curiosity: c.curiosity }, blockers };
}

export async function runShortsV4(o: { calls: WriterCalls; durationSec: number; base: PlanInput; plan: (data: PlanInput) => Promise<Plan>; progress?: Progress }): Promise<V4Script> {
  const writer = await writeShort(o.calls, { durationSec: o.durationSec, progress: o.progress });
  await o.progress?.('Splitting the approved narration into scenes…');
  const facts = writer.facts.filter((f) => f.certain).map((f) => `- ${f.text}`).join('\n');
  const plan = await o.plan({ ...o.base, facts, hook: writer.hook, lockedNarration: writer.lines, repair: undefined, shape: false });
  const total = plan.scenes.reduce((a, s) => a + s.narration.split(/\s+/).filter(Boolean).length, 0) || 1;
  let acc = 0, revealSec = 0;
  for (const s of plan.scenes) { if (!revealSec && /twist|payoff|reveal/i.test(s.beat)) revealSec = (acc / total) * o.durationSec; acc += s.narration.split(/\s+/).filter(Boolean).length; }
  const shotMix: Record<string, number> = {};
  for (const s of plan.scenes) shotMix[s.shot] = (shotMix[s.shot] ?? 0) + 1 / plan.scenes.length;
  const money = plan.scenes.find((s) => s.money && s.beat !== 'hook') ?? plan.scenes[0];
  return { plan, gate: v4Gate(writer), report: { revealSec, shotMix }, judgeOk: true, hookType: 'contradiction', moneyShot: money?.image_prompt ?? '', writer };
}
