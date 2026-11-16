// Advanced place spec (manifest v3). One registry shared with the worker and renderer
// (hosted-renderer/cartoon/blender/place-registry.json): the Visual Director may only pick these ids,
// and an undrawable place stops the video before any paid rendering instead of falling back to an empty world.
import { z } from "zod";
import registry from "../../hosted-renderer/cartoon/blender/place-registry.json";
import audit from "../../hosted-renderer/cartoon/blender/registry-audit.json";

type Entry = { model: string; height: number; words: string[]; water?: boolean };
const DRESSING = registry.dressing as Record<string, Entry>;
const AUDIT = audit as Record<string, { pass: boolean }>;
export const PLACE_TERRAINS = [...Object.keys(registry.terrains), ...registry.kits] as [string, ...string[]];
export const PLACE_TIMES = registry.times as [string, ...string[]];
export const PLACE_WEATHER = registry.weather as [string, ...string[]];
/** Dressing ids that passed the local render check (the Python side also re-checks the definition hash). */
export const PLACE_DRESSING = Object.keys(DRESSING).filter(id => AUDIT[id]?.pass) as [string, ...string[]];

export const placeSpec = z.object({
  terrain: z.enum(PLACE_TERRAINS), time: z.enum(PLACE_TIMES), weather: z.enum(PLACE_WEATHER),
  dressing: z.array(z.object({ id: z.enum(PLACE_DRESSING), count: z.number().int().min(1).max(8) })).max(6),
}).superRefine((p, ctx) => {
  if (p.dressing.some(d => DRESSING[d.id]?.water) && p.terrain !== "river_crossing") ctx.addIssue({ code: "custom", message: "Boats and bridges need a river crossing" });
});
export type PlaceSpec = z.infer<typeof placeSpec>;

/** JSON schema fragment for the Visual Director (strict enums: the model cannot name an undrawable place). */
export function placeJsonSchema() {
  return { type: "object", additionalProperties: false, required: ["terrain", "time", "weather", "dressing"], properties: {
    terrain: { type: "string", enum: PLACE_TERRAINS }, time: { type: "string", enum: PLACE_TIMES }, weather: { type: "string", enum: PLACE_WEATHER },
    dressing: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "count"], properties: { id: { type: "string", enum: PLACE_DRESSING }, count: { type: "integer" } } } },
  } };
}

export const PLACE_PROMPT = `
ADVANCED 3D PLACE (required per scene; the engine builds it as a real 3D world, never a flat plane):
- place.terrain: ${Object.entries(registry.terrains).map(([k, v]) => `${k} (${v.label})`).join("; ")}; or an existing set when the line is literally there: ${registry.kits.join(", ")}.
- place.time: dawn/day/dusk/night from the sentence and facts (a night attack is night). place.weather: clear/fog/rain/wind.
- place.dressing: up to 6 {id,count} from this list only, for things the line names or the place needs: ${PLACE_DRESSING.join(", ")}. Herds or groups use count up to 8 (e.g. burning oxen in a night attack = ox_burning with count 8).`;

/** Lift objects that the 3D place can draw (oxen, torches, tents...) out of the painted-object list into place dressing. */
export function liftDressing<T extends { phrase?: string; id?: string }>(place: PlaceSpec, objects: T[]): { place: PlaceSpec; objects: T[] } {
  const kept: T[] = []; const dressing = [...place.dressing];
  for (const o of objects) {
    const text = ` ${String(o.phrase ?? o.id ?? "").toLowerCase().replace(/[^a-z]+/g, " ")} `;
    const hit = PLACE_DRESSING.map(id => ({ id, len: Math.max(0, ...DRESSING[id]!.words.filter(w => text.includes(` ${w} `)).map(w => w.length)) }))
      .filter(h => h.len > 0 && !(DRESSING[h.id]!.water && place.terrain !== "river_crossing")).sort((a, b) => b.len - a.len)[0];
    // Combination: cattle + fire words is the burning-ox herd, not a torch or a plain ox.
    if (hit && /\b(ox|oxen|cattle|cows?|bulls?)\b/.test(text) && /\b(burning|flaming|fire|torch|torches|ablaze)\b/.test(text) && PLACE_DRESSING.includes("ox_burning")) hit.id = "ox_burning";
    if (!hit) { kept.push(o); continue; }
    if (!dressing.some(d => d.id === hit.id) && dressing.length < 6) dressing.push({ id: hit.id, count: /\b(herd|oxen|cattle|hundreds|thousands|torches|tents|spears|shields)\b/.test(text) ? 6 : 1 });
  }
  return { place: { ...place, dressing }, objects: kept };
}

/** Owner rule: every Advanced scene needs a buildable place; otherwise stop before paid work with a readable message. */
export function requirePlaces(scenes: { place?: unknown }[]): PlaceSpec[] {
  return scenes.map((s, i) => {
    const r = placeSpec.safeParse(s.place);
    if (!r.success) throw new Error(`Scene ${i + 1} needs a place the 3D engine cannot build yet (${r.error.issues[0]?.message ?? "missing place"}). Nothing was rendered or charged.`);
    return r.data;
  });
}
