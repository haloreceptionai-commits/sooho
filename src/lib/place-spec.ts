// Advanced place spec (manifest v3). One registry shared with the worker and renderer
// (hosted-renderer/cartoon/blender/place-registry.json). The place is open-ended: named terrains for common stories, a parameterised
// "custom" terrain (ground, relief, water) for everything else, registry props, ANY model of the CC0 object library, and objects composed
// from simple shapes when the library has nothing. An undrawable place still stops the video before any paid rendering.
import { z } from "zod";
import registry from "../../hosted-renderer/cartoon/blender/place-registry.json";
import audit from "../../hosted-renderer/cartoon/blender/registry-audit.json";
import { LIBRARY, searchLibrary, words } from "./object-library";

type Entry = { model: string; height: number; words: string[]; water?: boolean };
const DRESSING = registry.dressing as Record<string, Entry>;
const AUDIT = audit as Record<string, { pass: boolean }>;
const LIBRARY_IDS = new Set(LIBRARY.filter(o => o.type === "model").map(o => o.id));
export const PLACE_GROUNDS = ["grass", "sand", "snow", "rock", "dirt", "stone", "mud", "ice", "asphalt", "metal"] as const;
export const PLACE_RELIEFS = ["flat", "hills", "mountains", "canyon", "dunes"] as const;
export const PLACE_WATERS = ["none", "sea", "lake", "river"] as const;
export const PLACE_LAYOUTS = ["near", "far", "row", "cluster", "line"] as const;
export const PLACE_SHAPES = ["box", "cylinder", "sphere", "cone", "torus"] as const;
export const PLACE_TERRAINS = [...Object.keys(registry.terrains), "custom", ...registry.kits] as [string, ...string[]];
export const PLACE_TIMES = registry.times as [string, ...string[]];
export const PLACE_WEATHER = registry.weather as [string, ...string[]];
/** Dressing ids that passed the local render check (the Python side also re-checks the definition hash). */
export const PLACE_DRESSING = Object.keys(DRESSING).filter(id => AUDIT[id]?.pass) as [string, ...string[]];

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const part = z.object({ shape: z.enum(PLACE_SHAPES), size: vec3, pos: vec3, color: vec3, glow: z.number().min(0).max(20).optional() });
export const assemblySpec = z.object({ name: z.string().min(1).max(40), parts: z.array(part).min(1).max(16) });
const dressingItem = z.union([
  z.object({ id: z.enum(PLACE_DRESSING), count: z.number().int().min(1).max(12) }).strict(),
  z.object({ lib: z.string().refine(id => LIBRARY_IDS.has(id), "not an object-library model"), count: z.number().int().min(1).max(12), height: z.number().min(0.1).max(60), layout: z.enum(PLACE_LAYOUTS).optional() }).strict(),
  z.object({ asm: assemblySpec, count: z.number().int().min(1).max(12), height: z.number().min(0.1).max(60), layout: z.enum(PLACE_LAYOUTS).optional() }).strict(),
]);
export type Dressing = z.infer<typeof dressingItem>;

export const placeSpec = z.object({
  terrain: z.enum(PLACE_TERRAINS), time: z.enum(PLACE_TIMES), weather: z.enum(PLACE_WEATHER),
  ground: z.enum(PLACE_GROUNDS).optional(), relief: z.enum(PLACE_RELIEFS).optional(), water: z.enum(PLACE_WATERS).optional(),
  dressing: z.array(dressingItem).max(12),
}).superRefine((p, ctx) => {
  const wet = p.terrain === "river_crossing" || p.terrain === "coast" || (p.terrain === "custom" && (p.water ?? "none") !== "none");
  if (p.dressing.some(d => "id" in d && DRESSING[d.id]?.water) && !wet) ctx.addIssue({ code: "custom", message: "Boats, ships, docks and bridges need a river crossing, a coast or a custom place with water" });
  if (p.terrain !== "custom" && (p.ground || p.relief || p.water)) ctx.addIssue({ code: "custom", message: "ground, relief and water belong to the custom place only" });
});
export type PlaceSpec = z.infer<typeof placeSpec>;

