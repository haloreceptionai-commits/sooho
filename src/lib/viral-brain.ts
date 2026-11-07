// Viral Brain — rule-based script intelligence modelled on high-performing history Shorts.
// Deterministic for now; the optimizer is the swap point for an Azure OpenAI rewrite later.

export type ArchetypeId = "paradox" | "exploit" | "object" | "experiment";

export interface Archetype {
  id: ArchetypeId;
  name: string;
  formula: string;
  example: string;
  topics: string[];
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "paradox",
    name: "Engineering Paradox",
    formula: "An intentional flaw that secretly prevents disaster",
    example: "Why Perfect Railroads Don't Work",
    topics: [
      "Why Railroad Tracks Have Gaps On Purpose",
      "Why Skyscrapers Are Built To Sway",
      "Why Bridges Have Teeth In The Road",
      "Why Airplane Windows Have A Tiny Hole",
      "Why Dams Are Designed To Leak",
      "Why Power Lines Sag Between Towers",
    ],
  },
  {
    id: "exploit",
    name: "Bizarre Historical Exploit",
    formula: "An optical trick, loophole or rule exploit that beat the system",
    example: "The Ghost Army That Fooled Hitler",
    topics: [
      "The Inflatable Tanks That Fooled An Entire Army",
      "The Painted Ships That Became Invisible At Sea",
      "The Loophole That Let A Town Ignore A King",
      "The Fake City Built To Hide A Real One",
      "How One Clerk Exploited The Tax On Windows",
      "The Mirror Trick That Burned A Roman Fleet",
    ],
  },
  {
    id: "object",
    name: "Ordinary Object That Changed History",
    formula: "A jar, a button, a bottle of oil — that decided an empire's fate",
    example: "The Ancient Jar That Warned an Empire",
    topics: [
      "Why Sailors Carried Storm Oil",
      "The Ancient Jar That Warned An Empire",
      "The Tin Buttons That Doomed Napoleon's Army",
      "The Coin That Exposed A Traitor King",
      "The Rope Knot That Saved A Sinking Ship",
      "The Glass Bottle That Predicted Every Storm",
    ],
  },
  {
    id: "experiment",
    name: "High-Stakes Psychology / Science Experiment",
    formula: "A risky experiment with a shocking, visual result",
    example: "The Pink Prison Cell Experiment",
    topics: [
      "The Pink Prison Cell Experiment",
      "The Doctor Who Swallowed The Bacteria To Prove It",
      "The Room So Quiet It Drove People Mad",
      "The Experiment Where Rats Built A Paradise — And Destroyed It",
      "The Scientist Who Stayed Awake For 11 Days",
      "The Sailors Who Tested Lemons Against Death",
    ],
  },
];

const CURIOSITY = ["why", "how", "secret", "never", "don't", "doesn't", "on purpose", "fooled", "trick", "loophole", "hidden", "invisible", "warned", "predicted", "impossible", "mad", "shocking", "nobody", "exposed"];
const VISUAL = ["storm", "fire", "burn", "sink", "army", "fleet", "ship", "prison", "pink", "explode", "tank", "glass", "jar", "rail", "bridge", "skyscraper", "sway", "mirror", "ghost", "city", "oil", "sea", "blood", "coin", "ancient", "empire", "rats", "doomed"];
const OBJECTS = ["jar", "button", "oil", "coin", "rope", "bottle", "gap", "hole", "teeth", "window", "lemons", "mirror", "cell", "knot", "tracks"];

const has = (t: string, w: string) => t.includes(w);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface ViralScore { curiosity: number; visual: number; retention: number; overall: number }

export function scoreTopic(title: string): ViralScore {
  const t = title.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  const cHits = CURIOSITY.filter((w) => has(t, w)).length;
  const vHits = VISUAL.filter((w) => has(t, w)).length;
  const oHits = OBJECTS.filter((w) => has(t, w)).length;
  const curiosity = clamp(30 + cHits * 22 + (t.startsWith("why") || t.startsWith("the") ? 8 : 0));
  const visual = clamp(25 + vHits * 18 + oHits * 10);
  const lengthFit = words >= 4 && words <= 9 ? 20 : words <= 12 ? 8 : -10;
  const retention = clamp(curiosity * 0.45 + visual * 0.35 + lengthFit + oHits * 6);
  return { curiosity, visual, retention, overall: clamp(curiosity * 0.4 + visual * 0.3 + retention * 0.3) };
}

