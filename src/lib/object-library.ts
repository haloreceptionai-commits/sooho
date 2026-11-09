// Server-side search over the renderer's bundled CC0 object library (hosted-renderer/cartoon/assets/library).
// The Visual Director only ever sees a per-story shortlist, so it can pick from thousands of objects without inventing ids.
import catalog from '../../hosted-renderer/cartoon/assets/library/catalog.json';

export interface LibraryObject { id: string; pack: string; name: string; tags: string[]; h: number; type: 'model' | 'sprite'; clips?: string[] }
export const LIBRARY = catalog as LibraryObject[];
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'it', 'was', 'were', 'is', 'they', 'he', 'she', 'his', 'her', 'their', 'with', 'for', 'that', 'this', 'but', 'from', 'at', 'by', 'as', 'or', 'be', 'had', 'has', 'have', 'into', 'why', 'how', 'what', 'who']);
const stem = (w: string) => w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('s') && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;
export const words = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])\d+/g, '$1 ').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
const objectWords = (object: LibraryObject) => words(object.id.split('/')[1] ?? object.name);
const indexed = LIBRARY.map(object => ({ object, name: objectWords(object), tags: words(object.tags.join(' ')) }));
const VARIANT = new Set(['large', 'small', 'medium', 'big', 'low', 'poly', 'base', 'animated', 'rigged', 'animal']);
export function nameMatch(object: LibraryObject, text: string) {
  const query = new Set(words(text));
  const names = objectWords(object).filter(w => !VARIANT.has(w));
  return names.length > 0 && names.every(w => query.has(w));
}

/** Best matching objects for one sentence: name hits outrank topic-tag hits; ties prefer shorter (base) names. */
export function searchLibrary(text: string, limit = 10): LibraryObject[] {
  const q = new Set(words(text));
  if (!q.size) return [];
  const scored: [number, LibraryObject][] = [];
  for (const { object: o, name, tags } of indexed) {
    if (o.type !== 'model') continue; // Real 3D first; flat sprites are not substitutes for models.
    let s = 0;
    for (const w of q) { if (name.includes(w)) s += 10; else if (tags.includes(w)) s += .25; }
    if (s >= 10) scored.push([s + (nameMatch(o, text) ? 8 : 0) + (o.clips?.length ? 2 : 0) - name.length * .05, o]);
  }
  const ranked = scored.sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id));
  const out: LibraryObject[] = [], families = new Map<string, number>();
  for (const [, o] of ranked) {
    const family = objectWords(o).filter(w => !VARIANT.has(w)).join(' ');
    if ((families.get(family) ?? 0) >= 2) continue;
    families.set(family, (families.get(family) ?? 0) + 1); out.push(o);
    if (out.length >= Math.max(0, limit)) break;
  }
  return limit > 0 ? out : [];
}

/** Union of per-sentence matches, bounded so the Director's JSON schema stays small. */
export function shortlist(sentences: string[], cap = 120): LibraryObject[] {
  const out = new Map<string, LibraryObject>();
  const perScene = sentences.map(s => searchLibrary(s));
  // Round-robin prevents the opening scene consuming all available choices.
  for (let rank = 0; rank < 10 && out.size < cap; rank++) for (const choices of perScene) {
    const o = choices[rank]; if (o && out.size < cap) out.set(o.id, o);
  }
  return [...out.values()];
}
