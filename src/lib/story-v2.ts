// Story Engine v2 (Pipeline Briefs #2 + #3): blocking validators V1-V10, Clarity Clock,
// open-loop registry, shot mix, hook rules, the 85-point QA gate, analytics re-ranking and
// the few-shot benchmark library. Pure functions shared by the pipeline, prompts and tests.

import { hardWords } from "@/lib/sound-words";

export const WPS = 153 / 60; // Atlas pace, words per second

export type Shot = "wide" | "aerial" | "action" | "macro" | "face";
export interface StoryScene {
  beat: string;
  narration: string;
  characters: string[];
  shot: Shot;
  money: boolean;
  loop_opened: string; // loop id opened in this scene ("" if none)
  loop_closed: string; // loop id closed in this scene ("" if none)
}
export interface Anchors { year: string; place: string; org: string; subject: string; stakes: string }
export interface Role { name: string; role: string }
export interface StoryInput {
  scenes: StoryScene[];
  anchors: Anchors;
  question: string; // the one main "impossible question"
  hero: { name: string; role: string; want: string };
  cast: Role[]; // recurring characters
  durationSec: number;
}
export interface Check { id: string; pass: boolean; msg: string }
export interface StoryReport { checks: Check[]; failed: Check[]; words: number; revealSec: number; shotMix: Record<Shot, number> }

