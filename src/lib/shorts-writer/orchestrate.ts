/** Shorts Writer v4 step order, retries and spine restart. Calls are injected so the browser pipeline,
 * the background coordinator, the Script Writer page and tests share one flow. */
import { criticPasses, flaggedLines, hookIssues, needsNewSpine, scriptIssues, type Critic, type Fact } from './checks';
import type { HookCandidate, Spine } from './operations.server';

export interface WriterCalls {
  facts(): Promise<Fact[]>;
  spine(facts: Fact[], avoid: Spine[]): Promise<Spine>;
  spineCheck(spine: Spine, facts: Fact[]): Promise<{ ok: boolean; broken_links: string[]; unsupported: string[] }>;
  hooks(facts: Fact[], spine: Spine, feedback?: string): Promise<HookCandidate[]>;
  pickHook(hooks: string[], spine: Spine): Promise<{ index: number; reason: string }>;
  script(facts: Fact[], spine: Spine, hook: string): Promise<{ lines: string[] }>;
  critic(lines: string[], facts: Fact[]): Promise<Critic>;
  rewrite(lines: string[], flagged: { n: number; reason: string }[], problems: string[], facts: Fact[], spine: Spine): Promise<{ lines: { n: number; text: string }[] }>;
}

export interface WriterRound { spine: Spine; spineCheck: { ok: boolean; broken_links: string[]; unsupported: string[] }; hooks: HookCandidate[]; hook: string; hookReason: string; drafts: { lines: string[]; critic: Critic; checks: string[] }[] }
export interface WriterResult { facts: Fact[]; rounds: WriterRound[]; lines: string[]; critic: Critic; checks: string[]; ready: boolean; hook: string; spine: Spine }

export type Progress = (detail: string) => void | Promise<void>;

const clean = (l: string) => l.replace(/\s+/g, ' ').trim();

export function applyRewrite(lines: string[], fixes: { n: number; text: string }[], allowed: number[]): string[] {
  const ok = new Set(allowed.filter((n) => n > 1));
  const next = [...lines];
  for (const f of fixes) if (ok.has(f.n) && f.n <= next.length) next[f.n - 1] = clean(f.text);
  return next.filter((l, i) => i === 0 || l.length > 0);
}

/** Lines a hard check points at, so the patch pass can fix them without touching the rest. */
function checkTargets(lines: string[], checks: string[]): { n: number; reason: string }[] {
  const out: { n: number; reason: string }[] = [];
  for (const c of checks) {
    const m = c.match(/^(names|dates\/numbers) not in the certain facts: (.+)$/);
    if (m) {
      const bad = m[2]!.split(', ');
      lines.forEach((l, i) => { if (i > 0 && bad.some((b) => l.includes(b))) out.push({ n: i + 1, reason: `${c}; use only certain facts or say it generically` }); });
    }
    const rep = c.match(/^line (\d+) repeats/);
    if (rep) out.push({ n: Number(rep[1]), reason: c });
  }
  return out;
}

