/**
 * Advanced Video AI painted cards (browser stage): one standing card per cast member, three matching poses painted
 * from it, and up to three story objects. Every file is saved under the video's media folder as soon as it is made,
 * so Resume never repays for finished cards.
 */
import { supabase } from "@/integrations/supabase/client";
import { designAdvancedCards, paintAdvancedCard } from "@/lib/pipeline.functions";
import { CARD_POSES, type cartoonDirection } from "@/lib/cartoon-job";
import type { z } from "zod";

type Direction = z.infer<typeof cartoonDirection>;
type Retry = <T>(fn: () => Promise<T>) => Promise<T>;
export interface PaintedObject { name: string; scenes: number[] }
export interface PaintedCards { cards: { id: string; path: string }[]; objects: PaintedObject[] }
interface Design { cards: { id: string; look: string }[]; objects: (PaintedObject & { look: string })[] }

const toBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const toB64 = async (blob: Blob) => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

export async function paintAdvancedCards(direction: Direction, narration: string[], root: string, settings: { scriptDeployment: string; imageDeployment: string }, report: (detail: string) => void, retry: Retry = fn => fn()): Promise<PaintedCards> {
  const ids = direction.cast.map(c => c.id);
  const bucket = supabase.storage.from("videos");
  const save = async (name: string, body: Blob | Uint8Array, type: string) => {
    const { error } = await bucket.upload(`${root}/${name}`, body, { contentType: type, upsert: false });
    if (error && !/exists|duplicate/i.test(error.message)) throw Error(`Could not save painted card: ${error.message}`);
  };
  const { data: listed } = await bucket.list(root, { search: "card", limit: 200 });
  const have = new Set((listed ?? []).map(f => f.name));
  // The design is saved too, so a resumed job paints the same characters and objects.
  let design: Design | null = null;
  if (have.has("cards.json")) {
    const { data } = await bucket.download(`${root}/cards.json`);
    if (data) design = JSON.parse(await data.text()) as Design;
  }
  if (!design || ids.some(i => !design!.cards.some(c => c.id === i))) {
    report("Designing the characters and story objects…");
    const scenes = narration.map((t, i) => { const sc = direction.scenes[i]; return `${t} [actors: ${(sc?.actors ?? []).map(a => a.actor).join(", ") || sc?.actor || ids[0]}; props: ${(sc?.props ?? []).map(p => p.asset || p.kind).join(", ") || "none"}]`; });
    design = await retry(() => designAdvancedCards({ data: { scenes, ids, deployment: settings.scriptDeployment } }));
    await bucket.upload(`${root}/cards.json`, new Blob([JSON.stringify(design)], { type: "application/json" }), { contentType: "application/json", upsert: true });
  }
  const d = design;
  const total = ids.length * (1 + CARD_POSES.length) + d.objects.length;
  let done = [...have].filter(n => n.startsWith("card-")).length;
  const tick = () => report(`Painting characters, poses and objects · ${Math.min(total, ++done)}/${total} while the voice records…`);
  report(`Painting characters, poses and objects · ${Math.min(total, done)}/${total} while the voice records…`);
  const cards: { id: string; path: string }[] = [];
  await Promise.all([
    ...ids.map(async cid => {
      const look = d.cards.find(c => c.id === cid)!.look;
      let base: string;
      if (have.has(`card-${cid}.png`)) {
        const { data } = await bucket.download(`${root}/card-${cid}.png`);
        if (!data) throw Error("Saved character card could not be opened");
        base = await toB64(data);
      } else {
        base = (await retry(() => paintAdvancedCard({ data: { look, deployment: settings.imageDeployment } }))).image;
        await save(`card-${cid}.png`, toBytes(base), "image/png"); tick();
      }
      cards.push({ id: cid, path: `${root}/card-${cid}.png` });
      await Promise.all(CARD_POSES.map(async pose => {
        const key = `${cid}-${pose}`;
        if (!have.has(`card-${key}.png`)) {
          // A pose that fails is skipped: the renderer falls back to the standing card.
          const r = await retry(() => paintAdvancedCard({ data: { look, pose, reference: base, deployment: settings.imageDeployment } })).catch((e: unknown) => { console.warn("Pose skipped:", key, e); return null; });
          if (!r) return;
          await save(`card-${key}.png`, toBytes(r.image), "image/png"); tick();
        }
        cards.push({ id: key, path: `${root}/card-${key}.png` });
      }));
    }),
    ...d.objects.map(async o => {
      const key = `obj-${o.name}`;
      if (!have.has(`card-${key}.png`)) {
        const r = await retry(() => paintAdvancedCard({ data: { look: o.look, kind: "object", deployment: settings.imageDeployment } })).catch((e: unknown) => { console.warn("Object skipped:", key, e); return null; });
        if (!r) return;
        await save(`card-${key}.png`, toBytes(r.image), "image/png"); tick();
      }
      cards.push({ id: key, path: `${root}/card-${key}.png` });
    }),
  ]);
  const painted = new Set(cards.map(c => c.id));
  return { cards: cards.sort((a, b) => a.id.localeCompare(b.id)), objects: d.objects.filter(o => painted.has(`obj-${o.name}`)).map(({ name, scenes }) => ({ name, scenes })) };
}

/** Puts each painted story object into the scenes where it is said (on the ground beside the cast) and keeps only cards in use. */
export function placeObjectCards(direction: Direction, painted: PaintedCards): { direction: Direction; cards: PaintedCards["cards"] } {
  const used = new Set<string>();
  const scenes = direction.scenes.map((sc, i) => {
    const props = [...(sc.props ?? [])];
    for (const o of painted.objects) {
      if (!o.scenes.includes(i) || props.length >= 4 || props.some(p => p.asset === `card/${o.name}`)) continue;
      const place = props.some(p => p.place === "ground_right") ? "ground_left" : "ground_right";
      if (props.some(p => p.place === place)) continue;
      props.push({ kind: "asset", asset: `card/${o.name}`, place, motion: "none" });
      used.add(`obj-${o.name}`);
    }
    return { ...sc, props };
  });
  return { direction: { ...direction, scenes }, cards: painted.cards.filter(c => !c.id.startsWith("obj-") || used.has(c.id)) };
}
