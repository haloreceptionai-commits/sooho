/** Shorts Writer v4 light code checks: hard facts only, nothing stylistic (the critic judges quality). */

export interface Fact { id: string; text: string; certain: boolean }

/** Spoken budget for a Short of `sec` seconds (60 s -> 130-150 words, 12-16 lines). */
export function budget(sec: number) {
  const d = Math.max(10, sec);
  return { minWords: Math.round(d * 2.17), maxWords: Math.round(d * 2.5), minLines: Math.max(4, Math.round(d / 5)), maxLines: Math.max(6, Math.round(d / 3.75)) };
}

export const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;
const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

export function hookIssues(hook: string): string[] {
  const out: string[] = [];
  const n = wordCount(hook);
  if (n < 8 || n > 12) out.push(`hook is ${n} words (needs 8-12)`);
  if (/\?\s*["'”]?\s*$/.test(hook.trim())) out.push("hook is a question");
  if (/\bdid you know\b/i.test(hook)) out.push('hook uses "Did you know"');
  return out;
}

/** Words that look like names: capitalised tokens not at the start of a sentence. */
function nameTokens(line: string): string[] {
  const toks = line.replace(/[“”"]/g, "").split(/\s+/);
  const out: string[] = [];
  toks.forEach((t, i) => {
    const w = t.replace(/^[^A-Za-z]+|[^A-Za-z.']+$/g, "").replace(/'s$/, "");
    if (!w || i === 0 || /[.!?:]$/.test(toks[i - 1] ?? "")) return;
    if (/^[A-Z][a-z]+/.test(w) && w !== "I") out.push(w);
  });
  return out;
}

export function scriptIssues(lines: string[], facts: Fact[], sec: number): string[] {
  const out: string[] = [];
  const b = budget(sec);
  const text = lines.join(" ");
  const n = wordCount(text);
  if (n < b.minWords || n > b.maxWords) out.push(`word count ${n} (needs ${b.minWords}-${b.maxWords} for ${sec}s)`);
  if (lines.length < b.minLines || lines.length > b.maxLines) out.push(`${lines.length} lines (needs ${b.minLines}-${b.maxLines})`);
  const seen = new Map<string, number>();
  lines.forEach((l, i) => { const k = norm(l); if (!k) return; if (seen.has(k)) out.push(`line ${i + 1} repeats line ${seen.get(k)! + 1}`); else seen.set(k, i); });
  out.push(...hookIssues(lines[0] ?? "").map((x) => `Hook: ${x}`));
  const known = ` ${norm(facts.filter((f) => f.certain).map((f) => f.text).join(" "))} `;
  const missingNames = [...new Set(lines.flatMap(nameTokens))].filter((w) => !known.includes(` ${w.toLowerCase().replace(/\.$/, "").slice(0, Math.max(4, w.length - 2))}`));
  if (missingNames.length) out.push(`names not in the certain facts: ${missingNames.slice(0, 6).join(", ")}`);
  const nums = [...new Set((text.match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? []).map((x) => x.replace(/,/g, "")))];
  const knownNums = new Set((known.match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? []).map((x) => x.replace(/,/g, "")));
  const badNums = nums.filter((x) => !knownNums.has(x));
  if (badNums.length) out.push(`dates/numbers not in the certain facts: ${badNums.slice(0, 6).join(", ")}`);
  return out;
}

export interface CriticLine { n: number; follows: boolean; clear: boolean; narration: boolean; new_fact: boolean; reason: string }
export interface Critic { lines: CriticLine[]; hook_reveals_answer: boolean; ending_makes_sense: boolean; ending_copies_hook: boolean; real_twist: boolean; coherence: number; clarity: number; curiosity: number; summary: string }

/** Lines (1-based) the critic flagged; the hook (line 1) is locked and never patched. */
export const flaggedLines = (c: Critic) => c.lines.filter((l) => l.n > 1 && !(l.follows && l.clear && l.narration && l.new_fact)).map((l) => l.n);

/** Acceptance per the owner's task: clear, narration only, hook hides the answer, ending doesn't copy the hook, coherence >= 8. */
export function criticPasses(c: Critic): boolean {
  return c.coherence >= 8 && !c.hook_reveals_answer && !c.ending_copies_hook && c.ending_makes_sense && c.real_twist
    && c.lines.every((l) => l.clear && l.narration);
}

/** After critic patches: restart from a new spine only when coherence is still below 8. */
export const needsNewSpine = (c: Critic) => c.coherence < 8;