// ---------------- Script analyzer ----------------

export const GREETINGS = ["hi", "hey", "hello", "welcome", "today", "in this video", "let's", "guys", "did you know", "have you ever", "subscribe"];
const SENSORY = ["snap", "crack", "scream", "burn", "shatter", "slam", "drip", "roar", "creak", "hiss", "explode", "sink", "flood", "smash", "rip", "collapse", "pour", "freeze", "boil", "bleed", "rattle", "split", "buckle", "tear", "strike", "fall", "drop", "break", "tremble", "shake", "lock", "pull", "swing", "fire", "smoke", "watch", "stare", "grab", "run", "racing", "bursting"];

export interface BeatCheck { key: string; name: string; hint: string; score: number; found: string[] }

const BEAT_RULES = [
  { key: "stakes", name: "Stakes & Rival Foil", hint: "Name who opposes the protagonist: rival engineers, critics, the king, the navy.", words: ["rival", "against", "enemy", "competitor", "critics", "opposed", "mocked", "laughed", "but the", "they said", "experts", "engineers", "everyone", "the king", "the navy", "his rival", "their rival"] },
  { key: "defeat", name: "False Defeat & Public Doubt", hint: "Make the conventional way look like it won. Ridicule, doubt, 'it seemed'.", words: ["seemed", "looked like", "won", "ridiculed", "doubted", "laughed", "called it", "mistake", "foolish", "crazy", "everyone thought", "at first", "for years", "perfect", "praised"] },
  { key: "countdown", name: "Hidden Countdown / Environmental Shift", hint: "Introduce heat, pressure, a storm, a deadline — the invisible clock.", words: ["heat", "summer", "winter", "pressure", "storm", "temperature", "expand", "expansion", "rising", "minutes", "hours", "days", "wave", "wind", "slowly", "until", "then the", "every night", "tide", "cold"] },
  { key: "climax", name: "Catastrophic Visual Climax", hint: "Show the rival method failing violently: snapped, buckled, sank, exploded.", words: ["snapped", "exploded", "collapsed", "shattered", "buckled", "sank", "burst", "crashed", "derailed", "tore", "cracked", "split", "burned", "flooded", "twisted", "ripped", "destroyed"] },
];

export interface Analysis {
  words: number;
  hook: { text: string; words: number; underLimit: boolean; noFluff: boolean; sensory: boolean; score: number; greetings: string[] };
  beats: BeatCheck[];
  pacing: { words: number; seconds: number; status: "short" | "ideal" | "long"; pct: number };
  overall: number;
  tips: string[];
}

export const PACING_MIN = 195;
export const PACING_MAX = 215;

/** Strips [bracketed] cues/markers so they don't count as narration. */
export function narration(text: string) {
  return text.replace(/\[[^\]]*\]/g, " ").replace(/^#+.*$/gm, " ").replace(/\s+/g, " ").trim();
}
export function countWords(text: string) {
  const n = narration(text);
  return n ? n.split(" ").length : 0;
}

