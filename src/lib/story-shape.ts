/**
 * Story Shape v3: the owner's two gold Shorts scripts (Nov 16 2026) and machine checks for their shape.
 * Hook contradiction with the answer hidden -> short stacked present-tense lines -> an open loop every
 * ~10 seconds -> step-by-step reveal -> short payoff line -> close that echoes the hook.
 * Pure module: shared by prompts, validators and tests.
 */

export const GOLD_THEREMIN = `A gift with no battery spied on America for seven years.
Soviet schoolchildren give the U.S. ambassador in Moscow a carved wooden seal.
He hangs it right behind his desk.
Security sweeps the room. No wires. No battery. Nothing.
Yet for seven years, the Soviets hear every private word.
Then in 1952, a British radio operator hears the ambassador's conversations on his radio, live.
How?
Inside the seal is a hollow chamber with a thin metal membrane.
A Soviet van parks outside and beams a radio signal at the building.
When someone speaks, the membrane vibrates and changes the signal bouncing back to the van.
The signal itself was the power. No battery to die, and nothing to find when the beam was off.
Its inventor was Leon Theremin, who also invented the instrument named after him.
America had hung the spy on its own wall.`;

export const GOLD_HANNIBAL = `Hannibal was trapped, so he strapped fire to two thousand oxen.
217 BC. Rome has his army cornered in a valley.
The only way out is one narrow mountain pass, and four thousand Roman soldiers are guarding it.
Rome just has to wait.
So Hannibal comes up with a plan that sounds completely insane.
That night, his soldiers tie bundles of dry brushwood to the horns of two thousand oxen, and set them on fire.
Then they drive the burning herd up the hillside.
From the pass, the Roman guards see thousands of lights moving across the mountain in the dark.
They think Hannibal's entire army is breaking out, so they abandon the pass to stop them.
That's exactly what he wanted.
His real army walks through the empty pass and escapes with almost everything it came with.
By morning, Rome is chasing a herd of panicked oxen.
Hannibal didn't win with strength. He won by making the enemy look the wrong way.`;

/** Prompt block that overrides older beat quotas for Shorts. */
export const STORY_SHAPE_DIRECTION = `STORY SHAPE v3 (the owner's gold standard; it OVERRIDES any older rule about a mandatory year/place in the hook, a stated hero want, a rival, try-fail rounds, a myth line, an "Ever ...?" analogy or a question by word 20):
1. HOOK (8-12 words, about 3 seconds, no setup before it): a CONTRADICTION that makes the viewer need the answer ("A gift with no battery spied on America for seven years." / "Hannibal was trapped, so he strapped fire to two thousand oxen."). It states the strange fact and HIDES the explanation: never "because", "which is why" or the mechanism in the hook.
2. SETUP in 2-4 short lines, told in the PRESENT TENSE as if it is happening now: who, where, the trap or the mystery ("Rome has his army cornered in a valley." / "He hangs it right behind his desk.").
3. PRESSURE: show why it seems impossible ("Security sweeps the room. No wires. No battery. Nothing." / "Rome just has to wait.").
4. OPEN LOOPS every 8-10 seconds: plant a question and delay the answer ("How?" on its own line, "a plan that sounds completely insane", "Yet...", "Then...").
5. REVEAL step by step: one visible physical action per line, in cause-and-effect order.
6. PAYOFF LINE under 8 words that makes the viewer FEEL the twist ("That's exactly what he wanted." / "The signal itself was the power.").
7. CLOSE with one line that echoes the hook's words so the video loops ("America had hung the spy on its own wall." / "He won by making the enemy look the wrong way.").
Lines are short and stacked: most 3-12 words, one idea each; fragments for rhythm are allowed ("No wires. No battery. Nothing."). Never a lecture, never a summary ending, never a definition stuffed into a sentence. Every fact must still come from the checked facts; never invent people, quotes, numbers or danger. If the topic has no real person, the object or the problem it causes is the hero, and the stakes are the real consequence.

GOLD EXAMPLE 1 (copy the SHAPE and rhythm, never the content):
${GOLD_THEREMIN}

GOLD EXAMPLE 2:
${GOLD_HANNIBAL}`;

/** Judge rubric line for comparing a script to the gold examples. */
export const STORY_SHAPE_JUDGE = `Compare against the gold standard Shorts "The Gift That Spied for Seven Years" and "Hannibal's Burning Oxen": a contradiction hook that hides the answer, short present-tense stacked lines, an open question every 8-10 seconds, a short payoff line and a hook-echo ending. Flag in swipe any sentence that reads like a lecture, explains before curiosity is built, or lets tension drop for more than ten seconds.`;

