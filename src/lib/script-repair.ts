import type { Hook, Plan } from '@/lib/pipeline.functions';
import { hookIssues, hookTextIssues, sceneStarts, wc, type Anchors, type GateResult } from '@/lib/story-v2';

/** Invalid hooks are ineligible, regardless of the model's self-rated score. */
export function eligibleHooks(hooks: Hook[], anchors: Anchors, facts: string): Hook[] {
  return hooks.filter(h => !hookIssues(h.line, anchors, facts).length && !hookTextIssues(h.text, h.line).length);
}

/** Readiness wins over scores; fewer blocking failures wins among unfinished drafts. */
export function preferRepair(current: GateResult, next: GateResult): boolean {
  if (current.ready !== next.ready) return next.ready;
  if (current.blockers.length !== next.blockers.length) return next.blockers.length < current.blockers.length;
  return next.score >= current.score;
}

/** Preserve the actual scene/cast/loop state, not just narration, for actionable repairs. */
export function repairBrief(plan: Plan, gate: GateResult, anchors: Anchors): string {
  const starts = sceneStarts(plan.scenes);
  const words = wc(plan.scenes.map(s => s.narration).join(' '));
  const heroCount = plan.scenes.filter(s => s.characters.includes(plan.hero.name)).length;
  return `Fix ALL failures below. Rewrite the opening or rearrange scenes when needed; do not preserve broken lines or a broken hook. Never invent events to satisfy a beat. Keep uncertainty from the checked facts.
${gate.blockers.map(b => `- ${b}`).join('\n')}
Required spoken anchors: ${JSON.stringify(anchors)}.
OPENING REWRITE CONTRACT (mandatory, measured on scene narration, not the separate script field):
- First sentence: 8-12 words; literally say "${anchors.subject}" in its first 8 words and include "${anchors.place}" or "${anchors.year}". Do not open with a date. The preferred hook is NOT locked during repairs.
- By word 20: literally say "${anchors.stakes}", "${anchors.year}" and "${anchors.place}" as well as the subject. Combine the date/place/stakes into the hook when possible; omit ornamental scene-description lines.
- Start a plain question about "${anchors.subject}" by word 20, max 12 words. Only one question starts before word 39.
- By word 26: say "${plan.hero.name} wants/needs/must ...". By word 38: say "${anchors.org}". Put this before tries or ornamental descriptions.
- Set script to the exact concatenation of the scene narrations; calculate all timings from those words, not guessed beat times.
Current word count: ${words}. Hero scenes: ${heroCount}/${plan.scenes.length}; need at least ${Math.ceil(plan.scenes.length * 0.6)}.
Wide/aerial scenes: need at least ${Math.ceil(plan.scenes.length * 0.4)}; change BOTH shot and image_prompt, never relabel a close-up.
Close main in a scene starting between words ${Math.ceil(words * 0.65)} and ${Math.floor(words * 0.75)}. Recalculate after editing.
Use plain replacements: pendulum -> hanging weight, effectiveness -> how well it works, replicas -> copies, researchers -> people who study it. A necessary technical subject anchor may stay, explained simply.
Previous COMPLETE plan (indexes are zero-based; fix visuals and characters at the cited scene indexes as well as narration):
${JSON.stringify({ ...plan, sceneAudit: plan.scenes.map((s, i) => ({ index: i, startSec: Number((starts[i] ?? 0).toFixed(2)), words: wc(s.narration) })) })}`;
}