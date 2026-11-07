export type Format = "long" | "short";

export type BeatKey = "hook" | "stakes" | "defeat" | "turn" | "payoff";

export interface Template {
  id: string;
  name: string;
  tagline: string;
  hook: string; // {topic} placeholder
  foil: string;
  defeat: string;
  turn: string;
  payoff: string;
  style: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "paradox",
    name: "The Impossible Paradox",
    tagline: "Open on a contradiction the viewer can't ignore",
    hook: "{topic} should have been impossible. And yet — it happened.",
    foil: "Everyone at the time believed the opposite. One person refused to.",
    defeat: "By every measure, it was over. The records say so.",
    turn: "But buried in a forgotten detail was the one thing no one noticed.",
    payoff: "And that is why {topic} still changes how we see the world today.",
    style: "Oil-painting archive, candlelit chiaroscuro, slow push-ins",
  },
  {
    id: "lie",
    name: "The Lie You Were Taught",
    tagline: "Debunk a belief, then reveal the darker truth",
    hook: "Everything you learned about {topic} is wrong.",
    foil: "The official story had a hero. The real story had a rival.",
    defeat: "The truth was erased — documents burned, witnesses silenced.",
    turn: "Then, centuries later, a single letter surfaced.",
    payoff: "The real {topic} was far more terrifying than the legend.",
    style: "Aged parchment textures, redacted documents, ink-bleed transitions",
  },
  {
    id: "countdown",
    name: "The Final Hours",
    tagline: "Ticking-clock tension toward a catastrophe",
    hook: "In 72 hours, {topic} would be gone forever. Nobody knew.",
    foil: "One side had everything to lose. The other had nothing left.",
    defeat: "Hour 60. The last hope collapsed.",
    turn: "Then came a decision no one could have predicted.",
    payoff: "What happened next ended an era — and began {topic}'s legend.",
    style: "Desaturated war-map overlays, ticking clock UI, embers and smoke",
  },
  {
    id: "secret",
    name: "The Hidden Mechanism",
    tagline: "Curiosity gap: how did it actually work?",
    hook: "There's a secret behind {topic} that historians ignored for 500 years.",
    foil: "The experts called it a myth. The evidence called it a machine.",
    defeat: "Every attempt to recreate it failed.",
    turn: "Until someone looked at it from a completely different angle.",
    payoff: "The answer rewrote the history of {topic}.",
    style: "Technical blueprint line-art over sepia, macro artifact close-ups",
  },
];

export interface BeatDef {
  key: BeatKey;
  name: string;
  purpose: string;
  weight: number; // share of runtime at neutral pacing
}

export const BEATS: BeatDef[] = [
  { key: "hook", name: "The Paradox Hook", purpose: "Stop the scroll in the first seconds with a contradiction.", weight: 0.08 },
  { key: "stakes", name: "Stakes & Foil", purpose: "Who wants what, who stands in the way, and what's lost.", weight: 0.24 },
  { key: "defeat", name: "False Defeat", purpose: "Make the viewer believe it's over — peak tension.", weight: 0.22 },
  { key: "turn", name: "Hidden Turn", purpose: "Reveal the overlooked detail that flips everything.", weight: 0.24 },
  { key: "payoff", name: "Catastrophic Payoff", purpose: "Deliver the consequence and a loopable final line.", weight: 0.22 },
];

const VISUALS: Record<BeatKey, string[]> = {
  hook: ["Extreme close-up, eyes of a portrait", "Black frame → single lit object", "Fast zoom onto map location"],
  stakes: ["Two-figure split composition", "Wide establishing city/battlefield", "Parallax crowd scene", "Throne room, low angle"],
  defeat: ["Ruins under storm sky", "Slow pull-out, lone figure", "Fire and ash particles", "Torn banner in wind"],
  turn: ["Macro on hidden document", "Light beam reveal", "Map lines redraw themselves", "Whisper close-up"],
  payoff: ["Epic wide aftermath", "Time-lapse to modern day", "Silhouette against sunrise", "Hard cut to black"],
};

const SFX: Record<BeatKey, string[]> = {
  hook: ["Bass drop + silence", "Heartbeat thump", "Reverse cymbal riser"],
  stakes: ["Low war drums", "Crowd murmur bed", "Sword unsheath", "String ostinato"],
  defeat: ["Thunder roll", "Music cuts to drone", "Distant bell toll", "Wind howl"],
  turn: ["Paper rustle + whoosh", "Ticking clock stops", "Choir swell", "Glass ping"],
  payoff: ["Orchestral hit", "Sub boom", "Echo tail to silence", "Loop-back riser"],
};

export interface Scene {
  index: number;
  start: number;
  end: number;
  narration: string;
  visual: string;
  sfx: string;
}

export interface BeatPlan extends BeatDef {
  start: number;
  end: number;
  scenes: Scene[];
}

/** pacing 0 = slow/cinematic, 100 = rapid-fire. Returns seconds per scene. */
export function sceneLength(format: Format, pacing: number): number {
  const p = Math.min(100, Math.max(0, pacing)) / 100;
  return format === "short" ? 4 - p * 2.5 : 18 - p * 12; // short: 4s→1.5s, long: 18s→6s
}

export function buildStory(opts: {
  topic: string;
  format: Format;
  duration: number;
  pacing: number;
  template: Template;
}): BeatPlan[] {
  const { format, duration, pacing, template } = opts;
  const topic = opts.topic.trim() || "this moment in history";
  const p = pacing / 100;
  // Faster pacing shortens the hook and payoff tails, extends the middle tension
  const weights = BEATS.map((b) =>
    b.key === "hook" ? b.weight * (1 - p * 0.4) : b.key === "defeat" ? b.weight * (1 + p * 0.3) : b.weight,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const lines: Record<BeatKey, string> = {
    hook: template.hook, stakes: template.foil, defeat: template.defeat, turn: template.turn, payoff: template.payoff,
  };
  const len = sceneLength(format, pacing);
  let cursor = 0;
  let sceneIdx = 1;
  return BEATS.map((b, i) => {
    const start = cursor;
    const end = i === BEATS.length - 1 ? duration : Math.round((cursor + (weights[i] / total) * duration) * 10) / 10;
    cursor = end;
    const count = Math.max(1, Math.round((end - start) / len));
    const step = (end - start) / count;
    const scenes: Scene[] = Array.from({ length: count }, (_, s) => ({
      index: sceneIdx++,
      start: Math.round((start + s * step) * 10) / 10,
      end: Math.round((start + (s + 1) * step) * 10) / 10,
      narration: s === 0 ? lines[b.key].replaceAll("{topic}", topic) : `[Expand: ${b.purpose.toLowerCase()}]`,
      visual: `${VISUALS[b.key][s % VISUALS[b.key].length]} · ${template.style}`,
      sfx: SFX[b.key][s % SFX[b.key].length],
    }));
    return { ...b, start, end, scenes };
  });
}

export function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