/** JSON schema fragment for the Visual Director. Strict: every field is required and enum-limited, so the model cannot name an undrawable place.
 *  Library models and assembled objects are added afterwards from the scene's named objects (liftDressing / composed props), never invented here. */
export function placeJsonSchema(compact = false) {
  if (compact) {   // lighter fallback request: named terrains only, at most 6 registry props, no custom-place fields
    return { type: "object", additionalProperties: false, required: ["terrain", "time", "weather", "dressing"], properties: {
      terrain: { type: "string", enum: PLACE_TERRAINS.filter(t => t !== "custom") }, time: { type: "string", enum: PLACE_TIMES }, weather: { type: "string", enum: PLACE_WEATHER },
      dressing: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["id", "count"], properties: { id: { type: "string", enum: PLACE_DRESSING }, count: { type: "integer" } } } },
    } };
  }
  return { type: "object", additionalProperties: false, required: ["terrain", "ground", "relief", "water", "time", "weather", "dressing"], properties: {
    terrain: { type: "string", enum: PLACE_TERRAINS },
    ground: { type: "string", enum: PLACE_GROUNDS }, relief: { type: "string", enum: PLACE_RELIEFS }, water: { type: "string", enum: PLACE_WATERS },
    time: { type: "string", enum: PLACE_TIMES }, weather: { type: "string", enum: PLACE_WEATHER },
    dressing: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "count"], properties: { id: { type: "string", enum: PLACE_DRESSING }, count: { type: "integer" } } } },
  } };
}

/** The strict schema always carries ground/relief/water; they only mean something for terrain "custom". */
export function normalizePlace(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const p = { ...(raw as Record<string, unknown>) };
  if (p["terrain"] !== "custom") { delete p["ground"]; delete p["relief"]; delete p["water"]; }
  return p;
}

export const PLACE_PROMPT = `
ADVANCED 3D PLACE (required per scene; the engine builds it as a real 3D world, never a flat plane). It works for ANY topic:
- place.terrain: pick the closest named place: ${Object.entries(registry.terrains).map(([k, v]) => `${k} (${v.label})`).join("; ")}; or an existing set when the line is literally there: ${registry.kits.join(", ")}.
  For ANYTHING else (a city street, a space base, a factory yard, a volcano, an arctic base, a battlefield in a swamp, a lab exterior...) use terrain "custom" and describe it: ground (${PLACE_GROUNDS.join("/")}), relief (${PLACE_RELIEFS.join("/")}) and water (${PLACE_WATERS.join("/")}). For named terrains set ground "grass", relief "hills", water "none" (ignored).
- Whatever the line names or the place needs (buildings, vehicles, machines, furniture, animals, weapons, monuments) goes in the scene's "objects" list with a short descriptive phrase and a size: the engine finds the matching 3D model in a library of 5,000 models, or builds one from shapes. Be specific ("a steel water tower", "a red rocket on a launch pad", "a stone watchtower").
- place.time: dawn/day/dusk/night from the sentence and facts (a night attack is night). Time of day is a STORY CONSTANT: every scene in the same stretch of the story shares one time; change it only where the story itself jumps (for example "by morning"), going through dawn or dusk. Never alternate day and night between neighbouring scenes. place.weather: clear/fog/rain/wind.
- place.dressing: up to 12 {id,count} from this list only, for registry things: ${PLACE_DRESSING.join(", ")}. Herds or groups use count up to 12 (e.g. burning oxen in a night attack = ox_burning with count 8).`;

/** Colour/size/material adjectives never identify an object: a model called "lightRed" is not a red rocket. */
const GENERIC = new Set(["red", "blue", "green", "yellow", "black", "white", "grey", "gray", "brown", "orange", "purple", "pink", "gold", "golden", "silver", "dark", "old", "new", "big", "small", "large", "tiny", "huge", "tall", "short", "heavy",
  "steel", "wooden", "wood", "stone", "iron", "metal", "rusty", "ancient", "modern", "giant", "base", "large", "medium", "small", "detailed", "simple", "long", "round", "square"]);
