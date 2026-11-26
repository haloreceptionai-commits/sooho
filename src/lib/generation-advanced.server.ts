import type { z } from 'zod';
import type { cartoonDirection } from './cartoon-job';
import { CARD_POSES, sanitizeDirection } from './cartoon-job';
import { ensureAnimalCast, paintedCastIds, placeObjectCards, OBJECT_PAINT_CAP, type PaintedCards } from './advanced-layout';
import { applyStaging } from './advanced-staging';
import { objectsToPaint } from './object-resolution';
import { BACKDROP_LAYERS, BACKDROP_PAINT_CAP, backdropBrief, worldPack } from './world-pack';
import { designAdvancedCardsOperation, directCartoonOperation, stageAdvancedDirectionOperation, paintAdvancedCardOperation, checkCardTextOperation } from './pipeline-operations.server';
import type { Settings } from './store';

type Direction = z.infer<typeof cartoonDirection>;
export interface GenerationMediaAPI {
  step<T>(key: string, identity: string, fn: () => Promise<T>): Promise<T>;
  save(name: string, base64: string, mime: string): Promise<string>;
  read(path: string): Promise<string>;
}
/** Existing Advanced operations and placement rules, with bounded serial, hash-fenced media checkpoints. */
export async function backgroundAdvanced(narration: string[], visuals: string[], settings: Settings, api: GenerationMediaAPI) {
  const raw = await api.step('advanced/director', JSON.stringify(visuals), () => directCartoonOperation({ data: { scenes: visuals, deployment: settings.scriptDeployment, format: 'short', advanced: true } }));
  let direction: Direction = ensureAnimalCast(raw, narration);
  const objects = direction.scenes.flatMap((s, scene) => (s.props ?? []).flatMap(p => p.asset?.startsWith('card/') ? [{ scene, id: p.asset.slice(5), phrase: (p.phrase ?? p.asset.slice(5)).slice(0, 200) }] : []));
  const staged = await api.step('advanced/staging', JSON.stringify(direction), () => stageAdvancedDirectionOperation({ data: { narration, cast: direction.cast.map(c => c.id), objects, actors: direction.scenes.map(s => (s.actors ?? []).map(a => a.actor)), deployment: settings.scriptDeployment } }));
  direction = applyStaging(direction, narration, staged);
  const painted: PaintedCards = { cards: [], objects: [], log: [] };
  const ids = paintedCastIds(direction.cast.map(c => c.id));
  if (ids.length) {
    const design = await api.step('advanced/animal-design', JSON.stringify({ ids, narration }), () => designAdvancedCardsOperation({ data: { scenes: narration, ids, deployment: settings.scriptDeployment } }));
    for (const id of ids) {
      const look = design.cards.find(c => c.id === id)?.look;
      if (!look) throw Error('Animal design is missing');
      const base = await api.step(`advanced/card/${id}`, look, async () => {
        const take = await paintAdvancedCardOperation({ data: { look, deployment: settings.imageDeployment } });
        return api.save(`card-${id}.png`, take.image, 'image/png');
      });
      painted.cards.push({ id, path: base });
      const reference = await api.read(base);
      for (const pose of CARD_POSES) {
        const path = await api.step(`advanced/card/${id}-${pose}`, `${look}:${base}:${pose}`, async () => {
          const take = await paintAdvancedCardOperation({ data: { look, pose, reference, deployment: settings.imageDeployment } });
          return api.save(`card-${id}-${pose}.png`, take.image, 'image/png');
        });
        painted.cards.push({ id: `${id}-${pose}`, path });
      }
    }
  }
  const variants = new Map<string, string>();
  for (const family of direction.families ?? []) for (const variant of family.variants) variants.set(variant.id, family.canonical);
  const wanted = objectsToPaint(direction.scenes);
  const ordered = [...wanted.filter(o => !variants.has(o.name)), ...wanted.filter(o => variants.has(o.name))];
  const accepted = new Map<string, string>();
  let objectPaints = 0;
  for (const object of ordered) {
    const canonical = variants.get(object.name), parentPath = canonical ? accepted.get(canonical) : undefined;
    const reference = parentPath ? await api.read(parentPath) : undefined;
    for (let attempt = 0; attempt < 2 && objectPaints < OBJECT_PAINT_CAP; attempt++) {
      objectPaints++;
      const path = await api.step(`advanced/object/${object.name}/${attempt}`, JSON.stringify({ look: object.look, parentPath, deployment: settings.imageDeployment }), async () => {
        const take = await paintAdvancedCardOperation({ data: { look: object.look.slice(0, 300), kind: 'object', deployment: settings.imageDeployment, ...(reference ? { reference } : {}) } });
        // The rejected first attempt is retained privately; only a checked final is used by the renderer.
        return api.save(`object-${object.name}-${attempt}.png`, take.image, 'image/png');
      });
      const image = await api.read(path);
      const verdict = await api.step(`advanced/object-check/${object.name}/${attempt}`, path, () => checkCardTextOperation({ data: { image, deployment: settings.scriptDeployment } }));
      if (verdict.text) { painted.log.push(`${object.name}: rejected lettering (${verdict.what})`); continue; }
      const final = await api.save(`card-obj-${object.name}.png`, image, 'image/png');
      painted.cards.push({ id: `obj-${object.name}`, path: final }); accepted.set(object.name, final);
      painted.objects.push({ name: object.name, scenes: object.scenes }); break;
    }
  }
  let backdropPaints = 0;
  const pack = worldPack(direction.scenes, narration);
  for (const place of pack.places) for (const layer of BACKDROP_LAYERS) {
    const id = `bg-${place.slug}-${layer}`, look = backdropBrief(place, pack.year, layer);
    for (let attempt = 0; attempt < 2 && backdropPaints < BACKDROP_PAINT_CAP; attempt++) {
      backdropPaints++;
      const path = await api.step(`advanced/backdrop/${id}/${attempt}`, look, async () => {
        const take = await paintAdvancedCardOperation({ data: { look, kind: `backdrop-${layer}`, deployment: settings.imageDeployment } });
        return api.save(`backdrop-${id}-${attempt}.png`, take.image, 'image/png');
      });
      const image = await api.read(path);
      const verdict = await api.step(`advanced/backdrop-check/${id}/${attempt}`, path, () => checkCardTextOperation({ data: { image, deployment: settings.scriptDeployment } }));
      if (verdict.text) { painted.log.push(`${id}: rejected lettering (${verdict.what})`); continue; }
      painted.cards.push({ id, path: await api.save(`card-${id}.png`, image, 'image/png') }); break;
    }
  }
  const sanitized = sanitizeDirection(direction, narration);
  const cardDirection = { ...sanitized, cast: sanitized.cast.map(c => { const { card: _old, ...rest } = c; return painted.cards.some(k => k.id === c.id) ? { ...rest, card: true } : rest; }) };
  const placed = placeObjectCards(cardDirection, painted);
  return { ...placed, log: painted.log };
}