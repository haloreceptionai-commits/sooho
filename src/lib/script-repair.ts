import type { Hook, Plan } from '@/lib/pipeline.functions';
import { hookIssues, hookTextIssues, sceneStarts, wc, type Anchors, type GateResult } from '@/lib/story-v2';
import { advancedOpeningIssues, ADVANCED_STORY_DIRECTION } from './advanced-story';
import { STORY_SHAPE_DIRECTION, hookShapeIssues } from './story-shape';

/** Invalid hooks are ineligible, regardless of the model's self-rated score. */
export function eligibleHooks(hooks: Hook[], anchors: Anchors, facts: string, advanced = false, shape = false): Hook[] {
  const ok = hooks.filter(h => !(advanced ? [...hookIssues(h.line, undefined, facts).filter(x => !x.startsWith('Hook is') && !x.includes('unanswerable')), ...advancedOpeningIssues(h.line, anchors.subject)] : hookIssues(h.line, anchors, facts)).length && !hookTextIssues(h.text, h.line).length);
  // Shape v3: prefer contradiction hooks; fall back to the older eligible set rather than stopping.
  const shaped = shape ? ok.filter(h => !hookShapeIssues(h.line).length) : ok;
  return shaped.length ? shaped : ok;
}

const PRONOUN = /^(["']?)(He|She|They|His|Her|Their)\b/;

/**
 * Deterministic mechanical fixes the writer model keeps missing; never changes facts.
 * - A sentence opening with he/she/his/her whose previous sentence names nobody gets the hero's name.
 * - Exact duplicate sentences are dropped.
 * - The "main" loop is closed in the reveal (or the scene nearest 70% of the words) when the label is misplaced.
 */
export function autoFixPlan(plan: Plan, advanced = false): Plan {
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
      if (m && hero && !advanced && !names.some(n => prev.toLowerCase().includes(n))) {
        const p = m[2] ?? '';
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
  if (!advanced && (closeAt < 0 || pos(closeAt) < 0.6 || pos(closeAt) > 0.8)) {
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

/** A shorter draft must not replace an understandable story with a broken opening/mechanism. */
export function preferAdvancedRepair(current: GateResult, next: GateResult): boolean {
  const protectedFailures = (g: GateResult) => g.blockers.filter(b => /opening|first three|real subject|confusing|read-aloud|swipe away|not answered|cause|physical step/i.test(b)).length;
  if (protectedFailures(next) !== protectedFailures(current)) return protectedFailures(next) < protectedFailures(current);
  return preferRepair(current, next);
}

/** Preserve the actual scene/cast/loop state, not just narration, for actionable repairs. */
export function repairBrief(plan: Plan, gate: GateResult, anchors: Anchors, opts: { loop?: boolean; advanced?: boolean; shape?: boolean } = {}): string {
  const starts = sceneStarts(plan.scenes);
  const words = wc(plan.scenes.map(s => s.narration).join(' '));
  if (opts.shape) return `${opts.advanced ? `${ADVANCED_STORY_DIRECTION}\n` : ''}${STORY_SHAPE_DIRECTION}\nREPAIR: fix every failed check below with a structural rewrite in the gold shape (not word swaps). Keep the checked facts, cast identities and literal visuals. Say "${anchors.subject}" in the first 8 words. Set script to the exact concatenation of the scene narrations.\nFailed checks:\n${gate.blockers.map(b => `- ${b}`).join('\n')}\nCurrent words: ${words}.\nPrevious COMPLETE plan:\n${JSON.stringify(plan)}`;
  const heroCount = plan.scenes.filter(s => s.characters.includes(plan.hero.name)).length;
  if (opts.advanced) return `${ADVANCED_STORY_DIRECTION}\nFix the actual failed checks, not legacy hero/date/myth quotas:\n${gate.blockers.join('\n')}\nChecked anchors: ${JSON.stringify(anchors)}\nCurrent words: ${words}. Keep all facts, uncertainty, cast identities and literal visual meaning. Rewrite a confusing paragraph as a whole, not individual word swaps.\nPrevious COMPLETE plan:\n${JSON.stringify(plan)}`;
  return `Fix ALL failures below. Rewrite the opening or rearrange scenes when needed; do not preserve broken lines or a broken hook. Never invent events to satisfy a beat. Keep uncertainty from the checked facts.
${gate.blockers.map(b => `- ${b}`).join('\n')}
Required spoken anchors: ${JSON.stringify(anchors)}.
${opts.loop ? `LOOP SHORT CONTRACT (mandatory): first sentence max 8 words with "${anchors.subject}" and a surprise; one short question ending "?" by word 13; every later sentence is a new surprise with the hero acting; the last sentence answers the question as a twist that flows back into the first line. Say "${anchors.place}" once, simply. No date in the first sentence.
` : `OPENING REWRITE CONTRACT (mandatory, measured on scene narration, not the separate script field):
- First sentence: 8-12 words; literally say "${anchors.subject}" in its first 8 words and include "${anchors.place}" or "${anchors.year}". Do not open with a date. The preferred hook is NOT locked during repairs.
- By word 20: literally say "${anchors.stakes}", "${anchors.year}" and "${anchors.place}" as well as the subject. Combine the date/place/stakes into the hook when possible; omit ornamental scene-description lines.
- Start a plain question about "${anchors.subject}" by word 20, max 12 words. Only one question starts before word 39.
- By word 26: say "${plan.hero.name} wants/needs/must ...". By word 38: say "${anchors.org}". Put this before tries or ornamental descriptions.
- Set script to the exact concatenation of the scene narrations; calculate all timings from those words, not guessed beat times.
`}Current word count: ${words}. Hero scenes: ${heroCount}/${plan.scenes.length}; need at least ${Math.ceil(plan.scenes.length * 0.6)}.
Wide/aerial scenes: need at least ${Math.ceil(plan.scenes.length * 0.4)}; change BOTH shot and image_prompt, never relabel a close-up.
Close main in a scene starting between words ${Math.ceil(words * 0.65)} and ${Math.floor(words * 0.75)}. Recalculate after editing.
Use plain replacements: pendulum -> hanging weight, effectiveness -> how well it works, replicas -> copies, researchers -> people who study it. A necessary technical subject anchor may stay, explained simply.
Previous COMPLETE plan (indexes are zero-based; fix visuals and characters at the cited scene indexes as well as narration):
${JSON.stringify({ ...plan, sceneAudit: plan.scenes.map((s, i) => ({ index: i, startSec: Number((starts[i] ?? 0).toFixed(2)), words: wc(s.narration) })) })}`;
}