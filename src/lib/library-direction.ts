import { nameMatch, searchLibrary, type LibraryObject } from './object-library';
import type { DirectedScene } from './cinematic-pass';

/** Conservative scene grounding: only exact named models from the approved shortlist.
 * Keep held props, faithful built-ins and existing choices; never invent ids or add a new gate. */
export function groundLibraryScenes<T extends DirectedScene>(scenes: T[], narration: string[], available: LibraryObject[]): T[] {
  const allowed = new Set(available.map(o => o.id));
  const selected = new Set<string>();
  return scenes.map((scene, i) => {
    const text = narration[i] ?? '';
    const props = [...(scene.props ?? [])];
    const candidates = searchLibrary(text, 12).filter(o => allowed.has(o.id) && nameMatch(o, text));
    const candidate = candidates.find(o => props.some(p => p.asset === o.id)) ?? candidates[0];
    // Existing exact representation is preferable to arbitrary variety.
    const represented = candidate && props.some(p => p.asset === candidate.id || nameMatch({ ...candidate, name: p.kind.replace(/_/g, ' ') }, text) && p.kind !== 'asset');
    if (candidate && !represented && (selected.has(candidate.id) || selected.size < 12)) {
      selected.add(candidate.id);
      const motion = candidate.clips?.length && /\b(walk\w*|run\w*|chase\w*|hunt\w*)\b/i.test(text) ? 'approach' : 'none';
      const prop = { kind: 'asset', asset: candidate.id, place: 'ground_right', motion };
      // Preserve hand mechanics and every intentional prop; append only within supported limits.
      if (props.length < 4) props.unshift(prop);
    }
    return { ...scene, props };
  });
}