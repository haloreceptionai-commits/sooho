/** Kid-level word checker for Advanced Video AI scripts: an 8-year-old should understand every narrated word. */
import { COMMON_WORDS } from "./plain-words.data";
import { hardWords } from "./sound-words";

const COMMON = new Set(COMMON_WORDS.split(" "));
// Frequent on the web but not in a child's vocabulary; each has a plain swap in KID_SWAPS.
const ADULT = new Set(("incident territory conflict negotiate negotiation diplomat diplomatic sovereignty authority military government " +
  "official officials dispute boundary escalate escalation tension tensions crisis treaty arbitration annex claim claims commander " +
  "settler settlers colonial colony empire imperial regime strategy tactic tactics significant approximately subsequently ultimately " +
  "eventually consequence consequences evidence phenomenon mechanism infrastructure resources economy economic population region " +
  "regional international national administration aggressive hostile hostility confrontation retaliate retaliation ultimatum " +
  "reinforcements garrison occupation occupy deploy deployed troops ammunition artillery vessel vessels massive ancient enormous " +
  "illusion conceal ingenious structure method process individual various primary previously currently furthermore however").split(" "));
export const KID_SWAPS: Record<string, string> = {
  boundary: "line between lands", dispute: "fight", escalate: "get worse", tension: "worry", crisis: "big problem", treaty: "deal",
  territory: "land", conflict: "fight", incident: "thing that happened", negotiate: "talk it out", diplomat: "peace talker",
  military: "army", government: "leaders", troops: "soldiers", vessel: "ship", massive: "huge", ancient: "very old",
  settler: "new farmer", commander: "boss", eventually: "in the end", ultimately: "in the end", evidence: "proof",
};

const clean = (w: string) => w.toLowerCase().replace(/[’']s$/, "").replace(/[^a-z-]/g, "");
/** Root forms tried for a word: plural, past tense, -ing, -ly, -er. */
const forms = (w: string) => [w, w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, ""), w.replace(/ied$/, "y"), w.replace(/ed$/, ""), w.replace(/d$/, ""),
  w.replace(/ing$/, ""), w.replace(/ing$/, "e"), w.replace(/([a-z])\1ing$/, "$1"), w.replace(/([a-z])\1ed$/, "$1"), w.replace(/ly$/, ""), w.replace(/er$/, ""), w.replace(/est$/, "")];

/** Narrated words a young child would not know. `allow` holds story names, places and anchors, which stay. */
export function rareWords(text: string, allow: string[] = []): string[] {
  const ok = new Set(allow.flatMap(a => a.split(/[\s-]+/)).map(clean).filter(Boolean));
  const fancy = new Set(hardWords(text).map(clean));
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const w = clean(raw);
    if (!w || /^[a-z]$/.test(w) || ok.has(w) || ok.has(w.replace(/s$/, ""))) continue;
    if (w.includes("-")) { out.push(...rareWords(w.replace(/-/g, " "), allow)); continue; }
    const f = forms(w);
    const adult = f.some(x => ADULT.has(x)), known = f.some(x => COMMON.has(x));
    if (adult || (!known && (fancy.has(w) || w.length >= 5))) out.push(w);
  }
  return [...new Set(out)];
}

/** Share of narrated words a young child knows, 0-100. */
export function kidReadability(text: string, allow: string[] = []): number {
  const words = text.split(/\s+/).map(clean).filter(Boolean);
  if (!words.length) return 100;
  const rare = new Set(rareWords(text, allow));
  return Math.round(100 * words.filter(w => !rare.has(w)).length / words.length);
}

/** Narration word budget the voice can say in the requested length (~2.6 words a second). */
export const wordBudget = (durationSec: number) => Math.round(durationSec * 2.6);