export function analyzeScript(text: string): Analysis {
  const body = narration(text);
  const lower = body.toLowerCase();
  const sentences = body.split(/(?<=[.!?—])\s+/).filter(Boolean);
  const hookText = sentences[0] ?? "";
  const hookLower = hookText.toLowerCase();
  const hookWords = hookText ? hookText.split(/\s+/).length : 0;
  const greetings = GREETINGS.filter((g) => new RegExp(`(^|\\W)${g}(\\W|$)`).test(hookLower));
  const sensory = SENSORY.some((v) => hookLower.includes(v));
  const underLimit = hookWords > 0 && hookWords <= 12;
  const noFluff = greetings.length === 0;
  const hookScore = hookText ? (underLimit ? 40 : 10) + (noFluff ? 35 : 0) + (sensory ? 25 : 0) : 0;

  const rest = lower.slice(hookLower.length);
  const beats = BEAT_RULES.map((r) => {
    const found = r.words.filter((w) => rest.includes(w));
    return { key: r.key, name: r.name, hint: r.hint, found, score: clamp(found.length === 0 ? 0 : 45 + found.length * 18) };
  });

  const words = countWords(text);
  const status = words < PACING_MIN ? "short" : words > PACING_MAX ? "long" : "ideal";
  const pacingScore = status === "ideal" ? 100 : clamp(100 - Math.abs(words - 205) * 0.8);
  const overall = clamp(hookScore * 0.3 + beats.reduce((a, b) => a + b.score, 0) / beats.length * 0.5 + pacingScore * 0.2);

  const tips: string[] = [];
  if (!underLimit) tips.push(`Cut the hook to 12 words or fewer (now ${hookWords}).`);
  if (!noFluff) tips.push(`Remove greeting/fluff from the opening: "${greetings.join('", "')}".`);
  if (!sensory) tips.push("Open in the middle of action — use a sensory verb (snapped, creaked, burned).");
  beats.filter((b) => b.score === 0).forEach((b) => tips.push(`Missing ${b.name}: ${b.hint}`));
  if (status === "short") tips.push(`Add ${PACING_MIN - words} more words to hit the 60-second sweet spot.`);
  if (status === "long") tips.push(`Trim ${words - PACING_MAX} words — Shorts lose viewers past ~215 words.`);

  return {
    words,
    hook: { text: hookText, words: hookWords, underLimit, noFluff, sensory, score: hookScore, greetings },
    beats,
    pacing: { words, seconds: Math.round((words / 205) * 60), status, pct: Math.min(100, (words / PACING_MAX) * 100) },
    overall,
    tips,
  };
}

// ---------------- Optimizer ----------------

