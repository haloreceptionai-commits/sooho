/**
 * Advanced Video AI painted cards (browser stage). People are drawn as 3D figures, so only animal cast members get
 * painted cards (standing + three poses). Story objects get one canonical card each; state variants (leaking, failing,
 * burst) are painted FROM the canonical card so they read as the same object. Every object card passes a no-text check
 * (one regeneration, then it is logged as missing), and paid object paintings are capped at 8 per video.
 * Every file is saved under the video's media folder as soon as it is made, so Resume never repays for finished cards.
 */
import { supabase } from "@/integrations/supabase/client";
import animalVocab from "../../hosted-renderer/cartoon/animals.json";
import { checkCardText, designAdvancedCards, paintAdvancedCard } from "@/lib/pipeline.functions";
import { CARD_POSES, type cartoonDirection } from "@/lib/cartoon-job";
import type { z } from "zod";
import { objectsToPaint } from "@/lib/object-resolution";
import { BACKDROP_LAYERS, BACKDROP_PAINT_CAP, backdropBrief, worldPack, yearLabel } from "@/lib/world-pack";

type Direction = z.infer<typeof cartoonDirection>;
type Retry = <T>(fn: () => Promise<T>) => Promise<T>;
export interface PaintedObject { name: string; scenes: number[] }
export interface PaintedCards { cards: { id: string; path: string }[]; objects: PaintedObject[]; log: string[] }
interface Design { cards: { id: string; look: string }[]; objects: (PaintedObject & { look: string })[] }
interface ObjectChecks { paid: number; backdropsPaid?: number; objects: Record<string, { ok: boolean; what?: string; from?: string }>; log: string[] }
export const OBJECT_PAINT_CAP = 8;

const toBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const toB64 = async (blob: Blob) => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
/** Cast ids that are animals or creatures: the only cast members drawn from painted cards. */
export const paintedCastIds = (ids: string[]) => ids.filter(id => id.split(/[_-]+/).some(w => animalIn(w)));

