// Word-triggered sound effects and plain-English helpers (pure, shared by renderer, quality checks and tests).

/** Spoken word stem -> sound effect played right as the narrator says it. */
const SOUND_WORDS: [RegExp, string][] = [
  [/^(spray|sprays|sprayed|spraying|spritz|squirt|squirts|hiss|hisses|fizz|fizzes)$/, "spray"],
  [/^(splash|splashes|splashed|splashing|dunk|dunks)$/, "splash"],
  [/^(pour|pours|poured|pouring|drip|drips|dripping)$/, "pour"],
  [/^(wave|waves|surf)$/, "wave"],
  [/^(crash|crashes|crashed|smash|smashes|smashed|slam|slams|slammed|shatter|shatters)$/, "crash"],
  [/^(boom|booms|bang|bangs|blast|blasts|explodes|explosion|cannon|cannons)$/, "boom"],
  [/^(thunder|thunders|lightning)$/, "thunder"],
  [/^(crack|cracks|cracked|snap|snaps|snapped|click|clicks|pop|pops)$/, "snap"],
  [/^(creak|creaks|creaking|groan|groans)$/, "creak"],
  [/^(fire|fires|flame|flames|burn|burns|burning|blaze)$/, "fire"],
  [/^(wind|winds|gust|gusts|storm|storms)$/, "wind"],
  [/^(clang|clangs|bell|bells|hammer|hammers|sword|swords|chain|chains)$/, "clang"],
  [/^(coin|coins|gold|money|treasure)$/, "coin"],
  [/^(heart|heartbeat|heartbeats)$/, "heartbeat"],
  [/^(crowd|crowds|cheer|cheers|laugh|laughs|laughing|shout|shouts|screams?)$/, "crowd"],
  [/^(whoosh|zoom|zooms|swoosh|flies|rushes)$/, "whoosh"],
];

const clean = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");

/** Which sound a spoken word should trigger, or null. */
export function soundForWord(word: string): string | null {
  const w = clean(word);
  if (!w) return null;
  for (const [re, kind] of SOUND_WORDS) if (re.test(w)) return kind;
  return null;
}

/** Picks word-sound hits, at most one per `gap` seconds, so the mix never turns into noise. */
export function wordSoundCues(words: { text: string; t0: number }[], gap = 1.2): { at: number; kind: string }[] {
  const out: { at: number; kind: string }[] = [];
  let last = -Infinity;
  for (const w of words) {
    const kind = soundForWord(w.text);
    if (kind && w.t0 - last >= gap) { out.push({ at: w.t0, kind }); last = w.t0; }
  }
  return out;
}

/** Rough syllable count for plain-English checks. */
export function syllables(word: string): number {
  let w = clean(word);
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) ?? []).length);
}

/** Words a young kid would struggle with: 4+ syllables, or 3 syllables and 10+ letters. */
export function hardWords(text: string): string[] {
  return text.split(/\s+/).map(clean).filter((w) => w && (syllables(w) >= 4 || (syllables(w) >= 3 && w.length >= 10)));
}
