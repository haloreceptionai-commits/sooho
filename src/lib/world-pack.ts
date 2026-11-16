/**
 * World Pack: topic-independent place + era for every story, derived from the story itself
 * (each scene's free-text location and the years spoken in the narration), never from a fixed kit list.
 * Each distinct place gets painted backdrop layers in one locked style; the renderer stands 3D people
 * and objects in front of them. Mirrored in hosted-renderer/cartoon/blender/world_pack.py (same slug/year rules).
 */
export const BACKDROP_LAYERS = ["far", "mid"] as const;
export const MAX_PLACES = 3;            // painted places per video
export const BACKDROP_PAINT_CAP = 8;    // paid backdrop paintings per video (3 places x 2 layers + 2 text regenerations)

/** Stable short id for a free-text location (same algorithm as world_pack.py:place_slug). */
export function placeSlug(location: string): string {
  const words = location.toLowerCase().replace(/\b\d{1,4}\s*(bce|bc|b\.c\.)(?![a-z])/g, " ").replace(/\bad\s*\d{1,4}\b/g, " ").replace(/\b(1[0-9]{3}|20[0-9]{2})s?\b/g, " ").match(/[a-z0-9]+/g) ?? [];
  const stop = new Set(["a", "an", "the", "of", "in", "on", "at", "and", "with", "near", "by", "to"]);
  const kept: string[] = [];
  for (const w of words.filter(w => !stop.has(w)).slice(0, 4)) { if ([...kept, w].join("_").length > 20) break; kept.push(w); }
  return kept.join("_");
}

/** Years spoken in the narration: "1919", "217 BC"/"BCE" (negative), "AD 79". */
export function spokenYears(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\b(\d{1,4})\s*(BCE|BC|B\.C\.)(?![a-z])/gi)) out.push(-Number(m[1] ?? 0));
  for (const m of text.matchAll(/\b(?:AD|A\.D\.)\s*(\d{1,4})\b/g)) out.push(Number(m[1] ?? 0));
  const cleaned = text.replace(/\b\d{1,4}\s*(BCE|BC|B\.C\.)(?![a-z])/gi, " ").replace(/\b(?:AD|A\.D\.)\s*\d{1,4}\b/g, " ");
  for (const m of cleaned.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)) out.push(Number(m[1] ?? 0));
  return out;
}
/** The story's year: the year spoken most often (earliest on ties), or null. BC years are negative. */
export function storyYear(narration: string[]): number | null {
  const n = new Map<number, number>();
  for (const y of spokenYears(narration.join(" "))) n.set(y, (n.get(y) ?? 0) + 1);
  let best: number | null = null;
  for (const [y, c] of n) if (best === null || c > n.get(best)! || (c === n.get(best)! && y < best)) best = y;
  return best;
}
export const yearLabel = (y: number) => (y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : String(y));

export interface WorldPlace { slug: string; location: string; scenes: number[]; indoor: boolean }
export interface WorldPack { year: number | null; places: WorldPlace[] }

const INDOOR = /\b(inside|indoors?|interior|room|office|kitchen|hall|courtroom|laboratory|lab|workshop|cabin|tunnel|cave|mine|cellar|church|bar|saloon|tavern|library|classroom|newsroom|bedroom|parlou?r)\b/i;

/** Places that get painted backdrops: the most-used distinct locations (up to MAX_PLACES). */
export function worldPack(scenes: { location?: string | undefined }[], narration: string[]): WorldPack {
  const by = new Map<string, WorldPlace>();
  scenes.forEach((s, i) => {
    const loc = (s.location ?? "").trim(); if (!loc) return;
    const slug = placeSlug(loc); if (!slug) return;
    const p = by.get(slug) ?? { slug, location: loc, scenes: [], indoor: INDOOR.test(loc) };
    p.scenes.push(i); by.set(slug, p);
  });
  const places = [...by.values()].sort((a, b) => b.scenes.length - a.scenes.length || (a.scenes[0] ?? 0) - (b.scenes[0] ?? 0)).slice(0, MAX_PLACES);
  return { year: storyYear(narration), places };
}

export const backdropKeys = (pack: WorldPack) => pack.places.flatMap(p => BACKDROP_LAYERS.map(l => `bg-${p.slug}-${l}`));

/** Painting brief for one layer. The year/era is always stated so no place is drawn in the wrong period. */
export function backdropBrief(place: WorldPlace, year: number | null, layer: (typeof BACKDROP_LAYERS)[number]): string {
  const when = year !== null ? `in the year ${yearLabel(year)}, every building, vehicle and object correct for that exact period` : "period-correct for the story";
  const what = place.indoor
    ? (layer === "far" ? "the back wall and far side of the room" : "furniture and fittings along the sides of the room, middle of the frame left empty")
    : (layer === "far" ? "sky and the distant skyline or landscape" : "the nearer buildings or landscape features at the left and right edges, middle and bottom left empty");
  return `${place.location}, ${when}. Layer: ${what}. No people, no animals.`.slice(0, 300);
}
