// Script validator, topic 5-test score, caption emphasis and the finished-video QA score.
// Pure functions (browser + tests); rules come from the Storm Oil pipeline brief.

export interface ScriptScene { beat: string; narration: string }
export interface ScriptCheck { ok: boolean; issues: string[]; words: number; revealPos: number; longSentences: number; sentences: number }

import { hardWords } from "@/lib/sound-words";

const GREETING = /\b(hello|hey guys|hi everyone|welcome( back)?|did you know|in this video|today we)\b/i;

const MYTH = /\b(most people think|people think|everyone thinks|you(?:'d| would)? think|you might think|people believed|everyone believed|it'?s not|that'?s (?:not|wrong)|wasn'?t|isn'?t (?:true|what)|the truth is|actually)\b/i;

export const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

export function sentences(text: string) {
  return text.replace(/["“”]/g, "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
}

/** Checks a script against the curiosity-gap mini-story rules. */
export function validateScript(scenes: ScriptScene[], loopLine: string, durationSec: number, wpm = 153): ScriptCheck {
  const issues: string[] = [];
  const all = scenes.map((s) => s.narration.trim()).join(" ");
  const words = wordCount(all);
  const budget = (durationSec / 60) * wpm;
  if (words > budget * 1.15) issues.push(`Too long: ${words} words for a ${durationSec}s video (max ${Math.round(budget * 1.15)})`);
  if (words < budget * 0.8) issues.push(`Too short: ${words} words (need about ${Math.round(budget)})`);
  if (GREETING.test(all.split(/\s+/).slice(0, 20).join(" "))) issues.push("Opens with a greeting or 'did you know'");
  const ss = sentences(all);
  const long = ss.filter((x) => wordCount(x) > 12).length;
  if (long > Math.max(2, ss.length * 0.15)) issues.push(`${long} sentences are longer than 12 words`);
  const ri = scenes.findIndex((s) => s.beat === "reveal");
  let revealPos = 0;
  if (ri < 0) issues.push("No reveal beat");
  else {
    revealPos = wordCount(scenes.slice(0, ri).map((s) => s.narration).join(" ")) / Math.max(1, words);
    if (revealPos < 0.55 || revealPos > 0.75) issues.push(`Reveal starts at ${Math.round(revealPos * 100)}% (needs 60-72%)`);
  }
  if (!scenes.some((s) => s.beat === "stakes" && /["“?]/.test(s.narration)) && !/\?/.test(scenes.slice(0, Math.max(1, ri)).map((s) => s.narration).join(" "))) issues.push("No skeptic line (quoted doubt or question) before the reveal");
  if (!/\bever\b|\blike\b|just like/i.test(scenes.slice(Math.max(0, ri)).map((s) => s.narration).join(" "))) issues.push("No everyday analogy in the reveal");
  if (!scenes.some((s) => s.beat === "proof")) issues.push("No proof / demo moment");
  if (!scenes.some((s) => s.beat === "payoff")) issues.push("No payoff");
  if (!loopLine.trim()) issues.push("No closing loop line");
  // plain English a 5-year-old follows
  const hard = [...new Set(hardWords(all))];
  if (hard.length > 3) issues.push(`Too many hard words: ${hard.slice(0, 8).join(", ")} — use simple everyday words`);
  // hook must open on a question or a strange action that begs "why?"
  const pre = ri < 0 ? all : scenes.slice(0, ri).map((s) => s.narration).join(" ");
  const questions = (pre.match(/\?/g) ?? []).length;
  const needQ = Math.max(2, Math.floor((durationSec * (ri < 0 ? 1 : 0.65)) / 12));
  if (questions < needQ) issues.push(`Only ${questions} curiosity questions before the reveal (need ${needQ}: a new question every ~10s to re-hook)`);
  if (!MYTH.test(all)) issues.push('No false belief broken (e.g. "Most people think... But that\'s wrong.")');
  return { ok: issues.length === 0, issues, words, revealPos, longSentences: long, sentences: ss.length };
}

// ---------------- topic 5 tests ----------------

export interface Topic5 { odd: number; hidden: number; analogy: number; demo: number; verifiable: number; total: number; pass: boolean }

const ODD = ["pour", "carried", "burn", "paint", "swallow", "fake", "inflatable", "pink", "mirror", "gap", "hole", "sway", "leak", "sag", "teeth", "lemons", "quiet", "awake", "oil", "invisible"];
const HIDDEN = ["why", "on purpose", "secret", "fooled", "trick", "loophole", "warned", "predicted", "hidden", "exposed", "doomed", "saved"];
const HOUSE = ["oil", "soup", "glass", "bottle", "rope", "button", "coin", "window", "jar", "lemons", "mirror", "paint", "knot", "room", "tin"];
const HISTORY = ["sailor", "roman", "napoleon", "king", "army", "empire", "ancient", "medieval", "railroad", "ship", "fleet", "prison", "doctor", "scientist", "experiment", "town", "city", "bridge", "dam"];

const hits = (t: string, list: string[]) => list.filter((w) => t.includes(w)).length;
const cap5 = (n: number) => Math.max(0, Math.min(5, Math.round(n)));

/** The brief's 5 topic tests, 0-5 each; a topic passes at 18/25. */
export function scoreTopic5(title: string): Topic5 {
  const t = title.toLowerCase();
  const odd = cap5(1 + hits(t, ODD) * 2);
  const hidden = cap5(1 + hits(t, HIDDEN) * 2 + (t.startsWith("why") ? 1 : 0));
  const analogy = cap5(1.5 + hits(t, HOUSE) * 2);
  const demo = cap5(1.5 + (hits(t, HOUSE) + hits(t, ODD)) * 1.2);
  const verifiable = cap5(2 + hits(t, HISTORY) * 1.5);
  const total = odd + hidden + analogy + demo + verifiable;
  return { odd, hidden, analogy, demo, verifiable, total, pass: total >= 18 };
}

export function madeBefore(topic: string, previous: string[]) {
  const n = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  return previous.some((p) => n(p) === n(topic));
}

// ---------------- captions ----------------

const STOP = new Set("the a an and but so then with into onto from that this they them their there his her him he she it its was were is are be been for of to in on at by as or not just even very really what when where which while who whom why how your you our out up down over".split(" "));

/** Index of the word to highlight in a caption group: a number first, otherwise the longest content word (5+ letters). */
export function emphasisIndex(words: string[]): number {
  const clean = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""));
  const num = clean.findIndex((w) => /\d/.test(w) || /^(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|fifty|twenty|thirty|forty)$/i.test(w));
  if (num >= 0) return num;
  let best = -1, len = 4;
  clean.forEach((w, i) => { if (!STOP.has(w.toLowerCase()) && w.length > len) { best = i; len = w.length; } });
  return best;
}

// ---------------- QA score ----------------

export interface QaInput {
  hookScore: number; // 0-40 from hook writer
  revealPos: number; // 0-1
  factConfidence: number; // 0-1 share of high/medium claims
  wordsPerSec: number;
  avgShotSec: number;
  captions: boolean;
  lufs: number;
  lra: number;
  loopLine: boolean;
  height: number;
  width: number;
}
export interface QaResult { score: number; parts: Record<string, number> }

const lin = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
const band = (v: number, lo: number, hi: number, soft: number) => (v >= lo && v <= hi ? 1 : Math.max(0, 1 - Math.min(Math.abs(v - lo), Math.abs(v - hi)) / soft));

/** 0-100 quality score; under 80 the library shows a warning. */
export function qaScore(q: QaInput): QaResult {
  const parts: Record<string, number> = {
    hook: Math.round(lin(q.hookScore, 20, 36) * 15),
    loop: Math.round(band(q.revealPos, 0.6, 0.72, 0.12) * 15),
    facts: Math.round(q.factConfidence * 15),
    pacing: Math.round((band(q.wordsPerSec, 2.3, 2.9, 0.6) * 0.6 + band(q.avgShotSec, 2, 4, 1.5) * 0.4) * 15),
    captions: q.captions ? 10 : 0,
    audio: Math.round((band(q.lufs, -15, -13, 3) * 0.6 + band(q.lra, 3, 7, 3) * 0.4) * 10),
    ending: q.loopLine ? 10 : 0,
    resolution: Math.min(q.width, q.height) >= 1080 ? 10 : 0,
  };
  return { score: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}
