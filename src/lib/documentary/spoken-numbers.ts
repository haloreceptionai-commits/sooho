// Reads numbers back out of narration. The narration is written the way a narrator says it ("thirty-seven thousand soldiers",
// "nineteen sixty-five"), so a number card is only ever drawn for a number that is really spoken, on the word where it is spoken.

const SMALL: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };
const ERA = /^(bc|bce|ad|ce)$/i;

export interface SpokenNumber { start: number; end: number; value: number; year: boolean; era?: string; text: string }

const clean = (w: string) => w.toLowerCase().replace(/[^a-z-]/g, '');
const parts = (w: string) => clean(w).split('-').filter(Boolean);
const isNumberPart = (p: string) => p in SMALL || p in TENS || p === 'hundred' || p in SCALE || p === 'oh';

/** Value of a run of number words ("two hundred and eighteen"), or null if the run is not a well-formed number. */
function parseRun(tokens: string[]): number | null {
  let total = 0, group = 0, low = 0, lowKind: 'none' | 'tens' | 'full' = 'none', hundred = false, seen = false;
  for (const t of tokens) {
    if (t === 'and' || (t === 'a' && !seen)) continue;
    if (t in SMALL) {
      const v = SMALL[t]!;
      if (lowKind === 'none') { low = v; lowKind = 'full'; }
      else if (lowKind === 'tens' && v >= 1 && v <= 9) { low += v; lowKind = 'full'; }
      else return null;
    } else if (t in TENS) {
      if (lowKind !== 'none') return null;
      low = TENS[t]!; lowKind = 'tens';
    } else if (t === 'hundred') {
      if (hundred || (lowKind !== 'none' && (low < 1 || low > 99))) return null;   // "fifteen hundred" = 1500 is allowed
      group = (lowKind === 'none' ? 1 : low) * 100; low = 0; lowKind = 'none'; hundred = true;
    } else if (t in SCALE) {
      const g = group + low;
      total += (g === 0 ? 1 : g) * SCALE[t]!;
      group = 0; low = 0; lowKind = 'none'; hundred = false;
    } else return null;
    seen = true;
  }
  return seen ? total + group + low : null;
}

function parseTwoDigits(tokens: string[]): number | null {
  if (tokens.length === 1 && tokens[0]! in SMALL) return SMALL[tokens[0]!]!;
  if (tokens.length === 1 && tokens[0]! in TENS) return TENS[tokens[0]!]!;
  if (tokens.length === 2 && tokens[0]! in TENS && tokens[1]! in SMALL && SMALL[tokens[1]!]! < 10 && SMALL[tokens[1]!]! > 0) return TENS[tokens[0]!]! + SMALL[tokens[1]!]!;
  if (tokens.length === 2 && tokens[0] === 'oh' && tokens[1]! in SMALL && SMALL[tokens[1]!]! > 0 && SMALL[tokens[1]!]! < 10) return SMALL[tokens[1]!]!;
  return null;
}

/** "nineteen sixty five", "eighteen eighty nine", "twenty twenty four": a year spoken as two pairs. */
function parseYear(tokens: string[], owner: number[]): number | null {
  if (tokens.length < 2 || owner[0] === owner[1]) return null;   // "twenty-one" is one word, never the year 2001
  const hi = tokens[0]!;
  const hiVal = hi in SMALL ? SMALL[hi]! : hi === 'twenty' ? 20 : null;
  if (hiVal === null || hiVal < 10 || hiVal > 20) return null;
  const lo = parseTwoDigits(tokens.slice(1));
  if (lo === null) return null;
  const year = hiVal * 100 + lo;
  return year >= 1100 && year <= 2099 ? year : null;
}

/** Every spoken number in a list of narration words, as word-index ranges with their value. */
export function findSpokenNumbers(words: string[]): SpokenNumber[] {
  const out: SpokenNumber[] = [];
  let i = 0;
  while (i < words.length) {
    const first = parts(words[i]!);
    if (!first.length || !first.every(isNumberPart) || (first.length === 1 && first[0] === 'oh')) { i++; continue; }
    // the longest run of number words, with "and" allowed inside and "a" in front of a scale word ("a hundred")
    const tokens: string[] = [], owner: number[] = [];
    let j = i;
    const back = i > 0 && clean(words[i - 1]!) === 'a' && first.length === 1 && (first[0] === 'hundred' || first[0]! in SCALE);
    while (j < words.length) {
      const p = parts(words[j]!);
      if (p.length && p.every(isNumberPart)) { tokens.push(...p); owner.push(...p.map(() => j)); }
      else if (clean(words[j]!) === 'and' && tokens.length && j + 1 < words.length && parts(words[j + 1]!).every(isNumberPart) && parts(words[j + 1]!).length && tokens.includes('hundred')) { tokens.push('and'); owner.push(j); }
      else break;
      j++;
      if (/[.!?,;:]$/.test(words[j - 1]!)) break;   // punctuation ends the number
    }
    let value: number | null = null, year = false;
    const yr = parseYear(tokens, owner);
    if (yr !== null && !tokens.some(t => t in SCALE || t === 'hundred')) { value = yr; year = true; }
    else value = parseRun(tokens);
    const start = back ? i - 1 : i;
    if (value !== null && value >= 0) {
      let end = j, era: string | undefined;
      const next = clean(words[j] ?? '');
      if (ERA.test(next)) { era = next.toUpperCase(); end = j + 1; }
      out.push({ start, end, value, year, era, text: words.slice(start, end).join(' ') });
    }
    i = Math.max(j, i + 1);
  }
  return out;
}

/** Number as drawn on a card: a year plain, anything else with thousands separators. */
export function cardValue(n: SpokenNumber): string {
  return n.year ? `${n.value}${n.era ? ` ${n.era}` : ''}` : n.value.toLocaleString('en-US');
}

const STOP = new Set('a an the of and or to in on at for with from by as is was were are be been it its they their his her this that these those who which had has have not no but'.split(' '));
/** The label a counter card shows: the word after the number that names the thing counted ("soldiers", "elephants"). */
export function labelAfter(words: string[], end: number): string {
  const w = (words[end] ?? '').replace(/[^A-Za-z'-]/g, '');
  if (!w || STOP.has(w.toLowerCase())) return '';
  return w;
}
