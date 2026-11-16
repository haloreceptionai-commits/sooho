// Story Engine v2 (Pipeline Briefs #2 + #3): blocking validators V1-V10, Clarity Clock,
// open-loop registry, shot mix, hook rules, the 85-point QA gate, analytics re-ranking and
// the few-shot benchmark library. Pure functions shared by the pipeline, prompts and tests.

import { hardWords } from "@/lib/sound-words";
import { rareWords, KID_SWAPS } from "@/lib/plain-words";
import { shapeIssues } from "@/lib/story-shape";

export const WPS = 153 / 60;
/** Spoken numbers ("nineteen sixty-five") are plain speech, never "hard words". */
const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)+$/;

const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
function under100(n: number) { return n < 20 ? ONES[n]! : TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : ""); }
function under1000(n: number) { return n >= 100 ? `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${under100(n % 100)}` : ""}` : under100(n); }
/** Speaks a whole number the way a narrator says it; years 1100-1999 / 2010+ as pairs ("nineteen sixty-five"). */
export function numberToWords(n: number, year = false): string {
  if (year && n >= 1100 && n <= 2099 && !(n >= 2000 && n < 2010)) { const hi = Math.floor(n / 100), lo = n % 100; return `${under100(hi)} ${lo === 0 ? "hundred" : lo < 10 ? `oh ${ONES[lo]}` : under100(lo)}`; }
  if (n >= 1_000_000) return `${numberToWords(Math.floor(n / 1_000_000))} million${n % 1_000_000 ? ` ${numberToWords(n % 1_000_000)}` : ""}`;
  if (n >= 1000) return `${under1000(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${under1000(n % 1000)}` : ""}`;
  return under1000(n);
}
/** Replaces digits in narration with spoken words (1965 -> nineteen sixty-five, 3,000 -> three thousand, 40% -> forty percent). */
const ORD: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
const ordinal = (w: string) => { const m = w.match(/^(.*?)([a-z]+)$/)!; const last = m[2]!; return m[1] + (ORD[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`)); };
/**
 * Makes narration safe for the speech-timing worker: every space-separated token must contain letters
 * (stray quotes/dashes are glued to the previous word) and no digits remain.
 */
export function speakable(text: string): string {
  const out: string[] = [];
  for (const t of spellNumbers(text).replace(/\d/g, "").split(/\s+/).filter(Boolean)) {
    if (/[A-Za-z]/.test(t) || !out.length) out.push(t); else out[out.length - 1] += t;
  }
  if (out.length && !/[A-Za-z]/.test(out[0]!)) out.shift();
  return out.join(" ");
}
export function spellNumbers(text: string): string {
  return text
    .replace(/[$£€]\s?(\d+)/g, (_, d: string) => `${d} ${text.match(/£/) ? "pounds" : text.match(/€/) ? "euros" : "dollars"}`)
    .replace(/(\d+)\.(\d+)/g, (_, a: string, b: string) => `${numberToWords(+a)} point ${b.split("").map(x => ONES[+x]).join(" ")}`)
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, d: string) => ordinal(numberToWords(+d)))
    .replace(/(\d+)\s?%/g, (_, d: string) => `${numberToWords(+d)} percent`)
    .replace(/\b(\d{1,3}(?:,\d{3})+|\d+)(s)?\b/g, (_, d: string, plural?: string) => {
      const n = +d.replace(/,/g, "");
      const yearish = !d.includes(",") && d.length === 4 && n >= 1100 && n <= 2099;
      const w = numberToWords(n, yearish);
      return plural ? (w.endsWith("y") ? `${w.slice(0, -1)}ies` : `${w}s`) : w;
    });
} // Atlas pace, words per second

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
  /** Advanced Video AI: every narrated word must be one an 8-year-old knows (names and places excepted). */
  kid?: boolean;
  /** Story Shape v3 (owner's gold Shorts): contradiction hook, stacked lines, loops, payoff, hook echo. Replaces beat quotas. */
  shape?: boolean;
}
/** Loop Shorts under 25 s have no room for escalation, myth, money-shot return or chapter timing. */
export const MICRO_SEC = 25;
const MICRO_SKIP = new Set(["V7", "V9", "V10", "CLOCK", "LOOPS", "SHOTS"]);
export interface Check { id: string; pass: boolean; msg: string }
export interface StoryReport { checks: Check[]; failed: Check[]; words: number; revealSec: number; shotMix: Record<Shot, number> }

export const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;
// splits on . ! ? but not after initials or titles ("John F. Ohmer", "Mr. Smith")
export const splitSentences = (t: string) => t.replace(/[“”]/g, '"').split(/(?<!\b[A-Z]\.|\b(?:Mr|Mrs|Ms|Dr|St|Lt|Col|Gen|Maj|Capt|Sgt|Jr|Sr)\.)(?<=[.!?]["']?)\s+/).map((x) => x.trim()).filter(Boolean);
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

export const DATE_LEAD = /^(in|on|by|during|back in)?\s*(the\s+)?(year\s+)?(1[0-9]{3}|20[0-9]{2})s?\b/i;

export function hookIssues(line: string, anchors?: Anchors, factText = ""): string[] {
  const out: string[] = [];
  const n = wc(line);
  if (n < 8 || n > 12) out.push(`Hook is ${n} words (needs 8-12)`);
  if (BANNED_HOOK.test(line.trim())) out.push("Hook uses a banned opening (riddle, greeting, 'Did you know', 'Imagine', '[job] knocks')");
  // Gemini guide: open on stakes or action, never a dry date or biography lead ("In 1965...", "1942:", "Stephanie Kwolek was a chemist").
  if (DATE_LEAD.test(line.trim())) out.push("Hook opens with a date; start with the crisis or the odd action, put the year later");
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)?\s+(was|is)\s+(a|an|the)\b/.test(line.trim())) out.push("Hook opens like a biography; start with the crisis or the odd action");
  if (/\?\s*$/.test(line) && !anchors) out.push("Hook is an unanswerable question");
  // Gold-script rule: the hook states the contradiction and hides the reason.
  if (/\b(because|which is why|that'?s why|in order to|so that|due to)\b/i.test(line)) out.push("Hook gives the answer away; state the strange fact and hide the reason");
  if (anchors) {
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
const ABSENCE = /\b(no one|nobody|nothing|never|no (\w+ ){1,3}(ever )?(came|happened|attacked|found|showed|arrived))\b/i;
const ABSENCE_OK = /\b(so well|worked|because|thanks to|that'?s why|which is why)\b/i;
const WANT = /\b(wants?|needs?|must|has to|have to|tries|trying|try to|goal|plans? to|hopes?|desperate)\b/i;
const PRONOUN_START = /^["']?(he|she|they|him|her|his|them)\b/i;

const LABEL = /^["']?(try|step|attempt|proof|reveal|hook|payoff|myth|analogy|context|question|escalation|fact)\s*(one|two|three|\d)?\s*:/i;
// rough "has a verb" test: common verbs, -s/-ed/-ing forms, or modal/aux
const VERBISH = /\b(is|are|was|were|be|has|have|had|do|does|did|can|could|will|would|must|let|lets|make|makes|made|get|gets|got|go|goes|went|see|sees|look|looks|need|needs|want|wants|know|knows|turn|turns|hide|hides|hid|build|builds|built|put|puts|say|says|said|come|comes|came|take|takes|took|keep|keeps|kept|try|tries|think|thinks|fly|flies|flew|run|runs|ran)\b|\w(s|ed|ing)\b/i;
const role = (r: Role) => [r.name, r.role].filter(Boolean);

export function validateStory(s: StoryInput): StoryReport {
  const checks: Check[] = [];
  const micro = s.durationSec < MICRO_SEC;
  const legacyOnly = new Set(['V1', 'V2', 'V6', 'V7', 'V9', 'CLOCK', 'LOOPS']);
  // Shape v3 replaces these beat quotas (year/place/stakes by 8s, question by 8s, hero want, escalation, myth, clock, loop %).
  const shapeQuota = new Set(['V2', 'V6', 'V7', 'V9', 'V10', 'CLOCK', 'LOOPS', 'V4']);
  const add = (id: string, pass: boolean, msg: string) => {
    if (s.shape && shapeQuota.has(id)) { checks.push({ id, pass: true, msg: `${id}: replaced by Story Shape v3` }); return; }
    if (s.shape && id === 'V1') { const ok = mentions(spokenBy(s.scenes, 8), s.anchors.subject); checks.push({ id, pass: ok, msg: ok ? 'V1 subject named by 8s' : `V1: by 8s the narration never names the subject ("${s.anchors.subject}")` }); return; }
    if (s.kid && legacyOnly.has(id)) { checks.push({ id, pass: true, msg: `${id}: Advanced uses factual cause and effect instead of an event quota` }); return; }
    checks.push(micro && MICRO_SKIP.has(id) ? { id, pass: true, msg: `${id} not used for loop Shorts` } : { id, pass, msg });
  };
  const all = s.scenes.map((x) => x.narration.trim()).join(" ");
  const words = wc(all);
  const total = words / WPS;
  const starts = sceneStarts(s.scenes);
  const by8 = spokenBy(s.scenes, 8), by10 = spokenBy(s.scenes, 10), by15 = spokenBy(s.scenes, 15), by3 = spokenBy(s.scenes, 3.2);
  const sents = splitSentences(all);
  if (s.kid) {
    const nonsense = /\b(weak sky|space clocks|lonely gps|one cross shouts|signals? (laughs?|wants?|feels?))\b/i;
    const named = mentions(sents[0] ?? '', s.anchors.subject);
    add('CAUSE', named && !nonsense.test(all), !named ? 'Opening must name the real subject, not a vague stand-in' : nonsense.test(all) ? 'Replace the confusing metaphor with the real physical step' : 'Real subject and literal causal language');
    const opened = s.scenes.findIndex(x => x.loop_opened.split(/[,\s]+/).includes('main'));
    const closed = s.scenes.findIndex(x => x.loop_closed.split(/[,\s]+/).includes('main'));
    add('ANSWER', opened >= 0 && closed >= opened && sents.length >= 2, 'Mark where the real opening curiosity is raised and resolved; no fixed percentage');
  }

  // V1 anchors by 8s
  const missing = (micro ? (["subject", "place"] as const) : (["subject", "year", "place", "stakes"] as const)).filter((k) => !mentions(by8, s.anchors[k]) && !(k === "year" && /\b1[0-9]{3}s?\b|\b20[0-9]{2}\b/.test(by8)));
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
  if (micro) add("V6", heroIn >= 0.6, heroIn < 0.6 ? `V6 hero is in only ${Math.round(heroIn * 100)}% of scenes (needs 60%)` : "V6 hero leads the loop");
  else add("V6", wantLine && heroIn >= 0.6, !wantLine ? `V6 hero want: ${s.hero.name || "the hero"}'s goal isn't stated by 10s` : heroIn < 0.6 ? `V6 hero is in only ${Math.round(heroIn * 100)}% of scenes (needs 60%)` : "V6 hero with a want");
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
  const castLimit = s.kid ? 4 : 3;
  add("CAST", s.cast.length <= castLimit, s.cast.length > castLimit ? `Cast limit: ${s.cast.length} recurring characters (max ${castLimit})` : `Cast within ${castLimit} roles`);
  // Shot mix
  const shotMix = { wide: 0, aerial: 0, action: 0, macro: 0, face: 0 } as Record<Shot, number>;
  s.scenes.forEach((x) => { shotMix[x.shot] = (shotMix[x.shot] ?? 0) + 1 / s.scenes.length; });
  const wide = shotMix.wide + shotMix.aerial;
  const mixOk = wide >= 0.35 && shotMix.face <= 0.3 && shotMix.macro >= 0.1 && shotMix.action >= 0.2 && s.scenes[0]?.shot !== "face";
  add("SHOTS", mixOk, mixOk ? "Shot mix balanced" : `Shot mix: wide ${Math.round(wide * 100)}% (≥40), action ${Math.round(shotMix.action * 100)}% (~30), macro ${Math.round(shotMix.macro * 100)}% (~20), faces ${Math.round(shotMix.face * 100)}% (≤30)${s.scenes[0]?.shot === "face" ? "; first frame is a face" : ""}`);
  // Language: 3-12 word sentences, plain words, length
  const longS = sents.filter((x) => wc(x) > (s.kid ? 20 : 12)).length;
  const anchorWords = new Set(Object.values(s.anchors).flatMap(contentWords).concat(contentWords(`${s.hero.name} ${s.cast.map((c) => c.name).join(" ")}`)));
  const hard = [...new Set(hardWords(all))].filter((w) => { const k = w.toLowerCase().replace(/[’']s$/, "").replace(/[^a-z]/g, ""); return !anchorWords.has(k) && !anchorWords.has(k.replace(/s$/, "")) && !NUMBER_WORD.test(k); });
  const labels = sents.filter((x) => LABEL.test(x));
  const frags = sents.filter((x) => !LABEL.test(x) && (wc(x) < 3 || (wc(x) <= 4 && !VERBISH.test(x))) && !/\?["']?$/.test(x));
  const budget = s.durationSec * 2.6;
  const longOk = s.shape ? true : longS <= Math.max(1, Math.round(words / 150)); // long-form allows an occasional longer sentence
  const langOk = longOk && hard.length <= 2 && !labels.length && (s.shape || frags.length <= 2) && words <= budget * 1.25 && words >= budget * 0.8;
  if (s.kid) {
    const allow = [...Object.values(s.anchors), s.hero.name, ...s.cast.map((c) => c.name)];
    const rare = rareWords(all, allow);
    const kidOk = rare.length <= Math.max(1, Math.floor(words / 40));
    add("KID", kidOk, kidOk ? "Every word is one an 8-year-old knows" : `Words an 8-year-old won't know: ${rare.slice(0, 8).map((w) => KID_SWAPS[w] ? `${w} (say "${KID_SWAPS[w]}")` : w).join(", ")}`);
  }
  add("LANG", langOk, langOk ? "Plain short sentences" : [!longOk ? `${longS} sentences over 12 words` : "", hard.length > 2 ? `hard words: ${hard.slice(0, 6).join(", ")}` : "", labels.length ? `beat labels spoken aloud: "${labels[0]!.slice(0, 40)}"` : "", frags.length > 2 ? `fragments with no verb: "${frags.slice(0, 2).join('", "')}"` : "", words > budget * 1.25 ? `too long: ${words} words (max ${Math.round(budget * 1.25)})` : "", words < budget * 0.8 ? `too short: ${words} words` : ""].filter(Boolean).join("; "));

  if (s.shape) {
    const sh = shapeIssues(all).issues;
    add("SHAPE", !sh.length, sh.length ? sh.join("; ") : "Story Shape v3: contradiction hook, stacked lines, loops, payoff and hook echo");
  }
  // RETAIN (long-form only): a fresh open question at least every ~75s so viewers always wait for an answer
  if (s.durationSec >= 120) {
    const r = retentionIssues(s.scenes, s.durationSec);
    add("RETAIN", !r.length, r.length ? r.join("; ") : "Fresh open loop at least every 75s");
  }

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
  swipe?: string[]; // lines where a cold viewer would swipe away
}

const SOFT_CHECKS = new Set(["V8", "V8j"]);
export interface GateResult { score: number; ready: boolean; parts: Record<string, number>; blockers: string[] }

/** Script score out of 100: validators 56, judges 30, read-aloud + literalness 14. Ready at 85+. */
export function storyScore(r: StoryReport, j: JudgeResult | null, sceneCount: number, opts: { strict?: boolean } = {}): GateResult {
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
    (j.swipe ?? []).slice(0, 3).forEach((l) => blockers.push(`Viewer would swipe away at: "${l}" — make it a surprise, danger or new fact`));
    if (j.literal.length) blockers.push(`Visual literalness: scenes ${j.literal.map((i) => i + 1).join(", ")} don't show what is said`);
  }
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const passBHard = !j || j.passB >= 4;
  // Repetition checks only cost points; every structural rule still blocks.
  const hardFails = r.failed.filter((c) => !SOFT_CHECKS.has(c.id));
  // Advanced Video AI also needs clean read-aloud lines, literal visuals and no swipe-away line.
  const strictOk = !opts.strict || !j || (j.readAloud.length === 0 && (j.swipe ?? []).length <= 1 && j.literal.length <= Math.floor(sceneCount * 0.15) && j.filler.length <= 1);
  return { score, ready: score >= 85 && hardFails.length === 0 && passBHard && strictOk && (!j || (j.passA >= 3 && j.passC)), parts, blockers };
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

const g = (beat: string, narration: string, shot: Shot, characters: string[] = ["Lockheed"], money = false, loop_opened = "", loop_closed = ""): StoryScene => ({ beat, narration, shot, characters, money, loop_opened, loop_closed });
/** Gold rewrite of the failure script (Brief #3 §5), tightened so it passes every validator. */
export const GOLD_REWRITE: StoryScene[] = [
  g("hook", "Burbank hid a whole bomber factory under a fake street in 1942.", "aerial", ["Lockheed"], true),
  g("context", "Lockheed wants the factory hidden from enemy bombers. So how do you hide a factory from the sky?", "wide", ["Lockheed"], false, "main"),
  g("try", "The army calls Hollywood set builders to help Lockheed.", "action", ["Lockheed", "set builders"]),
  g("try", "First, Lockheed workers paint the giant roof green.", "action"),
  g("fail", "But from a plane, the green roof still looks like a factory.", "aerial", ["Lockheed", "pilot"]),
  g("escalation", "The set builders hang huge nets over the roof. Lockheed adds fake houses, trees and even laundry.", "wide", ["Lockheed", "set builders"]),
  g("myth", "Most people picture a whole fake town. Actually, it was a thin cover over one roof.", "wide", []),
  g("reveal", "The set builders know the trick. You don't hide the shape. You break it up.", "face", ["set builders"]),
  g("analogy", "Ever hide a toy under a blanket? From far away, it looks like a lumpy floor.", "macro", [], false, "", "main"),
  g("proof", "From the air, the Lockheed roof becomes a soft street with tiny homes.", "macro"),
  g("payoff", "It worked so well that pilots got lost over their own factory. So how do you hide a factory from the sky? You turn its roof into a fake street.", "action", ["Lockheed", "pilot"], true),
];
export const GOLD_STORY = (): StoryInput => ({
  scenes: GOLD_REWRITE, anchors: GOLD_ANCHORS, question: "How do you hide a factory from the sky?",
  hero: { name: "Lockheed", role: "factory", want: "hide the factory from bombers" },
  cast: [{ name: "Lockheed", role: "factory" }, { name: "set builders", role: "Hollywood" }, { name: "pilot", role: "army" }], durationSec: 65,
});
export const GOLD_ANCHORS: Anchors = { year: "1942", place: "Burbank, California", org: "Lockheed", subject: "factory", stakes: "bombers" };

/** Few-shot block added to the script writer's prompt. */
export const FEW_SHOT = `${BENCH_SUCCESS}\n\n${BENCH_FAILURE}\n\nGOLD REWRITE of the failure (copy this STRUCTURE, never its content): ${GOLD_REWRITE.map((b) => `[${b.beat}${b.money ? ", money shot" : ""}] ${b.narration}`).join(" ")}`;

/** Long-form retention: enough chapter loops, no stretch over 75s without a new open loop, never a moment with nothing left to wait for. */
export function retentionIssues(scenes: StoryScene[], durationSec: number): string[] {
  const out: string[] = [];
  const starts = sceneStarts(scenes);
  const total = starts.length ? starts[starts.length - 1]! + wc(scenes[scenes.length - 1]!.narration) / WPS : 0;
  const opens = scenes.map((x, i) => (x.loop_opened && x.loop_opened !== "main" ? starts[i]! : -1)).filter((t) => t >= 0);
  const need = Math.max(2, Math.floor(durationSec / 90));
  if (opens.length < need) out.push(`only ${opens.length} chapter loops opened (need ${need}+ for ${Math.round(durationSec / 60)} min)`);
  const marks = [15, ...opens, Math.max(15, total - 30)].sort((a, b) => a - b);
  let gap = 0;
  for (let i = 1; i < marks.length; i++) gap = Math.max(gap, marks[i]! - marks[i - 1]!);
  if (gap > 75) out.push(`${Math.round(gap)}s with no new open question (max 75s)`);
  // stacked loops: at every scene before the final payoff, at least one loop is still open
  const open = new Set<string>();
  for (let i = 0; i < scenes.length; i++) {
    const x = scenes[i]!;
    if (x.loop_opened) open.add(x.loop_opened);
    if (x.loop_closed) open.delete(x.loop_closed);
    if (!open.size && starts[i]! > 15 && starts[i]! < total - 40) { out.push(`every question is answered at ${Math.round(starts[i]!)}s — open the next one before closing the last`); break; }
  }
  return out;
}