export async function paintAdvancedCards(direction: Direction, narration: string[], root: string, settings: { scriptDeployment: string; imageDeployment: string }, report: (detail: string) => void, retry: Retry = fn => fn()): Promise<PaintedCards> {
  const ids = paintedCastIds(direction.cast.map(c => c.id));
  const bucket = supabase.storage.from("videos");
  const save = async (name: string, body: Blob | Uint8Array, type: string, upsert = false) => {
    const { error } = await bucket.upload(`${root}/${name}`, body, { contentType: type, upsert });
    if (error && !/exists|duplicate/i.test(error.message)) throw Error(`Could not save painted card: ${error.message}`);
  };
  const { data: listed } = await bucket.list(root, { search: "card", limit: 200 });
  const have = new Set((listed ?? []).map(f => f.name));
  const readJson = async <T,>(name: string): Promise<T | null> => { if (!have.has(name)) return null; const { data } = await bucket.download(`${root}/${name}`); return data ? JSON.parse(await data.text()) as T : null; };
  const checks: ObjectChecks = (await readJson<ObjectChecks>("cards-objects.json")) ?? { paid: 0, objects: {}, log: [] };
  const saveChecks = () => bucket.upload(`${root}/cards-objects.json`, new Blob([JSON.stringify(checks)], { type: "application/json" }), { contentType: "application/json", upsert: true });
  const note = (line: string) => { checks.log.push(line.slice(0, 240)); console.info("Object card:", line); };
  // At most 5 paintings at once: the Azure image quota rejects bigger bursts (seen as 429 errors in testing).
  let active = 0; const queue: (() => void)[] = [];
  const limit = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (active >= 5) await new Promise<void>(r => queue.push(r));
    active++;
    try { return await fn(); } finally { active--; queue.shift()?.(); }
  };
  const cards: { id: string; path: string }[] = [];
  // --- animal cast cards (people are 3D figures: no character paintings until the Stage 3 A/B test)
  if (ids.length) {
    let design = await readJson<Design>("cards.json");
    if (!design || ids.some(i => !design?.cards.some(c => c.id === i))) {
      report("Designing the animal characters…");
      const scenes = narration.map((t, i) => { const sc = direction.scenes[i]; return `${t} [actors: ${(sc?.actors ?? []).map(a => a.actor).join(", ") || sc?.actor || ids[0]}]`; });
      design = await retry(() => designAdvancedCards({ data: { scenes, ids, deployment: settings.scriptDeployment } }));
      await bucket.upload(`${root}/cards.json`, new Blob([JSON.stringify(design)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    }
    const d = design;
    await Promise.all(ids.map(async cid => {
      const look = d.cards.find(c => c.id === cid)?.look;
      if (!look) throw Error("Character design is missing");
      let base: string;
      if (have.has(`card-${cid}.png`)) {
        const { data } = await bucket.download(`${root}/card-${cid}.png`);
        if (!data) throw Error("Saved character card could not be opened");
        base = await toB64(data);
      } else {
        base = (await limit(() => retry(() => paintAdvancedCard({ data: { look, deployment: settings.imageDeployment } })))).image;
        await save(`card-${cid}.png`, toBytes(base), "image/png");
      }
      cards.push({ id: cid, path: `${root}/card-${cid}.png` });
      await Promise.all(CARD_POSES.map(async pose => {
        const key = `${cid}-${pose}`;
        if (!have.has(`card-${key}.png`)) {
          // A pose that fails is skipped: the renderer falls back to the standing card.
          const r = await limit(() => retry(() => paintAdvancedCard({ data: { look, pose, reference: base, deployment: settings.imageDeployment } }))).catch((e: unknown) => { console.warn("Pose skipped:", key, e); return null; });
          if (!r) return;
          await save(`card-${key}.png`, toBytes(r.image), "image/png");
        }
        cards.push({ id: key, path: `${root}/card-${key}.png` });
      }));
    }));
  }
  // --- story objects: canonical first, then variants painted from it
  const objects = objectsToPaint(direction.scenes);
  const variantOf = new Map<string, string>();
  for (const f of direction.families ?? []) for (const v of f.variants) variantOf.set(v.id, f.canonical);
  const finals = new Map<string, string>(), repainted = new Set<string>();
  let done = 0;
  const tick = () => report(`Painting story objects · ${Math.min(objects.length, ++done)}/${objects.length} while the voice records…`);
  report(`Painting story objects · 0/${objects.length} while the voice records…`);
  const paidPaint = async (o: { name: string; look: string }, reference?: string) => {
    if (checks.paid >= OBJECT_PAINT_CAP) { note(`${o.name}: not painted, the limit of ${OBJECT_PAINT_CAP} paid object paintings for this video is reached`); return null; }
    checks.paid++; await saveChecks();
    const r = await limit(() => retry(() => paintAdvancedCard({ data: { look: o.look.slice(0, 300), kind: "object", deployment: settings.imageDeployment, ...(reference ? { reference } : {}) } }))).catch((e: unknown) => { note(`${o.name}: painting failed (${e instanceof Error ? e.message : "error"})`); return null; });
    return r?.image ?? null;
  };
  const textFree = async (name: string, b64: string) => {
    const v = await retry(() => checkCardText({ data: { image: b64, deployment: settings.scriptDeployment } }));
    if (v.text) note(`${name}: rejected, the picture contains text (${v.what || "lettering"})`);
    return !v.text;
  };
  const one = async (o: { name: string; look: string }) => {
    const canonical = variantOf.get(o.name);
    const reference = canonical ? finals.get(canonical) : undefined;
    const rec = checks.objects[o.name];
    const file = `card-obj-${o.name}.png`;
    // A saved card is reused unless it failed the text check before or is a variant not yet painted from its canonical.
    const stale = !!reference && (rec?.from !== canonical || repainted.has(canonical!));
    let b64: string | null = null, fresh = false;
    if (have.has(file) && !stale && rec?.ok !== false) {
      const { data } = await bucket.download(`${root}/${file}`);
      if (data) b64 = await toB64(data);
    } else if (stale && have.has(file)) note(`${o.name}: repainted from ${canonical} so it is the same object (${(direction.families ?? []).find(f => f.canonical === canonical)?.variants.find(v => v.id === o.name)?.state ?? "variant"})`);
    if (!b64) { b64 = await paidPaint(o, reference); fresh = true; }
    let ok = !!b64 && await textFree(o.name, b64);
    if (b64 && !ok) {
      // One regeneration after a text rejection, then the object is logged as missing (never shown with lettering).
      b64 = await paidPaint(o, reference); fresh = true;
      ok = !!b64 && await textFree(o.name, b64);
      if (!ok) note(`${o.name}: missing, still not clean after one regeneration`);
    }
    checks.objects[o.name] = { ok, ...(canonical && reference ? { from: canonical } : {}) };
    if (ok && b64) {
      if (fresh) { await save(file, toBytes(b64), "image/png", true); repainted.add(o.name); }
      finals.set(o.name, b64); cards.push({ id: `obj-${o.name}`, path: `${root}/${file}` });
      if (fresh) note(`${o.name}: painted${canonical && reference ? ` from ${canonical}` : ""}, no text`); else note(`${o.name}: reused saved card, no text`);
    }
    await saveChecks(); tick();
  };
  await Promise.all(objects.filter(o => !variantOf.has(o.name)).map(one));
  await Promise.all(objects.filter(o => variantOf.has(o.name)).map(one));
  // --- World Pack backdrops: era-correct painted layers for the story's own places (any topic), text-checked, capped.
  const pack = worldPack(direction.scenes, narration);
  await Promise.all(pack.places.flatMap(place => BACKDROP_LAYERS.map(async layer => {
    const id = `bg-${place.slug}-${layer}`, file = `card-${id}.png`, rec = checks.objects[id];
    if (have.has(file) && rec?.ok !== false) { cards.push({ id, path: `${root}/${file}` }); return; }
    for (let attempt = 0; attempt < 2; attempt++) {
      if ((checks.backdropsPaid ?? 0) >= BACKDROP_PAINT_CAP) { note(`${id}: not painted, backdrop limit of ${BACKDROP_PAINT_CAP} reached`); break; }
      checks.backdropsPaid = (checks.backdropsPaid ?? 0) + 1; await saveChecks();
      const r = await limit(() => retry(() => paintAdvancedCard({ data: { look: backdropBrief(place, pack.year, layer), kind: `backdrop-${layer}`, deployment: settings.imageDeployment } }))).catch((e: unknown) => { note(`${id}: painting failed (${e instanceof Error ? e.message : e})`); return null; });
      if (!r) break;
      if (await textFree(id, r.image)) {
        await save(file, toBytes(r.image), "image/png", true); checks.objects[id] = { ok: true };
        cards.push({ id, path: `${root}/${file}` }); note(`${id}: painted for "${place.location}"${pack.year !== null ? ` in ${yearLabel(pack.year)}` : ""}, no text`); break;
      }
      checks.objects[id] = { ok: false };
      if (attempt) note(`${id}: missing, still has text after one regeneration; place shown plain`);
    }
    await saveChecks();
  })));
  const painted = new Set(cards.map(c => c.id));
  return { cards: cards.sort((a, b) => a.id.localeCompare(b.id)), objects: objects.filter(o => painted.has(`obj-${o.name}`)).map(({ name, scenes }) => ({ name, scenes })), log: checks.log };
}

async function validateRigAtlas(base64:string){
  const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
  if(image.width!==1024||image.height!==1536)throw Error('Character parts have invalid dimensions');
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1536;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Character parts could not be checked');
  ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,1024,1536).data;
  for(let row=0;row<4;row++)for(let col=0;col<2;col++){
    let solid=0,edge=0;
    for(let y=0;y<384;y+=3)for(let x=0;x<512;x+=3){const alpha=data[((row*384+y)*1024+col*512+x)*4+3]??0;if(alpha>80){solid++;if(x<12||x>499||y<12||y>371)edge++;}}
    if(solid<100||edge>100||solid>16000)throw Error('Character parts are missing or overlap their cells');
  }
}

/** Puts each painted story object into the scenes where it is said (on the ground beside the cast) and keeps only cards in use. */
export function placeObjectCards(direction: Direction, painted: PaintedCards): { direction: Direction; cards: PaintedCards["cards"] } {
  const used = new Set<string>();
  const have = new Set(painted.cards.map(c => c.id));
  if (direction.scenes.some(sc => (sc.props ?? []).some(p => p.asset?.startsWith("card/")))) {
    // Shot-plan objects are already placed; drop only the ones whose painting failed (never swap in a different object).
    const scenes = direction.scenes.map(sc => ({ ...sc, props: (sc.props ?? []).filter(p => {
      if (!p.asset?.startsWith("card/")) return true;
      const key = `obj-${p.asset.slice(5)}`; if (!have.has(key)) { console.warn("Missing painted object:", p.phrase ?? key); return false; }
      used.add(key); return true;
    }) }));
    return { direction: { ...direction, scenes }, cards: painted.cards.filter(c => !c.id.startsWith("obj-") || used.has(c.id)) };
  }
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

// One animal list shared with the renderer (hosted-renderer/cartoon/animals.json): a painted card must also be shown.
const ANIMALS: string[] = animalVocab.animals;
const PLURAL: Record<string, string> = animalVocab.plural;
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