const WPS = 153 / 60;
const words = (t: string) => t.split(/\s+/).filter(Boolean);
const STOP = new Set("the a an and or but so of to in on at for with by from his her its their was were is are be been that this it he she they them had has have as into up out not no".split(" "));
const keyWords = (t: string) => words(t.toLowerCase().replace(/[^a-z0-9' ]/g, " ")).map((w) => w.replace(/'s$/, "")).filter((w) => w.length > 2 && !STOP.has(w));
export const shapeSentences = (t: string) => t.replace(/[“”]/g, '"').replace(/’/g, "'").split(/(?<!\b(?:U\.S|Mr|Mrs|Dr|St|BC|AD)\.?)(?<=[.!?]["']?)\s+/).map((x) => x.trim()).filter(Boolean);

/** The hook gives away the explanation instead of holding it back. */
const GIVEAWAY = /\b(because|which is why|that'?s why|the reason|in order to|so that|due to|this is how|here'?s why)\b/i;
/** Tension markers: negation, reversal or a strange consequence. */
const TENSION = /\b(no|not|never|nobody|nothing|without|yet|but|so|only|still|even|instead|until|trapped|secret|spied|impossible|wrong)\b|n't\b|\d/i;
/** A line that keeps a loop open. */
const LOOP = /\?["']?$|\b(yet|but|then|until|insane|impossible|nothing|nobody|no one|secret|mystery|strange|wrong|exactly what|the real|turns out|instead)\b|n't\b/i;

export interface ShapeReport { issues: string[]; hookWords: number; shortShare: number; longestGapSec: number; payoff: string | null; echo: boolean }

export function shapeIssues(script: string): ShapeReport {
  const sents = shapeSentences(script);
  const hook = sents[0] ?? "";
  const issues: string[] = [];
  const hw = words(hook).length;
  if (hw < 8 || hw > 12) issues.push(`Shape hook: ${hw} words (needs 8-12, about 3 seconds)`);
  if (GIVEAWAY.test(hook)) issues.push(`Shape hook gives the answer away ("${hook.slice(0, 60)}"); state the strange fact and hide the reason`);
  else if (!TENSION.test(hook)) issues.push("Shape hook has no contradiction; pair the strange fact with what makes it impossible");
  const lens = sents.map((s) => words(s).length);
  const shortShare = lens.filter((n) => n <= 12).length / Math.max(1, lens.length);
  if (shortShare < 0.75) issues.push(`Shape lines: only ${Math.round(shortShare * 100)}% of lines are 12 words or fewer (needs 75%); stack short lines, one idea each`);
  // Loop spacing over the first 75% of the script (the reveal may run without new questions).
  const total = lens.reduce((a, b) => a + b, 0);
  let w = 0, last = 0, gap = 0;
  sents.forEach((s, i) => {
    const start = w; w += lens[i]!;
    if (start > total * 0.75) return;
    if (i === 0 || LOOP.test(s)) { gap = Math.max(gap, start - last); last = start; }
  });
  gap = Math.max(gap, Math.min(w, total * 0.75) - last);
  const longestGapSec = gap / WPS;
  if (longestGapSec > 10.5) issues.push(`Shape loops: ${longestGapSec.toFixed(0)} seconds with no open question or reversal (needs one every 8-10 seconds)`);
  // Payoff line: a short sentence (<= 8 words) in the last 40%.
  let acc = 0; let payoff: string | null = null;
  sents.forEach((s, i) => { if (acc >= total * 0.6 && lens[i]! <= 8 && lens[i]! >= 3) payoff ??= s; acc += lens[i]!; });
  if (!payoff) issues.push("Shape payoff: no short twist line (8 words or fewer) near the end");
  const close = sents.slice(-2).join(" ");
  const hk = new Set(keyWords(hook));
  const echo = sents.length > 2 && keyWords(close).some((k) => hk.has(k) || hk.has(k.replace(/s$/, "")) || hk.has(`${k}s`));
  if (!echo) issues.push("Shape close: the final line doesn't echo the hook, so the video won't loop");
  if (/\b(in summary|in short|to sum up|overall|the new method|that is how|this is how)\b/i.test(sents[sents.length - 1] ?? "")) issues.push("Shape close ends on a summary; end on the twist that echoes the hook");
  return { issues, hookWords: hw, shortShare, longestGapSec, payoff, echo };
}