export const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;
export const splitSentences = (t: string) => t.replace(/[“”]/g, '"').split(/(?<=[.!?]["']?)\s+/).map((x) => x.trim()).filter(Boolean);
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
const STOP = new Set("the a an and but so then of to in on at by as or is are was were be it its this that these those he she they his her their them him you your we our what who how why when where do does did can could would will just even very from with into for not no yes".split(" "));
export const contentWords = (t: string) => norm(t).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Words of an anchor that should be heard ("Burbank, California" -> burbank, california). */
const anchorTokens = (a: string) => contentWords(a).filter((w) => w.length >= 3);
export function mentions(text: string, anchor: string) {
  const t = ` ${norm(text)} `;
  const toks = anchorTokens(anchor);
  if (!toks.length) return false;
  return toks.some((w) => t.includes(` ${w} `) || t.includes(` ${w}s `) || (w.length > 4 && t.includes(` ${w.slice(0, -1)}`)));
}

/** Narration text spoken before second `sec` (at the Atlas pace). */
export function spokenBy(scenes: StoryScene[], sec: number) {
  const all = scenes.map((s) => s.narration.trim()).join(" ").split(/\s+/).filter(Boolean);
  return all.slice(0, Math.max(1, Math.round(sec * WPS))).join(" ");
}
export function spokenAfter(scenes: StoryScene[], sec: number) {
  const all = scenes.map((s) => s.narration.trim()).join(" ").split(/\s+/).filter(Boolean);
  return all.slice(Math.max(0, all.length - Math.round(sec * WPS))).join(" ");
}
/** Start time (s) of every scene. */
export function sceneStarts(scenes: StoryScene[]) {
  let w = 0;
  return scenes.map((s) => { const t = w / WPS; w += wc(s.narration); return t; });
}

// ---------------- hook ----------------

export const BANNED_HOOK = /^(a|an|the)\s+\w+\s+knocks\b|\bdid you know\b|^imagine\b|^(hello|hey|hi|welcome)\b|\bin this video\b|\bguess (who|what)\b|\bwho lives here\b|\briddle\b/i;

export function hookIssues(line: string, anchors?: Anchors, factText = ""): string[] {
  const out: string[] = [];
  const n = wc(line);
  if (n < 8 || n > 12) out.push(`Hook is ${n} words (needs 8-12)`);
  if (BANNED_HOOK.test(line.trim())) out.push("Hook uses a banned opening (riddle, greeting, 'Did you know', 'Imagine', '[job] knocks')");
  if (/\?\s*$/.test(line) && !anchors) out.push("Hook is an unanswerable question");
  if (anchors) {
    const anchored = mentions(line, anchors.year) || mentions(line, anchors.place) || /\b(1[0-9]{3}|20[0-9]{2})\b/.test(line);
    if (!anchored) out.push("Hook has no place or time anchor");
    if (!mentions(line, anchors.subject)) out.push(`Hook doesn't name the subject ("${anchors.subject}")`);
  }
  const nums = line.match(/\b\d[\d,.]*\b/g) ?? [];
  for (const x of nums) if (factText && !factText.includes(x.replace(/[,.]$/, ""))) out.push(`Hook number ${x} is not in the checked facts`);
  return out;
}

/** On-screen hook text: at most 6 words, states the oddity, never duplicates the spoken line. */
export function hookTextIssues(text: string, spoken: string): string[] {
  const out: string[] = [];
  if (wc(text) > 6) out.push(`Hook text is ${wc(text)} words (max 6)`);
  if (/\?/.test(text)) out.push("Hook text is a question (state the oddity as a fact)");
  const a = new Set(contentWords(text)), b = new Set(contentWords(spoken));
  const overlap = [...a].filter((w) => b.has(w)).length / Math.max(1, a.size);
  if (a.size > 1 && overlap >= 0.8) out.push("Hook text just repeats the spoken line");
  return out;
}

// ---------------- validators ----------------

const MYTH = /\b(most people (think|picture|believe|imagine)|people (think|believe)|everyone (thinks|believes)|you might think|you'?d think)\b/i;
const ABSENCE = /\b(no one|nobody|nothing|never|no \w+ (ever )?(came|happened|attacked|found|showed))\b/i;
const ABSENCE_OK = /\b(so well|worked|because|thanks to|that'?s why|which is why)\b/i;
const WANT = /\b(wants?|needs?|must|has to|have to|tries|trying|try to|goal|plans? to|hopes?|desperate)\b/i;
const PRONOUN_START = /^["']?(he|she|they|him|her|his|them)\b/i;

const role = (r: Role) => [r.name, r.role].filter(Boolean);

export function validateStory(s: StoryInput): StoryReport {
  const checks: Check[] = [];
  const add = (id: string, pass: boolean, msg: string) => checks.push({ id, pass, msg });
  const all = s.scenes.map((x) => x.narration.trim()).join(" ");
  const words = wc(all);
  const total = words / WPS;
  const starts = sceneStarts(s.scenes);
  const by8 = spokenBy(s.scenes, 8), by10 = spokenBy(s.scenes, 10), by15 = spokenBy(s.scenes, 15), by3 = spokenBy(s.scenes, 3.2);
  const sents = splitSentences(all);

  // V1 anchors by 8s
  const missing = (["subject", "year", "place", "stakes"] as const).filter((k) => !mentions(by8, s.anchors[k]) && !(k === "year" && /\b1[0-9]{3}s?\b|\b20[0-9]{2}\b/.test(by8)));
  add("V1", !missing.length, missing.length ? `V1 anchors: by 8s the narration never says the ${missing.join(", ")} (${missing.map((k) => `"${s.anchors[k]}"`).join(", ")})` : "V1 anchors named by 8s");
  // V2 one main question by 8s, no other question before 15s
  const qSents = sents.map((x, i) => ({ x, i, t: wc(sents.slice(0, i).join(" ")) / WPS })).filter((q) => /\?["']?$/.test(q.x));
  const mainQ = qSents.find((q) => q.t <= 8);
  const early = qSents.filter((q) => q.t <= 15);
  // the spoken question must be the real one (shares words with the research question or names the subject)
  const realQ = !!mainQ && (mentions(mainQ.x, s.anchors.subject) || contentWords(mainQ.x).filter((w) => contentWords(s.question).includes(w)).length >= Math.max(1, contentWords(s.question).length * 0.5));
  const v2 = !!mainQ && realQ && early.length === 1 && wc(mainQ.x) <= 12;
  add("V2", v2, v2 ? "V2 one main question by 8s" : !mainQ ? "V2 main question: no plain question is spoken in the first 8s" : !realQ ? `V2 main question "${mainQ.x.slice(0, 50)}" isn't about the real mystery (${s.anchors.subject})` : early.length > 1 ? `V2 main question: ${early.length} questions before 15s (only one allowed)` : "V2 main question is longer than 12 words");
  // V3 referents
  const bad: string[] = [];
  const names = [...s.cast.flatMap(role), s.hero.name, s.hero.role].filter(Boolean).map((n) => n.toLowerCase());
  sents.forEach((x, i) => {
    if (!PRONOUN_START.test(x)) return;
    const prev = (sents[i - 1] ?? "").toLowerCase();
    if (!i || !names.some((n) => contentWords(n).some((w) => prev.includes(w)))) bad.push(x.slice(0, 40));
  });
  add("V3", !bad.length, bad.length ? `V3 referents: no named person before "${bad.slice(0, 2).join('", "')}"` : "V3 every pronoun has a named referent");
  // V4 framing payoff: the final 8s answer the opening question in its own words
  const last8 = spokenAfter(s.scenes, 8);
  const qw = contentWords(s.question || mainQ?.x || "");
  const reuse = qw.filter((w) => contentWords(last8).includes(w)).length / Math.max(1, qw.length);
  add("V4", qw.length > 0 && reuse >= 0.4, reuse >= 0.4 ? "V4 opening question answered in the last 8s" : "V4 framing payoff: the last 8s don't answer the opening question in its own words");
  // V5 no anticlimax
  const lastS = sents[sents.length - 1] ?? "";
  const anti = ABSENCE.test(lastS) && !ABSENCE_OK.test(lastS);
  add("V5", !anti, anti ? `V5 anticlimax: the final line ends on an absence ("${lastS.slice(0, 50)}")` : "V5 strong final line");
  // V6 hero want by 10s + hero in 60% of beats
  const heroWords = contentWords(`${s.hero.name} ${s.hero.role}`);
  const wantLine = splitSentences(by10).some((x) => WANT.test(x) && heroWords.some((w) => norm(x).includes(w)));
  const heroIn = s.scenes.filter((x) => x.characters.some((c) => heroWords.some((w) => norm(c).includes(w)))).length / Math.max(1, s.scenes.length);
  add("V6", wantLine && heroIn >= 0.6, !wantLine ? `V6 hero want: ${s.hero.name || "the hero"}'s goal isn't stated by 10s` : heroIn < 0.6 ? `V6 hero is in only ${Math.round(heroIn * 100)}% of scenes (needs 60%)` : "V6 hero with a want");
  // V7 stakes by 8s + escalation before 30s
  const esc = s.scenes.findIndex((x) => ["fail", "escalation"].includes(x.beat));
  const stakes = mentions(by8, s.anchors.stakes);
  const escOk = esc >= 0 && starts[esc]! < Math.min(30, total * 0.5);
  add("V7", stakes && escOk, !stakes ? `V7 stakes: "${s.anchors.stakes}" isn't said by 8s` : !escOk ? "V7 no risk escalation before 30s" : "V7 stakes early + escalation");
  // V8 new information density
  const seen: Set<string>[] = []; const filler: string[] = [];
  sents.forEach((x) => {
    const cw = new Set(contentWords(x));
    if (cw.size >= 2 && seen.some((p) => [...cw].filter((w) => p.has(w)).length / cw.size >= 0.7)) filler.push(x.slice(0, 40));
    seen.push(cw);
  });
  add("V8", filler.length <= 1, filler.length > 1 ? `V8 new info: ${filler.length} sentences repeat earlier lines ("${filler[0]}")` : "V8 every line adds something");
  // V9 myth-reality between 40% and 60%
  const mi = sents.findIndex((x) => MYTH.test(x));
  const mpos = mi < 0 ? -1 : wc(sents.slice(0, mi).join(" ")) / Math.max(1, words);
  add("V9", mi >= 0 && mpos >= 0.38 && mpos <= 0.62, mi < 0 ? 'V9 myth-reality: no "Most people think X. Actually Y." beat' : `V9 myth-reality beat at ${Math.round(mpos * 100)}% (needs 40-60%)`);
  // V10 money shot by 10s and again at the payoff
  const m0 = s.scenes.findIndex((x) => x.money);
  const mPay = s.scenes.some((x, i) => x.money && i > m0 && x.beat === "payoff");
  add("V10", m0 >= 0 && starts[m0]! <= 10 && mPay, m0 < 0 || starts[m0]! > 10 ? "V10 money shot isn't on screen by 10s" : !mPay ? "V10 money shot doesn't return at the payoff" : "V10 money shot early + payoff");

  // Clarity Clock
  const clock3 = mentions(by3, s.anchors.subject);
  const clock8 = mentions(by8, s.anchors.place) && mentions(by8, s.anchors.stakes);
  const clock15 = !!mainQ && m0 >= 0 && starts[m0]! <= 15 && mentions(by15, s.anchors.org);
  add("CLOCK", clock3 && clock8 && clock15, !clock3 ? "Clarity clock: subject not heard by 3s" : !clock8 ? "Clarity clock: place + stakes not clear by 8s" : !clock15 ? `Clarity clock: by 15s the question, money shot and "${s.anchors.org}" must all have appeared` : "Clarity clock on time");
  // Open-loop registry
  const opened = new Map<string, number>(), closed = new Map<string, number>();
  s.scenes.forEach((x, i) => {
    for (const id of x.loop_opened.split(/[,\s]+/).filter(Boolean)) if (!opened.has(id)) opened.set(id, i);
    for (const id of x.loop_closed.split(/[,\s]+/).filter(Boolean)) closed.set(id, i);
  });
  const open = [...opened.keys()].filter((k) => !closed.has(k));
  const mc = closed.get("main");
  const mcPos = mc === undefined ? -1 : starts[mc]! / Math.max(1, total);
  const loopsOk = !open.length && opened.has("main") && mcPos >= 0.6 && mcPos <= 0.8;
  add("LOOPS", loopsOk, open.length ? `Loop registry: loops never closed: ${open.join(", ")}` : !opened.has("main") ? 'Loop registry: no "main" loop' : `Loop registry: main question closes at ${Math.round(mcPos * 100)}% (needs 65-75%)`);
  // Cast limit
  add("CAST", s.cast.length <= 3, s.cast.length > 3 ? `Cast limit: ${s.cast.length} recurring characters (max 3)` : "Cast within 3 roles");
  // Shot mix
  const shotMix = { wide: 0, aerial: 0, action: 0, macro: 0, face: 0 } as Record<Shot, number>;
  s.scenes.forEach((x) => { shotMix[x.shot] = (shotMix[x.shot] ?? 0) + 1 / s.scenes.length; });
  const wide = shotMix.wide + shotMix.aerial;
  const mixOk = wide >= 0.35 && shotMix.face <= 0.3 && shotMix.macro >= 0.1 && shotMix.action >= 0.2 && s.scenes[0]?.shot !== "face";
  add("SHOTS", mixOk, mixOk ? "Shot mix balanced" : `Shot mix: wide ${Math.round(wide * 100)}% (≥40), action ${Math.round(shotMix.action * 100)}% (~30), macro ${Math.round(shotMix.macro * 100)}% (~20), faces ${Math.round(shotMix.face * 100)}% (≤30)${s.scenes[0]?.shot === "face" ? "; first frame is a face" : ""}`);
  // Language: 3-12 word sentences, plain words, length
  const longS = sents.filter((x) => wc(x) > 12).length;
  const hard = [...new Set(hardWords(all))];
  const budget = s.durationSec * 2.6;
  const langOk = longS <= 1 && hard.length <= 3 && words <= budget * 1.15 && words >= budget * 0.8;
  add("LANG", langOk, langOk ? "Plain short sentences" : [longS > 1 ? `${longS} sentences over 12 words` : "", hard.length > 3 ? `hard words: ${hard.slice(0, 6).join(", ")}` : "", words > budget * 1.15 ? `too long: ${words} words (max ${Math.round(budget * 1.15)})` : "", words < budget * 0.8 ? `too short: ${words} words` : ""].filter(Boolean).join("; "));

  const ri = s.scenes.findIndex((x) => x.beat === "reveal");
  return { checks, failed: checks.filter((c) => !c.pass), words, revealSec: ri >= 0 ? starts[ri]! : 0, shotMix };
}

// ---------------- 85-point gate ----------------

export interface JudgeResult {
  passA: number; // 0-4 correct answers after the first 3s
  passB: number; // 0-4 after the first 15s
  passC: boolean; // opening question answered
  payoff: string;
  weakest: string;
  readAloud: string[]; // lines that don't parse when spoken
  literal: number[]; // scene indexes whose visual doesn't show the narrated noun/action
  filler: string[];
}

export interface GateResult { score: number; ready: boolean; parts: Record<string, number>; blockers: string[] }

/** Script score out of 100: validators 56, judges 30, read-aloud + literalness 14. Ready at 85+. */
export function storyScore(r: StoryReport, j: JudgeResult | null, sceneCount: number): GateResult {
  const v = r.checks.filter((c) => c.pass).length / Math.max(1, r.checks.length);
  const parts: Record<string, number> = {
    validators: Math.round(v * 56),
    passA: j ? Math.round((Math.min(4, j.passA) / 4) * 10) : 0,
    passB: j ? Math.round((Math.min(4, j.passB) / 4) * 10) : 0,
    passC: j?.passC ? 10 : 0,
    readAloud: j ? Math.max(0, 7 - j.readAloud.length * 2) : 0,
    literal: j ? Math.round(7 * (1 - Math.min(1, j.literal.length / Math.max(1, sceneCount * 0.3)))) : 0,
  };
  const blockers = r.failed.map((c) => c.msg);
  if (j) {
    if (j.passA < 3) blockers.push(`Pass A: a viewer of the first 3s gets only ${j.passA}/4 right`);
    if (j.passB < 4) blockers.push(`Pass B: after 15s a viewer gets only ${j.passB}/4 of premise, hero, want, question`);
    if (!j.passC) blockers.push("Pass C: the opening question is not answered");
    j.readAloud.slice(0, 3).forEach((l) => blockers.push(`Read-aloud: "${l}"`));
    if (j.literal.length) blockers.push(`Visual literalness: scenes ${j.literal.map((i) => i + 1).join(", ")} don't show what is said`);
  }
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const passBHard = !j || j.passB >= 4;
  return { score, ready: score >= 85 && passBHard && (!j || (j.passA >= 3 && j.passC)), parts, blockers };
}

/** Final QA = 90% script gate + 10% production (pacing, audio, resolution, captions). */
export function finalScore(gate: GateResult, prod: { wordsPerSec: number; avgShotSec: number; lufs: number; lra: number; width: number; height: number; captions: boolean }) {
  const band = (x: number, lo: number, hi: number, soft: number) => (x >= lo && x <= hi ? 1 : Math.max(0, 1 - Math.min(Math.abs(x - lo), Math.abs(x - hi)) / soft));
  const production = Math.round(
    band(prod.wordsPerSec, 2.2, 2.9, 0.6) * 3 + band(prod.avgShotSec, 2, 4, 1.5) * 2 + band(prod.lufs, -15.5, -12.5, 3) * 2 +
    (Math.min(prod.width, prod.height) >= 1080 ? 2 : 0) + (prod.captions ? 1 : 0),
  );
  const score = Math.round(gate.score * 0.9) + production;
  return { score, ready: gate.ready && score >= 85, parts: { ...gate.parts, production } };
}

// ---------------- analytics loop ----------------

export interface Perf { hookType: string; hold3?: number | undefined; ret30?: number | undefined; completion?: number | undefined; replays?: number | undefined }

/** Re-ranks hook types by real retention you entered; returns [] until there is data. */
export function rankHookTypes(perf: Perf[]): string[] {
  const by = new Map<string, number[]>();
  for (const p of perf) {
    if (p.hold3 === undefined && p.completion === undefined) continue;
    const s = (p.hold3 ?? 0) * 0.5 + (p.ret30 ?? 0) * 0.2 + (p.completion ?? 0) * 0.3 + Math.min(20, p.replays ?? 0) * 0.2;
    by.set(p.hookType, [...(by.get(p.hookType) ?? []), s]);
  }
  return [...by.entries()].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length] as const).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

// ---------------- benchmark library (few-shot contrast pairs) ----------------

export const BENCH_SUCCESS = `SUCCESS — "Why Sailors Carried Storm Oil" (benchmark, millions of views). Hero: the ship's cook wants to save the ship from pirates. 0s: he pours cooking oil into the sea while a pirate ship closes in (odd action, on screen). 3s: his captain grabs him: "We're about to get boarded, and you're making soup?" Question by ~5s: why pour oil? Try/fail: they run, the storm grows, pirates gain. Reveal ~70%: "You see, sailors really carried oil just for this. They called it storm oil." Analogy: "Ever blown on a bowl of soup? The broth ripples, but the oily spots stay smooth." Proof: macro soup shot. Payoff: the calm oil path saves the ship while the wave drops onto the pirates' deck. Why it works: one hero with a want, visible oddity, one question, escalation, one reveal + analogy + proof, spectacle ending.`;

export const BENCH_FAILURE = `FAILURE — "The Fake City That Hid A War Factory" (our old script). Opening: "A mailman knocks on a rooftop door—who lives here?" (riddle, face close-up, hook text repeated the line). Never says "factory", "war", a year or the main place; "bombers" first heard at 58s. "He used British night decoys, and taught studios." (no referent). New characters with no role (Major, Seattle). Two questions late (30%, 42%). Ending: "No enemy bombers ever came to test." (absence). Validator results: V1 0/4 anchors, V2 fail, V3 fail, V4 fail, V5 fail, V6 fail, V10 fail. Kept parts that worked: the myth-bust "Most people think a full fake town stood here. But that's wrong." and the blanket analogy.`;

export const GOLD_REWRITE = [
  { beat: "hook", narration: "In 1942, America hid a bomber factory under a fake neighbourhood." },
  { beat: "context", narration: "Painted houses. Plywood trees. Even fake laundry on the lines. From the sky over Burbank, California, it looked like a quiet street. Below it, the Lockheed workers built warplanes for the war." },
  { beat: "question", narration: "After Pearl Harbor, everyone expected enemy bombers. So how do you hide a factory from the sky?" },
  { beat: "try", narration: "Lockheed wants the factory gone from enemy maps. First, workers paint the big roof green." },
  { beat: "fail", narration: "But from a plane, the giant flat roof still looks like a factory." },
  { beat: "escalation", narration: "The army calls Hollywood set builders for help. The set builders hang huge nets with fake houses and trees." },
  { beat: "myth", narration: "Most people picture a whole fake town. Actually, it was a thin cover over one huge roof." },
  { beat: "reveal", narration: "The set builders know the trick. You don't hide the shape. You break it up." },
  { beat: "analogy", narration: "Ever hide a toy under a blanket? From far away, it just looks like a lumpy floor." },
  { beat: "proof", narration: "From the air, the factory roof becomes a soft green street with tiny homes." },
  { beat: "payoff", narration: "It worked so well that pilots got lost above their own factory. So how do you hide a factory from the sky? You turn its roof into a fake street." },
];
export const GOLD_ANCHORS: Anchors = { year: "1942", place: "Burbank, California", org: "Lockheed", subject: "factory", stakes: "bombers" };

/** Few-shot block added to the script writer's prompt. */
export const FEW_SHOT = `${BENCH_SUCCESS}\n\n${BENCH_FAILURE}\n\nGOLD REWRITE of the failure (copy this STRUCTURE, never its content): ${GOLD_REWRITE.map((b) => `[${b.beat}] ${b.narration}`).join(" ")}`;