/** A modifier that changes WHAT the thing is ("water tower" is not a watchtower): such phrases are built from shapes instead of matched loosely. */
const DISTINCT_MODIFIER = /\b(water|oil|power|clock|bell|radio|signal|gas|wind|control|fire|ice|sand)\s+\w+/;
const headNoun = (phrase: string): string | undefined => {
  const first = phrase.toLowerCase().split(/\b(?:on|in|with|of|at|near|by|from|for|under|over|beside|made)\b/)[0] ?? "";
  const ws = words(first); return ws[ws.length - 1];
};
/** Packs made for games or toys, and abstract head nouns, never stand in for a real object in a story. */
const BAD_PACKS = new Set(["platformer-kit", "mini-skate", "racing-kit", "blaster-kit", "tower-defense-kit", "food-kit", "holiday-kit", "q-ultimatefood", "q-cutemonsters", "cube-pets", "q-ultimatecrops", "mini-dungeon", "q-modularplatformer", "q-cubeworldkit", "blocky-characters", "mini-characters", "q-backgroundposedhumans"]);
const BAD_HEAD = new Set(["key", "trap", "star", "coin", "heart", "gem", "spot", "point", "group", "way", "pass", "line", "time", "watch", "view", "sign", "mark", "idea", "plan", "force", "troop", "position"]);
const nameWords = (id: string) => words(id.split("/")[1] ?? id);

const SIZE_HEIGHT: Record<string, number> = { small: 0.7, medium: 1.6, large: 4.5, huge: 16 };
const PLURAL = /\b(herd|herds|flock|crowd|row|rows|army|armies|hundreds|thousands|dozens|many|several|fleet|forest|rows of)\b/;

function sizeToHeight(size: string | undefined, text: string): number {
  const base = SIZE_HEIGHT[size ?? "medium"] ?? 1.6;
  if (/\b(skyscraper|tower|mountain|volcano|pyramid|cathedral|lighthouse|dam|bridge)\b/.test(text)) return Math.max(base, 30);
  if (/\b(building|castle|factory|warehouse|ship|train|plane|aircraft|rocket)\b/.test(text)) return Math.max(base, 8);
  return base;
}

/** Lift objects the 3D place can draw out of the painted-object list into place dressing: registry props first, then ANY library model
 *  whose name matches the phrase. What cannot be matched stays in `objects` (the caller composes it from shapes or falls back to a card). */
export function liftDressing<T extends { phrase?: string; id?: string; size?: string }>(place: PlaceSpec, objects: T[]): { place: PlaceSpec; objects: T[] } {
  const kept: T[] = []; const dressing: Dressing[] = [...place.dressing];
  const wet = place.terrain === "river_crossing" || place.terrain === "coast" || (place.terrain === "custom" && (place.water ?? "none") !== "none");
  for (const o of objects) {
    const text = ` ${String(o.phrase ?? o.id ?? "").toLowerCase().replace(/[^a-z]+/g, " ")} `;
    const distinct = DISTINCT_MODIFIER.exec(text.trim());
    const hit = distinct ? undefined : PLACE_DRESSING.map(id => ({ id, len: Math.max(0, ...DRESSING[id]!.words.filter(w => text.includes(` ${w} `)).map(w => w.length)) }))
      .filter(h => h.len > 0 && !(DRESSING[h.id]!.water && !wet)).sort((a, b) => b.len - a.len)[0];
    // Combination: cattle + fire words is the burning-ox herd, not a torch or a plain ox.
    if (hit && /\b(ox|oxen|cattle|cows?|bulls?)\b/.test(text) && /\b(burning|flaming|fire|torch|torches|ablaze)\b/.test(text) && PLACE_DRESSING.includes("ox_burning")) hit.id = "ox_burning";
    if (hit) {
      if (!dressing.some(d => "id" in d && d.id === hit.id) && dressing.length < 12) dressing.push({ id: hit.id, count: /\b(herd|oxen|cattle|hundreds|thousands|torches|tents|spears|shields)\b/.test(text) ? 6 : 1 });
      continue;
    }
    const phrase = String(o.phrase ?? o.id ?? "");
    const head = headNoun(phrase);
    const lib = phrase && head && !distinct && !BAD_HEAD.has(head) ? searchLibrary(phrase, 12).find(m => m.type === "model" && !BAD_PACKS.has(m.pack) && nameWords(m.id).includes(head) && !nameWords(m.id).every(w => GENERIC.has(w))) : undefined;
    if (!lib || dressing.length >= 12) { kept.push(o); continue; }
    const many = PLURAL.test(text);
    const h = sizeToHeight(o.size, text);
    if (!dressing.some(d => "lib" in d && d.lib === lib.id)) dressing.push({ lib: lib.id, count: many ? 5 : 1, height: h, layout: h >= 12 ? "far" : many ? "row" : "near" });
  }
  return { place: { ...place, dressing }, objects: kept };
}