export async function writeShort(calls: WriterCalls, opts: { durationSec: number; maxPatches?: number; maxSpines?: number; budgetMs?: number; progress?: Progress | undefined }): Promise<WriterResult> {
  // Speed: the whole script must be ready in under ~2 minutes, so extra passes only start while time remains.
  const maxPatches = opts.maxPatches ?? 2, maxSpines = opts.maxSpines ?? 2, budget = opts.budgetMs ?? 105_000, t0 = Date.now();
  const left = () => budget - (Date.now() - t0);
  const say = async (t: string) => { await opts.progress?.(t); };
  await say('Building the fact sheet…');
  const facts = await calls.facts();
  if (facts.filter((f) => f.certain).length < 4) throw new Error('Too few certain facts for this topic. Pick a better-documented story.');
  const rounds: WriterRound[] = [];
  let best: WriterResult | null = null;
  for (let s = 0; s < maxSpines; s++) {
    await say(s ? 'Coherence below 8 — planning a different story spine…' : 'Planning the story spine…');
    let spine = await calls.spine(facts, rounds.map((r) => r.spine));
    await say('Writing 10 hooks…');
    // Spine check runs alongside the hooks instead of before them.
    const [sc0, hooks0] = await Promise.all([calls.spineCheck(spine, facts), calls.hooks(facts, spine)]);
    const sc = sc0; let hooks = hooks0;
    let valid = hooks.filter((h) => !h.reveals_answer && !hookIssues(h.line).length);
    if (!valid.length) {
      const fb = `Previous hooks failed: ${hooks.slice(0, 5).map((h) => `"${h.line}" (${[...hookIssues(h.line), h.reveals_answer ? 'reveals the answer' : ''].filter(Boolean).join('; ')})`).join(' / ')}. Write 10 new ones that pass.`;
      hooks = [...hooks, ...await calls.hooks(facts, spine, fb)];
      valid = hooks.filter((h) => !h.reveals_answer && !hookIssues(h.line).length);
    }
    if (!valid.length) throw new Error('No hook passed after two drafts. No voice or pictures were started.');
    const pick = await calls.pickHook(valid.map((h) => h.line), spine);
    const hook = clean(valid[Math.min(valid.length - 1, Math.max(0, Math.round(pick.index)))]!.line);
    const round: WriterRound = { spine, spineCheck: sc, hooks, hook, hookReason: pick.reason, drafts: [] };
    rounds.push(round);
    await say('Writing the narration…');
    let lines = (await calls.script(facts, spine, hook)).lines.map(clean).filter(Boolean);
    if (clean(lines[0] ?? '') !== hook) lines = [hook, ...lines.filter((l) => clean(l) !== hook)];
    for (let p = 0; ; p++) {
      await say(p ? `Critic review after fix ${p}/${maxPatches}…` : 'Critic reading it as a viewer…');
      const critic = await calls.critic(lines, facts);
      round.drafts.push({ lines, critic, checks: scriptIssues(lines, facts, opts.durationSec) });
      const cur = round.drafts[round.drafts.length - 1]!;
      const ready = criticPasses(critic) && !cur.checks.length;
      const result: WriterResult = { facts, rounds, lines, critic, checks: cur.checks, ready, hook, spine };
      if (!best || rank(result) > rank(best)) best = result;
      if (ready) return result;
      if (p >= maxPatches || left() < 35_000) break;
      const flagged = flaggedLines(critic).map((n) => ({ n, reason: critic.lines.find((l) => l.n === n)?.reason || 'a viewer would lose interest here; add stakes or a turn' }));
      const targets = [...flagged, ...checkTargets(lines, cur.checks).filter((t) => !flagged.some((f) => f.n === t.n))];
      const problems = [...cur.checks, critic.ending_copies_hook ? 'The last line copies the hook; reframe the theme in new words.' : '', !critic.ending_makes_sense ? 'The ending does not make sense.' : '', !critic.real_twist ? 'The story has no real twist; make the assumption flip clear.' : '', critic.hook_reveals_answer ? 'The hook reveals the answer (it is locked, so hide the mechanism until the twist).' : ''].filter(Boolean);
      if (critic.ending_copies_hook || !critic.ending_makes_sense) { const n = lines.length; if (!targets.some((t) => t.n === n)) targets.push({ n, reason: 'closing line: reframe in new words' }); }
      if (!critic.real_twist) { const a = Math.max(2, Math.round(lines.length * 0.6)), b = Math.min(lines.length - 1, Math.round(lines.length * 0.8)); for (let n = a; n <= b; n++) if (!targets.some((t) => t.n === n)) targets.push({ n, reason: `twist zone: make this flip land plainly: ${spine.twist}` }); }
      if (!targets.length && cur.checks.some((c) => c.startsWith('word count') || c.includes(' lines (needs'))) lines.forEach((_, i) => { if (i > 0) targets.push({ n: i + 1, reason: cur.checks.join('; ') }); });
      if (!targets.length) break;
      await say(`Rewriting ${targets.length} weak line${targets.length === 1 ? '' : 's'}…`);
      const fix = await calls.rewrite(lines, targets, problems, facts, spine);
      lines = applyRewrite(lines, fix.lines, targets.map((t) => t.n));
    }
    if (best && (!needsNewSpine(best.critic) || left() < 80_000)) break;
  }
  return best!;
}

/** Ready first, then fewer hard-check failures, then coherence, then clarity + curiosity. */
function rank(r: WriterResult) { return (r.ready ? 1e6 : 0) - r.checks.length * 1e4 + r.critic.coherence * 100 + r.critic.clarity + r.critic.curiosity; }
