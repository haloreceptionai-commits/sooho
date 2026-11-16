// Advanced Video AI object resolution (owner rule, Nov 16 2026): every on-screen object is defined by a descriptive phrase
// from the shot ("huge riveted steel molasses storage tank, 1919"). A built-in model or prop is used only when the WHOLE phrase
// matches it; otherwise the object becomes a painted card. A keyword such as "tank" never selects a model on its own.
import { LIBRARY, nameMatch, words, type LibraryObject } from './object-library';

export type ObjectSize = 'small' | 'medium' | 'large' | 'huge';
export interface ShotObject { id: string; phrase: string; size: ObjectSize }
type Prop = { kind: string; place: string; motion: string; asset?: string | undefined; phrase?: string | undefined; size?: ObjectSize | undefined };
type Scene = { props?: Prop[] | undefined; objects?: ShotObject[] | undefined; location?: string | undefined; [k: string]: unknown };
export interface MissingObject { scene: number; phrase: string; reason: string }

// Size/era/filler words describe an object but never decide which model it is.
const FILLER = new Set(['huge', 'big', 'large', 'small', 'tiny', 'giant', 'massive', 'enormous', 'tall', 'short', 'long', 'wide', 'high', 'full', 'half',
  'old', 'new', 'early', 'late', 'century', 'era', 'style', 'period', 'nearby', 'very', 'one', 'two', 'three', 'single', 'pair', 'some', 'many', 'its',
  'feet', 'foot', 'metre', 'meter', 'storey', 'story', 'like', 'shaped', 'type', 'kind', 'sort', 'piece', 'bit', 'part', 'set']).add('stood');
export const phraseWords = (phrase: string) => [...new Set(words(phrase).filter(w => !FILLER.has(w)))];

