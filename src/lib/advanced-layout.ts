import animalVocab from '../../hosted-renderer/cartoon/blender/animals.json';
import type { z } from 'zod';
import type { cartoonDirection } from './cartoon-job';

type Direction = z.infer<typeof cartoonDirection>;
export interface PaintedObject { name: string; scenes: number[] }
export interface PaintedCards { cards: { id: string; path: string }[]; objects: PaintedObject[]; log: string[] }
export const OBJECT_PAINT_CAP = 8;
const animals: string[] = animalVocab.animals;
const plural: Record<string, string> = animalVocab.plural;
function animalIn(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const s = plural[w] ?? (animals.includes(w) ? w : w.replace(/(es|s)$/, ''));
  return animals.includes(s) ? s : animals.includes(w.replace(/s$/, '')) ? w.replace(/s$/, '') : null;
}
export const paintedCastIds = (ids: string[]) => ids.filter(id => id.split(/[_-]+/).some(w => animalIn(w)));

export function placeObjectCards(direction: Direction, painted: PaintedCards): { direction: Direction; cards: PaintedCards['cards'] } {
  const used = new Set<string>(), have = new Set(painted.cards.map(c => c.id));
  if (direction.scenes.some(sc => (sc.props ?? []).some(p => p.asset?.startsWith('card/')))) {
    const scenes = direction.scenes.map(sc => ({ ...sc, props: (sc.props ?? []).filter(p => {
      if (!p.asset?.startsWith('card/')) return true;
      const key = `obj-${p.asset.slice(5)}`;
      if (!have.has(key)) return false;
      used.add(key); return true;
    }) }));
    return { direction: { ...direction, scenes }, cards: painted.cards.filter(c => !c.id.startsWith('obj-') || used.has(c.id)) };
  }
  const scenes = direction.scenes.map((sc, i) => {
    const props = [...(sc.props ?? [])];
    for (const o of painted.objects) {
      if (!o.scenes.includes(i) || props.length >= 4 || props.some(p => p.asset === `card/${o.name}`)) continue;
      const place = props.some(p => p.place === 'ground_right') ? 'ground_left' : 'ground_right';
      if (props.some(p => p.place === place)) continue;
      props.push({ kind: 'asset', asset: `card/${o.name}`, place, motion: 'none' });
      used.add(`obj-${o.name}`);
    }
    return { ...sc, props };
  });
  return { direction: { ...direction, scenes }, cards: painted.cards.filter(c => !c.id.startsWith('obj-') || used.has(c.id)) };
}

export function ensureAnimalCast(direction: Direction, narration: string[]): Direction {
  const hits = new Map<string, number[]>();
  narration.forEach((line, i) => { for (const w of line.split(/\s+/)) { const a = animalIn(w); if (a) hits.set(a, [...new Set([...(hits.get(a) ?? []), i])]); } });
  const [animal, scenesWith] = [...hits.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  const first = direction.cast[0];
  if (!animal || !scenesWith || !first || direction.cast.some(c => c.id.includes(animal))) return direction;
  const uses = (id: string) => direction.scenes.filter(s => s.actor === id || (s.actors ?? []).some(a => a.actor === id)).length;
  let cast = [...direction.cast];
  let dropped: string | null = null;
  if (cast.length >= 4) {
    const least = [...cast].sort((a, b) => uses(a.id) - uses(b.id))[0];
    if (least) { dropped = least.id; cast = cast.filter(c => c.id !== least.id); }
  }
  const id = animal.replace(/[^a-z0-9_]/g, '').slice(0, 30);
  cast.push({ id, seed: 9000 + cast.length, outfit: first.outfit });
  const slots = ['left', 'center', 'right'] as const;
  const scenes = direction.scenes.map((sc, i) => {
    let actors = (sc.actors?.length ? sc.actors : [{ actor: sc.actor, action: sc.action, expression: sc.expression, slot: 'center' as const, facing: 0 }]).filter(a => a.actor !== dropped);
    let actor = sc.actor === dropped ? actors[0]?.actor ?? id : sc.actor;
    if (scenesWith.includes(i) && !actors.some(a => a.actor === id)) {
      if (actors.length >= 3) actors = actors.filter(a => a.actor === actor || a.actor === sc.speaker).slice(0, 2);
      const free = slots.find(s => !actors.some(a => a.slot === s)) ?? 'right';
      const moving = /\b(run|runs|ran|dash|dashes|bolt|bolts|chase|chases|flee|flees|race|races|charge|charges)\b/i.test(narration[i] ?? '');
      actors = [...actors, { actor: id, action: moving ? 'run' : 'idle', expression: 'grin', slot: free, facing: 0 }];
    }
    if (!actors.length) { actors = [{ actor: id, action: 'idle', expression: 'grin', slot: 'center', facing: 0 }]; actor = id; }
    const speaker = sc.speaker && actors.some(a => a.actor === sc.speaker) ? sc.speaker : undefined;
    return { ...sc, actor: actors.some(a => a.actor === actor) ? actor : actors[0]?.actor ?? id, actors, speaker };
  });
  return { cast, scenes };
}