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

const ANIMALS = ("pig cow horse sheep goat duck hen chicken rooster dog cat mouse rat rabbit fox wolf bear lion tiger monkey ape frog fish shark whale dolphin " +
  "bird owl crow raven eagle hawk parrot penguin pigeon goose swan snake lizard turtle tortoise crocodile alligator deer moose elk camel elephant zebra giraffe " +
  "donkey mule ox bull buffalo bison emu ostrich kangaroo koala seal walrus crab octopus squid bee ant spider beetle bat hippo rhino llama yak").split(" ");
const PLURAL: Record<string, string> = { geese: "goose", mice: "mouse", oxen: "ox", sheep: "sheep", fish: "fish", deer: "deer", moose: "moose", wolves: "wolf", calves: "cow" };
const animalIn = (word: string) => { const w = word.toLowerCase().replace(/[^a-z]/g, ""); const s = PLURAL[w] ?? (ANIMALS.includes(w) ? w : w.replace(/(es|s)$/, "")); return ANIMALS.includes(s) ? s : (ANIMALS.includes(w.replace(/s$/, "")) ? w.replace(/s$/, "") : null); };

/**
 * The story's animal must act on screen: when the narration names an animal the Visual Director left out of the cast,
 * it joins the cast (replacing the least-used extra if four are already cast) and appears in every scene that names it.
 */
export function ensureAnimalCast(direction: Direction, narration: string[]): Direction {
  const hits = new Map<string, number[]>();
  narration.forEach((line, i) => { for (const w of line.split(/\s+/)) { const a = animalIn(w); if (a) hits.set(a, [...new Set([...(hits.get(a) ?? []), i])]); } });
  const [animal, scenesWith] = [...hits.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!animal || !scenesWith || direction.cast.some(c => c.id.includes(animal))) return direction;
  const uses = (id: string) => direction.scenes.filter(s => s.actor === id || (s.actors ?? []).some(a => a.actor === id)).length;
  let cast = [...direction.cast];
  let dropped: string | null = null;
  if (cast.length >= 4) { const least = [...cast].sort((a, b) => uses(a.id) - uses(b.id))[0]!; dropped = least.id; cast = cast.filter(c => c.id !== least.id); }
  const id = animal.replace(/[^a-z0-9_]/g, "").slice(0, 30);
  cast.push({ id, seed: 9000 + cast.length, outfit: direction.cast[0]!.outfit });
  const slots = ["left", "center", "right"] as const;
  const scenes = direction.scenes.map((sc, i) => {
    let actors = (sc.actors?.length ? sc.actors : [{ actor: sc.actor, action: sc.action, expression: sc.expression, slot: "center" as const, facing: 0 }]).filter(a => a.actor !== dropped);
    let actor = sc.actor === dropped ? (actors[0]?.actor ?? id) : sc.actor;
    if (scenesWith.includes(i) && !actors.some(a => a.actor === id)) {
      if (actors.length >= 3) actors = actors.filter(a => a.actor === actor || a.actor === sc.speaker).slice(0, 2);
      const free = slots.find(s => !actors.some(a => a.slot === s)) ?? "right";
      const moving = /\b(run|runs|ran|dash|dashes|bolt|bolts|chase|chases|flee|flees|race|races|charge|charges)\b/i.test(narration[i] ?? "");
      actors = [...actors, { actor: id, action: moving ? "run" : "idle", expression: "grin", slot: free, facing: 0 }];
    }
    if (!actors.length) { actors = [{ actor: id, action: "idle", expression: "grin", slot: "center", facing: 0 }]; actor = id; }
    const speaker = sc.speaker && actors.some(a => a.actor === sc.speaker) ? sc.speaker : undefined;
    return { ...sc, actor: actors.some(a => a.actor === actor) ? actor : actors[0]!.actor, actors, speaker };
  });
  return { cast, scenes };
}
