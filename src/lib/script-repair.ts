import type { Hook, Plan } from '@/lib/pipeline.functions';
import { hookIssues, hookTextIssues, sceneStarts, wc, type Anchors, type GateResult } from '@/lib/story-v2';

/** Invalid hooks are ineligible, regardless of the model's self-rated score. */
export function eligibleHooks(hooks: Hook[], anchors: Anchors, facts: string): Hook[] {
  return hooks.filter(h => !hookIssues(h.line, anchors, facts).length && !hookTextIssues(h.text, h.line).length);
}

const PRONOUN = /^(["']?)(He|She|They|His|Her|Their)\b/;

/**
 * Deterministic mechanical fixes the writer model keeps missing; never changes facts.
 * - A sentence opening with he/she/his/her whose previous sentence names nobody gets the hero's name.
 * - Exact duplicate sentences are dropped.
 * - The "main" loop is closed in the reveal (or the scene nearest 70% of the words) when the label is misplaced.
 */
export function autoFixPlan(plan: Plan): Plan {
  const hero = plan.hero?.name?.trim();
  const names = [hero, ...plan.characters.map(c => c.name)].filter((n): n is string => !!n).flatMap(n => n.toLowerCase().split(/\s+/)).filter(w => w.length > 2);
  let prev = '';
  const seen = new Set<string>();
  const scenes = plan.scenes.map(sc => {
    const out: string[] = [];
    for (const raw of sc.narration.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) ?? [sc.narration]) {
      let s = raw.trim();
      if (!s) continue;
      const key = s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      if (key.split(' ').length >= 3 && seen.has(key)) continue;
      seen.add(key);
      const m = PRONOUN.exec(s);
      if (m && hero && !names.some(n => prev.toLowerCase().includes(n))) {
        const p = m[2]!;
        const rep = /^(His|Her|Their)$/.test(p) ? `${hero}'s` : p === 'They' ? `${hero} and the team` : hero;
        if (p !== 'Her' || !/^\s*(\w+)\s+(is|was|runs|looks)/.test(s.slice(m[0].length))) s = m[1] + rep + s.slice(m[0].length);
      }
      out.push(s); prev = s;
    }
    return { ...sc, narration: out.join(' ') || sc.narration };
  });
  const offsets: number[] = []; let acc = 0;
  for (const s of scenes) { offsets.push(acc); acc += wc(s.narration); }
  const pos = (i: number) => (offsets[i] ?? 0) / Math.max(1, acc);
  const closeAt = scenes.findIndex(s => /\bmain\b/.test(s.loop_closed));
  if (closeAt < 0 || pos(closeAt) < 0.6 || pos(closeAt) > 0.8) {
    const cand = scenes.map((s, i) => ({ i, d: Math.abs(pos(i) - 0.7) + (s.beat === 'reveal' ? -0.05 : 0) })).filter(c => pos(c.i) >= 0.6 && pos(c.i) <= 0.8).sort((a, b) => a.d - b.d)[0];
    if (cand) scenes.forEach((s, i) => {
      const ids = s.loop_closed.split(/[,\s]+/).filter(x => x && x !== 'main');
      s.loop_closed = (i === cand.i ? [...ids, 'main'] : ids).join(',');
    });
  }
  return { ...plan, scenes, script: scenes.map(s => s.narration).join(' ') };
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