function stripFluff(s: string) {
  return s.replace(/^(hi|hey|hello|welcome)[^.!?]*[.!?]\s*/i, "").replace(/(in this video|today we('| a)re going to|let's talk about|did you know( that)?)[,:]?\s*/gi, "");
}

/** Rewrites flat facts into the 5-beat high-tension formula (deterministic draft). */
export function optimizeScript(raw: string, topic?: string): string {
  const facts = stripFluff(narration(raw)).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
  const subject = (topic?.trim() || facts[0]?.replace(/[.!?]$/, "") || "this").replace(/^(why|how|the)\s+/i, "");
  const take = (n: number) => facts.splice(0, n).join(" ");
  const short = subject.split(/\s+/).slice(0, 5).join(" ");

  const hook = `[HOOK 0:00] The ${short} was failing — and nobody tried to stop it.`;
  const stakes = `[STAKES & RIVAL] Their rivals called it a mistake. The experts said it would never work. ${take(2) || `Everyone believed there was a better way to build the ${short}.`}`;
  const defeat = `[FALSE DEFEAT] At first, the critics looked right. The perfect version won praise, contracts and crowds. ${take(2) || "For years, the flawed design was mocked as foolish."} [SFX: crowd murmur]`;
  const countdown = `[HIDDEN COUNTDOWN] But something was rising, slowly, every single day. Heat. Pressure. A storm nobody could see coming. ${take(2) || "Minutes turned to hours, and the pressure kept building."} [SFX: low ticking]`;
  const climax = `[CATASTROPHIC CLIMAX] Then it snapped. The perfect design buckled, cracked and tore itself apart in front of everyone. ${take(3) || `The ${short} that looked broken was the only one still standing.`} [SFX: metal snap + impact]`;
  const loop = `[PAYOFF / LOOP] Because the flaw was never a mistake. It was the plan.`;
  let out = [hook, stakes, defeat, countdown, climax, loop].join("\n\n");

  // Pad / trim toward the 195–215 word window
  const fillers = [
    "Every engineer at the time could see the problem. None of them could see the solution.",
    "It was hiding in plain sight, in front of thousands of people.",
    "And the people who laughed the loudest were the ones who paid the price.",
    "It would take one brutal season to prove who was right.",
  ];
  let i = 0;
  while (countWords(out) < PACING_MIN && i < fillers.length) {
    out = out.replace("\n\n[CATASTROPHIC CLIMAX]", ` ${fillers[i++]}\n\n[CATASTROPHIC CLIMAX]`);
  }
  if (facts.length && countWords(out) < PACING_MAX) out = out.replace("\n\n[PAYOFF / LOOP]", ` ${facts.join(" ")}\n\n[PAYOFF / LOOP]`);
  return out;
}

// ---------------- Voice & Foley ----------------

export const ONYX_GUIDE = {
  voice: "onyx",
  speed: 0.94,
  rules: [
    { label: "Cadence", text: "Deliberate and low. ~205 wpm overall, but slow the hook and the climax to ~170 wpm." },
    { label: "Hook pause", text: "Hold 0.6s of silence right after the hook line — let the paradox land." },
    { label: "Pre-reveal pause", text: "Drop to near-silence (0.9s) before the climax verb: “Then… it snapped.”" },
    { label: "Emphasis", text: "Punch single-syllable impact words: snap, crack, sank, gone." },
    { label: "Doubt beat", text: "Slightly lighter, almost mocking tone when quoting the rivals." },
    { label: "Ending", text: "Flat, final delivery on the last line so it loops cleanly into the hook." },
  ],
};

/** Voice-ready text for Azure OpenAI TTS (onyx): ellipses create natural suspense pauses. */
export function toVoiceText(script: string): string {
  const lines = script.split(/\n+/).filter((l) => l.trim());
  return lines
    .map((l) => {
      const isHook = /^\[HOOK/i.test(l);
      const isClimax = /^\[CATASTROPHIC/i.test(l);
      let t = narration(l);
      if (isClimax) t = t.replace(/^Then\s+/i, "Then… ");
      if (isHook) t = `${t} …`;
      return t;
    })
    .filter(Boolean)
    .join("\n\n");
}

const SFX_LEXICON: { re: RegExp; cue: string }[] = [
  { re: /^(creak|creaked|creaking|wood|door|hinge)/, cue: "Wood creak" },
  { re: /^(coin|coins|gold|silver|paid|price)/, cue: "Coin drop" },
  { re: /^(snap|snapped|track|tracks|rail|rails|steel|metal|buckled)/, cue: "Track / metal snap" },
  { re: /^(splash|sea|ocean|wave|waves|water|sank|sink|sinking|flood|flooded|oil)/, cue: "Water splash" },
  { re: /^(crack|cracked|shatter|shattered|glass|jar|bottle)/, cue: "Glass / ceramic crack" },
  { re: /^(storm|thunder|lightning|wind)/, cue: "Thunder roll" },
  { re: /^(fire|burn|burned|burning|flame|flames)/, cue: "Fire crackle" },
  { re: /^(explode|exploded|explosion|boom|cannon|cannons|blast)/, cue: "Sub boom" },
  { re: /^(crowd|crowds|everyone|laughed|mocked|critics)/, cue: "Crowd murmur" },
  { re: /^(heat|pressure|rising|slowly|ticking|minutes|hours|clock)/, cue: "Ticking riser" },
  { re: /^(train|engine|locomotive)/, cue: "Train rumble" },
  { re: /^(chain|chains|lock|locked|prison|cell)/, cue: "Chain / cell door slam" },
  { re: /^(heart|fear|scream|screamed)/, cue: "Heartbeat thump" },
  { re: /^(collapsed|crashed|tore|ripped|destroyed|apart)/, cue: "Impact crash" },
];

export interface SfxHit { word: string; cue: string; index: number; time: number }

export function extractSfx(script: string): { tokens: { text: string; cue?: string }[]; hits: SfxHit[] } {
  const body = narration(script);
  const parts = body.split(/(\s+)/);
  const hits: SfxHit[] = [];
  let wi = 0;
  let lastCueAt = -99;
  const tokens = parts.map((p) => {
    if (/^\s+$/.test(p)) return { text: p };
    const w = p.toLowerCase().replace(/[^a-z']/g, "");
    const m = SFX_LEXICON.find((l) => l.re.test(w));
    const idx = wi++;
    if (m && idx - lastCueAt >= 4) {
      lastCueAt = idx;
      hits.push({ word: p.replace(/[^\w']/g, ""), cue: m.cue, index: idx, time: Math.round((idx / 205) * 600) / 10 });
      return { text: p, cue: m.cue };
    }
    return { text: p };
  });
  return { tokens, hits };
}
