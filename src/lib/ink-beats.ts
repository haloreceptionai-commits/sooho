// Ink explainer pacing: the picture cuts hard every 1-2 seconds to whatever the narrator is saying.
// Each scene's narration is split into short spoken phrases; every phrase becomes its own still with no camera move.
import type { PlanScene } from "@/lib/pipeline-operations.server";

/** Words that should never end a phrase (the picture would cut mid-idea). */
const GLUE = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "for", "and", "or", "but", "with", "by", "from", "as", "into", "his", "her", "their", "its", "my", "our", "your", "this", "that", "these", "those", "is", "was", "were", "are", "be", "not", "no", "so", "than", "very", "just", "who", "which", "what", "when", "where", "how", "if", "then", "had", "has", "have", "will", "would", "could", "can", "it's", "there"]);

/** Splits narration into phrases of about 3-5 words (~1.3-2s at the long-form pace), cutting at punctuation when possible. */
export function inkPhrases(text: string, min = 2, max = 4): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[][] = [];
  let cur: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    cur.push(w);
    const bare = w.toLowerCase().replace(/[^a-z']/g, "");
    const punct = /[.,!?;:—–]$/.test(w);
    const left = words.length - i - 1;
    if (left === 0) break;
    if (left < min && cur.length + left <= max + 1) continue; // fold a tiny tail into this phrase
    if (cur.length >= min && punct) { out.push(cur); cur = []; continue; }
    if (cur.length >= max && !GLUE.has(bare)) { out.push(cur); cur = []; continue; }
    if (cur.length >= max + 2) { out.push(cur); cur = []; }
  }
  if (cur.length) {
    if (cur.length < 2 && out.length) out[out.length - 1]!.push(...cur);
    else out.push(cur);
  }
  return out.map((p) => p.join(" "));
}

/** One plan scene per spoken phrase; story fields stay on the first/last phrase so loops and the money shot are kept. */
export function splitInkBeats(scenes: PlanScene[]): PlanScene[] {
  const out: PlanScene[] = [];
  for (const sc of scenes) {
    const parts = inkPhrases(sc.narration);
    parts.forEach((narration, k) => out.push({
      ...sc,
      narration,
      camera: "hold",
      money: sc.money && k === 0,
      loop_opened: k === 0 ? sc.loop_opened : "",
      loop_closed: k === parts.length - 1 ? sc.loop_closed : "",
      sfx: k === 0 ? sc.sfx : "",
    }));
  }
  return out;
}