/** Attach shape-composed objects (see composePropsOp) to a place; at most 12 dressing items overall. */
export function addAssemblies(place: PlaceSpec, items: { name: string; parts: unknown; height: number; count?: number; layout?: string }[]): PlaceSpec {
  const dressing: Dressing[] = [...place.dressing];
  for (const it of items) {
    if (dressing.length >= 12) break;
    const asm = assemblySpec.safeParse({ name: it.name, parts: it.parts });
    if (!asm.success) continue;
    const layout: (typeof PLACE_LAYOUTS)[number] = (PLACE_LAYOUTS as readonly string[]).includes(it.layout ?? "") ? (it.layout as (typeof PLACE_LAYOUTS)[number]) : "near";
    dressing.push({ asm: asm.data, count: Math.max(1, Math.min(12, it.count ?? 1)), height: Math.max(0.1, Math.min(60, it.height)), layout });
  }
  return { ...place, dressing };
}

const DEFAULT_PLACE = { terrain: "plain", time: "day", weather: "clear", dressing: [] };

/** Every Advanced scene gets a buildable place. A scene whose place is invalid is repaired instead of failing the paid video:
 *  first by dropping only the invalid dressing, then by falling back to a plain place that keeps its time of day. Repairs are logged. */
export function requirePlaces(scenes: { place?: unknown }[]): PlaceSpec[] {
  return scenes.map((s, i) => {
    const raw = normalizePlace(s.place);
    const r = placeSpec.safeParse(raw);
    if (r.success) return r.data;
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const dressing = Array.isArray(obj["dressing"]) ? (obj["dressing"] as unknown[]).filter(d => placeSpec.safeParse({ ...obj, dressing: [d] }).success) : [];
    const healed = placeSpec.safeParse({ ...obj, dressing });
    if (healed.success) { console.warn(`Scene ${i + 1}: place repaired by dropping invalid dressing (${r.error.issues[0]?.message ?? "invalid"})`); return healed.data; }
    const time = typeof obj["time"] === "string" && (PLACE_TIMES as string[]).includes(obj["time"]) ? obj["time"] : "day";
    console.warn(`Scene ${i + 1}: place replaced by a plain ${time} place (${r.error.issues[0]?.message ?? "missing place"})`);
    return placeSpec.parse({ ...DEFAULT_PLACE, time });
  });
}

/** Short place instructions for the lighter fallback request (named terrains and registry props only). */
export const PLACE_PROMPT_COMPACT = `
ADVANCED 3D PLACE (required per scene): place.terrain is the closest of: ${Object.entries(registry.terrains).map(([k, v]) => `${k} (${v.label})`).join("; ")}; or an existing set when the line is literally there: ${registry.kits.join(", ")}.
place.time is dawn/day/dusk/night and stays the same across neighbouring scenes unless the story itself jumps. place.weather is clear/fog/rain/wind. place.dressing: up to 6 {id,count} from: ${PLACE_DRESSING.join(", ")}.`;