/** True only when every descriptive word of the phrase is covered by the model's own name or tags. */
export function fullPhraseMatch(object: LibraryObject, phrase: string): boolean {
  const need = phraseWords(phrase);
  if (!need.length || !nameMatch(object, phrase)) return false;
  const have = new Set([...words(object.id.split('/')[1] ?? ''), ...words(object.name), ...words(object.tags.join(' '))]);
  return need.every(w => have.has(w));
}
/** Built-in vocabulary props (barrel, letter, clock...) follow the same whole-phrase rule. */
export function builtInMatches(kind: string, phrase: string): boolean {
  const need = phraseWords(phrase); const have = new Set(words(kind.replace(/_/g, ' ')));
  return need.length > 0 && need.every(w => have.has(w));
}
// Painted cards cannot carry readable text, and people are never painted objects (owner rule), so these phrases are logged, not drawn.
const TEXTUAL = /\b(caption\w*|label\w*|reading|marked|sign|signs|signage|text|letters?|words?|headline\w*|banner|graphic\w*|symbol\w*|diagram\w*|chart\w*|icon\w*|question mark|arrow|editorial|illustrative|overlay|title card)\b|["“”']\s*[A-Z]{2,}|\b[A-Z]{3,}\b/;
const PEOPLE = /\b(person|people|man|men|woman|women|child|children|figure\w*|rescuers?|workers?|crowd\w*|soldiers?|judge|auditor|owner|portrait|silhouette of a (man|woman|person))\b/i;
export function unpaintable(phrase: string): string | null {
  if (TEXTUAL.test(phrase)) return 'text or graphic, not a physical object';
  if (PEOPLE.test(phrase)) return 'a person, not an object';
  return null;
}
export const objectSlug = (id: string) => id.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

/**
 * Turns each scene's descriptive objects into props: a whole-phrase library/built-in match, else a painted card `card/<id>`.
 * Director-chosen library models and built-in props survive only if a phrase in the same scene fully matches them.
 * `maxCards` bounds paid paintings; anything beyond it is logged as missing instead of substituted.
 */
export function resolveSceneObjects<T extends Scene>(scenes: T[], maxCards = 8, library: LibraryObject[] = LIBRARY): { scenes: T[]; missing: MissingObject[] } {
  const byId = new Map(library.map(o => [o.id, o]));
  const cardIds = new Map<string, string>(); // object id -> phrase used for its painting (first, most descriptive mention)
  const missing: MissingObject[] = [];
  for (const s of scenes) for (const o of s.objects ?? []) {
    const id = objectSlug(o.id || o.phrase); const p = String(o.phrase ?? '').trim();
    if (id && p && (!cardIds.has(id) || p.length > (cardIds.get(id) ?? '').length)) cardIds.set(id, p);
  }
  // Objects that recur across more scenes are painted first; the same physical object keeps one card.
  const uses = new Map<string, number>();
  for (const s of scenes) for (const id of new Set((s.objects ?? []).map(o => objectSlug(o.id || o.phrase)))) if (id) uses.set(id, (uses.get(id) ?? 0) + 1);
  const ranked = [...uses.keys()].filter(id => !unpaintable(cardIds.get(id) ?? '')).sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0));
  const allowedCards = new Set(ranked.slice(0, Math.max(0, maxCards)));
  const nameWords = (id: string) => phraseWords(id.replace(/_/g, ' '));
  const out = scenes.map((s, i) => {
    const objs = (s.objects ?? []).map(o => ({ id: objectSlug(o.id || o.phrase), phrase: String(o.phrase ?? '').trim().slice(0, 160), size: o.size }))
      .filter(o => o.id && o.phrase).filter(o => { const why = unpaintable(o.phrase); if (why) missing.push({ scene: i, phrase: o.phrase, reason: why }); return !why; })
      .map(o => {
        // A new id naming an already-painted object ("steel tank wall tearing" -> molasses_tank) reuses that card.
        if (allowedCards.has(o.id)) return o;
        const pw = new Set(phraseWords(o.phrase));
        const same = [...allowedCards].find(id => nameWords(id).length > 0 && nameWords(id).every(w => pw.has(w)));
        return same ? { ...o, id: same } : o;
      })
      .filter((o, k, a) => a.findIndex(x => x.id === o.id) === k).slice(0, 3);
    const phrases = objs.map(o => o.phrase);
    const kept = (s.props ?? []).filter(p => {
      if (p.kind === 'asset' && p.asset?.startsWith('card/')) return false; // re-derived below from phrases
      if (p.kind === 'asset') { const o = p.asset ? byId.get(p.asset) : undefined; return !!o && phrases.some(ph => fullPhraseMatch(o, ph)); }
      return phrases.some(ph => builtInMatches(p.kind, ph));
    });
    const props: Prop[] = [];
    let side = 0;
    for (const o of objs) {
      if (props.length >= 4) break;
      const model = library.find(m => m.type === 'model' && fullPhraseMatch(m, o.phrase));
      const place = o.size === 'huge' || o.size === 'large' ? 'background' : (side++ % 2 ? 'ground_left' : 'ground_right');
      if (model) { props.push({ kind: 'asset', asset: model.id, place, motion: 'none', phrase: o.phrase, size: o.size }); continue; }
      const builtIn = kept.find(p => p.kind !== 'asset' && builtInMatches(p.kind, o.phrase));
      if (builtIn) { props.push({ ...builtIn, phrase: o.phrase, size: o.size }); continue; }
      if (!allowedCards.has(o.id)) { missing.push({ scene: i, phrase: o.phrase, reason: 'painted object limit reached' }); continue; }
      props.push({ kind: 'asset', asset: `card/${o.id}`, place, motion: 'none', phrase: cardIds.get(o.id) ?? o.phrase, size: o.size });
    }
    for (const p of kept) if (props.length < 4 && !props.some(q => q === p || (q.asset && q.asset === p.asset) || (!q.asset && q.kind === p.kind))) props.push(p);
    const { objects: _drop, ...rest } = s;
    return { ...rest, props } as unknown as T;
  });
  return { scenes: out, missing };
}

/** Painted object cards a resolved direction needs: id, the phrase to paint, and the scenes it appears in. */
export function objectsToPaint(scenes: { props?: Prop[] | undefined }[]): { name: string; look: string; scenes: number[] }[] {
  const m = new Map<string, { name: string; look: string; scenes: number[] }>();
  scenes.forEach((s, i) => (s.props ?? []).forEach(p => {
    if (p.kind !== 'asset' || !p.asset?.startsWith('card/')) return;
    const name = p.asset.slice(5); const e = m.get(name) ?? { name, look: p.phrase ?? name.replace(/_/g, ' '), scenes: [] };
    if (!e.scenes.includes(i)) e.scenes.push(i); m.set(name, e);
  }));
  return [...m.values()];
}
