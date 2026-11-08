// Server-side search over the renderer's bundled CC0 object library (hosted-renderer/cartoon/assets/library).
// The Visual Director only ever sees a per-story shortlist, so it can pick from thousands of objects without inventing ids.
import catalog from '../../hosted-renderer/cartoon/assets/library/catalog.json';

export interface LibraryObject { id: string; pack: string; name: string; tags: string[]; h: number; type: 'model' | 'sprite' }
export const LIBRARY = catalog as LibraryObject[];
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'it', 'was', 'were', 'is', 'they', 'he', 'she', 'his', 'her', 'their', 'with', 'for', 'that', 'this', 'but', 'from', 'at', 'by', 'as', 'or', 'be', 'had', 'has', 'have', 'into', 'why', 'how', 'what', 'who']);
const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
export const words = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem);

/** Best matching objects for one sentence: name hits outrank topic-tag hits; ties prefer shorter (base) names. */
export function searchLibrary(text: string, limit = 10): LibraryObject[] {
  const q = new Set(words(text));
  if (!q.size) return [];
  const scored: [number, LibraryObject][] = [];
  for (const o of LIBRARY) {
    const name = o.name.split(' ').map(stem), tags = o.tags.map(stem);
    let s = 0;
    for (const w of q) { if (name.includes(w)) s += 3; else if (tags.includes(w)) s += 1; }
    if (s >= 3 || (s >= 2 && name.length <= 2)) scored.push([s - name.length * .05, o]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, o]) => o);
}

/** Union of per-sentence matches, bounded so the Director's JSON schema stays small. */
export function shortlist(sentences: string[], cap = 120): LibraryObject[] {
  const out = new Map<string, LibraryObject>();
  for (const s of sentences) for (const o of searchLibrary(s)) { if (out.size >= cap) break; out.set(o.id, o); }
  return [...out.values()];
}
