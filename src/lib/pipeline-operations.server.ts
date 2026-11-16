import { effortFor } from "@/lib/azure-effort";
import { styleAnchor } from "@/lib/styles";
import { FEW_SHOT } from "@/lib/story-v2";
import { cartoonDirection, OUTFITS, VOCAB } from '@/lib/cartoon-job';
import { z } from 'zod';

import { azureOpenAIRequest } from './azure-openai.server';
import { generateSpeech } from '@lovable.dev/ai-gateway';
import { ADVANCED_STORY_DIRECTION } from './advanced-story';
import { STORY_SHAPE_DIRECTION, STORY_SHAPE_JUDGE, hookShapeIssues, lockShapeHook } from './story-shape';

// Scripts and images use the owner's Azure resource; narration remains Gemini.

const safeName = (s: string) => {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(s)) throw new Error("Invalid deployment name");
  return s;
};

async function azure(path: string, body: unknown) {
  return azureOpenAIRequest(path, body);
}

async function fail(res: Response, what: string): Promise<never> {
  const text = (await res.text()).slice(0, 400);
  console.error(`${what} failed [${res.status}]: ${text}`);
  let msg = text;
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    msg = (typeof j.error === "object" ? j.error?.message : j.error) ?? j.message ?? text;
  } catch { /* keep text */ }
  throw new Error(`[${res.status}] ${what}: ${msg}`);
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}


/** Streams a strict-JSON chat completion from Azure (streaming keeps the gateway alive on long calls). */
export async function azureJson<T>(deployment: string, system: string, user: string, name: string, schema: unknown, what: string, effort: "none" | "low" | "medium" | "high" = "none"): Promise<T> {
  const res = await azure(`${safeName(deployment)}/chat/completions`, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_completion_tokens: 32000,
    reasoning_effort: effortFor(deployment, effort),
    stream: true,
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
  });
  if (!res.ok || !res.body) await fail(res, what);
  let content = "", refusal = "", buf = "";
  if (!res.body) throw Error(`${what} returned no body`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as { choices?: { delta?: { content?: string; refusal?: string } }[] };
        content += j.choices?.[0]?.delta?.content ?? "";
        refusal += j.choices?.[0]?.delta?.refusal ?? "";
      } catch { /* keep-alive */ }
    }
  }
  if (refusal) throw new Error(`${what} refused: ${refusal}`);
  try { return JSON.parse(content) as T; } catch { throw new Error(`${what} returned an unreadable answer`); }
}

// ---------------- Fact check ----------------

export interface Claim { claim: string; sources: string[]; date: string; confidence: "high" | "medium" | "low" }
const MAP_DIRECTOR = `You are the map art director for a long-form history documentary in the style of animated 3D relief-map channels.
For each numbered narration block decide if it is best shown on the animated map (empires, borders, conquests, migrations, trade routes, battles, treaties, where-and-when context) or by cartoon characters acting out a human moment.
Aim for about 60% map blocks; never more than 3 character blocks in a row; the first block is always a map.
For map blocks: regions = the territory the narration is about at that moment, using ONLY ids from the allowed list (prefer a preset like ottoman_empire when it fits, else modern country ids);
focus = [longitude, latitude, zoom] centred on the action (zoom 1 = continent, 2-3 = region, 4-6 = a city or battlefield);
reveal = grow when territory expands, shrink when it is lost, hold otherwise; label = short UPPERCASE-friendly subject (max 20 chars, e.g. OTTOMAN); years = the period shown (e.g. 1299 - 1453);
cities = up to 3 key places named in the narration with accurate coordinates; armies = up to 2 marching forces for battles/campaigns (from -> to coordinates, side red for the subject, blue for opponents).
For character blocks set map to false and leave the other fields empty. Be geographically accurate.`;

/** Long-form: decides map vs character blocks and fills the map data, in bounded chunks. */
async function directMapOperation(scenes: string[], deployment: string) {
  const ids = (await import('../../hosted-renderer/cartoon/assets/map/region-ids.json')).default as string[];
  const pt = { type: 'array', items: { type: 'number' } };
  const schema = { type: 'object', additionalProperties: false, required: ['blocks'], properties: { blocks: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['index', 'map', 'regions', 'focus', 'reveal', 'label', 'years', 'cities', 'armies'], properties: {
      index: { type: 'integer' }, map: { type: 'boolean' }, regions: { type: 'array', items: { type: 'string', enum: ids } }, focus: pt,
      reveal: { type: 'string', enum: ['grow', 'hold', 'shrink'] }, label: { type: 'string' }, years: { type: 'string' },
      cities: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'at'], properties: { name: { type: 'string' }, at: pt } } },
      armies: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'side'], properties: { from: pt, to: pt, side: { type: 'string', enum: ['red', 'blue', 'gold'] } } } },
    } } } } };
  type Block = { index: number; map: boolean; regions: string[]; focus: number[]; reveal: 'grow' | 'hold' | 'shrink'; label: string; years: string; cities: { name: string; at: number[] }[]; armies: { from: number[]; to: number[]; side: 'red' | 'blue' | 'gold' }[] };
  const out: (Block | null)[] = scenes.map(() => null);
  for (let start = 0; start < scenes.length; start += 40) {
    const part = scenes.slice(start, start + 40);
    const r = await azureJson<{ blocks: Block[] }>(deployment, MAP_DIRECTOR, `Allowed region presets: ${ids.filter(i => i.includes('_')).join(', ')}\n\n` + part.map((t, i) => `${start + i}: ${t.split(/\s+Visual:/i)[0]}`).join('\n'), 'map_direction', schema, 'Map director');
    for (const b of r.blocks) if (b.index >= start && b.index < start + part.length) out[b.index] = b;
  }
  if (out[0]) out[0].map = true;
  return out;
}
const clampLL = (p: number[] | undefined): [number, number] | null => p && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [Math.max(-180, Math.min(180, p[0]!)), Math.max(-65, Math.min(85, p[1]!))] : null;
const mapText = (t: string, n: number) => t.replace(/[^\p{L}\p{N} .,'&()\-–]/gu, '').slice(0, n).trim();
/** Turns a map-director block into an engine-safe map spec (clamped coordinates, trimmed labels), or null if unusable. */
export function toMapSpec(b: { regions: string[]; focus: number[]; reveal: 'grow' | 'hold' | 'shrink'; label: string; years: string; cities: { name: string; at: number[] }[]; armies: { from: number[]; to: number[]; side: 'red' | 'blue' | 'gold' }[] }, valid: Set<string>) {
  const f = clampLL(b.focus); if (!f) return null;
  const zoom = Math.max(.5, Math.min(8, Number(b.focus[2]) || 2));
  return { regions: [...new Set(b.regions.filter(r => valid.has(r)))].slice(0, 40), focus: [f[0], f[1], zoom] as [number, number, number], reveal: b.reveal,
    label: mapText(b.label, 20) || undefined, years: mapText(b.years, 20) || undefined,
    cities: b.cities.flatMap(c => { const at = clampLL(c.at), name = mapText(c.name, 22); return at && name ? [{ name, at }] : []; }).slice(0, 6),
    armies: b.armies.flatMap(a => { const from = clampLL(a.from), to = clampLL(a.to); return from && to ? [{ from, to, side: a.side }] : []; }).slice(0, 4) };
}

export const directCartoonOperation = async ({ data }: { data: { scenes: string[]; deployment: string; format?: 'short' | 'long' | undefined; advanced?: boolean | undefined } }) => {
  if (data.format !== 'long') return directCartoonChunk(data);
  // Long-form: character direction in chunks (one shared cast), then the map pass decides which blocks become map scenes.
  let cast: z.infer<typeof cartoonDirection>['cast'] | null = null;
  const scenes: z.infer<typeof cartoonDirection>['scenes'] = [];
  for (let i = 0; i < data.scenes.length; i += 40) {
    const part = await directCartoonChunk({ scenes: data.scenes.slice(i, i + 40), deployment: data.deployment, advanced: data.advanced });
    const first: z.infer<typeof cartoonDirection>['cast'] = cast ?? part.cast; cast = first;
    // Later chunks reuse the first cast by position so the same people carry the whole documentary.
    const remap = new Map(part.cast.map((c, k) => [c.id, (first[k] ?? first[0]!).id]));
    scenes.push(...part.scenes.map(s => ({ ...s, actor: remap.get(s.actor) ?? first[0]!.id, speaker: s.speaker ? remap.get(s.speaker) : undefined,
      actors: s.actors?.map(a => ({ ...a, actor: remap.get(a.actor) ?? first[0]!.id })) })));
  }
  const ids = new Set((await import('../../hosted-renderer/cartoon/assets/map/region-ids.json')).default as string[]);
  const blocks = await directMapOperation(data.scenes, data.deployment);
  const merged = scenes.map((s, i) => {
    const b = blocks[i]; const spec = b?.map ? toMapSpec(b, ids) : null;
    return spec ? { ...s, world: 'map' as const, light: 'day' as const, actors: undefined, speaker: undefined, props: [], fx: [], map: spec } : s;
  });
  const { sanitizeDirection } = await import('./cartoon-job');
  const narration = data.scenes.map(s => s.split(/\s+Visual:/i)[0] ?? s);
  return cartoonDirection.parse(sanitizeDirection({ cast: cast!, scenes: merged }, narration));
};

/** Objects the 3D library has no model for are composed from 3-16 simple shapes (box, cylinder, sphere, cone, torus), sized in metres,
 *  so any topic gets a recognisable 3D prop instead of a flat painted card. Strictly validated by place-spec.assemblySpec. */
export async function composePropsOp(d: { phrases: { phrase: string; size?: string }[]; deployment: string }) {
  const vec = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
  const schema = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['phrase', 'name', 'height', 'count', 'layout', 'parts'], properties: { phrase: { type: 'string' }, name: { type: 'string' }, height: { type: 'number' }, count: { type: 'integer' },
      layout: { type: 'string', enum: ['near', 'far', 'row', 'cluster', 'line'] },
      parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['shape', 'size', 'pos', 'color', 'glow'], properties: {
        shape: { type: 'string', enum: ['box', 'cylinder', 'sphere', 'cone', 'torus'] }, size: vec, pos: vec, color: vec, glow: { type: 'number' } } } } } } } } };
  const r = await azureJson<{ items: { phrase: string; name: string; height: number; count: number; layout: string; parts: unknown }[] }>(d.deployment,
    `You are a 3D prop modeller for a cartoon explainer. For each object phrase, build a recognisable low-poly version from 3-16 primitive shapes. Rules: shape is box, cylinder, sphere, cone or torus; size is [x,y,z] full extents in an arbitrary unit (0.01-20); pos is the part centre [x,y,z] in the same unit, z up, the object stands on z=0 around x=0,y=0; color is [r,g,b] 0-1 linear (use believable material colours: wood brown, steel grey, brick red, canvas cream); glow 0 unless the part emits light (fire, lamp, screen: 4-10). height is the real-world height of the finished object in metres. count is how many appear (1 unless the phrase is plural). layout near/far/row/cluster/line. Keep proportions faithful: a water tower is a tank on legs, a catapult is a frame with an arm, a tent is a cone on a cylinder. name is 2-4 words.`,
    d.phrases.map((p, i) => `${i + 1}. ${p.phrase}${p.size ? ` (${p.size})` : ''}`).join('\n'), 'compose_props', schema, 'Prop composer', 'low');
  return r.items ?? [];
}

const directCartoonChunk = async (data: { scenes: string[]; deployment: string; advanced?: boolean | undefined }) => {
    const placeMod = await import('./place-spec');
    const prototypeActions=new Set(['aim','fire','load','place','inspect','strike','tap','throw']);
    const en = (k: keyof typeof VOCAB) => ({ type: 'string', enum: k==='actions' ? VOCAB.actions.filter(a=>!prototypeActions.has(a)) : VOCAB[k] });
    // Searchable CC0 library: the Director sees only objects matching this story's words.
    const { shortlist, searchLibrary } = await import('./object-library');
    const narration = data.scenes.map(s => s.split(/\s+Visual:/i)[0] ?? s);
    const objects = shortlist(narration);
    const performer = { type: 'object', additionalProperties: false, required: ['actor', 'action', 'expression', 'slot', 'facing'], properties: { actor: { type: 'string' }, action: en('actions'), expression: en('expressions'), slot: en('slots'), facing: { type: 'integer', enum: [-1, 0, 1] } } };
    const schema = { type: 'object', additionalProperties: false, required: ['cast', 'scenes'], properties: {
      cast: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'seed', 'outfit'], properties: { id: { type: 'string' }, seed: { type: 'integer' }, outfit: { type: 'string', enum: [...OUTFITS] } } } },
      scenes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['world', 'light', 'action', 'expression', 'actor', 'wide', 'shot', 'move', 'mood', 'actors', 'speaker', 'props', 'fx', 'cues', 'keyword'], properties: {
        world: { type: 'string', enum: VOCAB.worlds.filter(w => w !== 'map') }, light: en('lights'), action: en('actions'), expression: en('expressions'), actor: { type: 'string' }, wide: { type: 'boolean' },
        shot: en('shots'), move: en('moves'), mood: en('moods'), actors: { type: 'array', items: performer }, speaker: { type: 'string' },
        props: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'place', 'motion', 'asset'], properties: { kind: en('props'), place: en('places'), motion: en('prop_motions'), asset: { type: 'string', enum: ['', ...objects.map(o => o.id)] } } } },
        fx: { type: 'array', items: en('fx') }, cues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['word', 'kind'], properties: { word: { type: 'integer' }, kind: en('sounds') } } }, keyword: { type: 'string' },
      } } },
    } };
    if (data.advanced) {
      // Advanced: a free-text real place and the line's key objects as descriptive phrases (resolved after direction).
      const scene = schema.properties.scenes.items as unknown as { required: string[]; properties: Record<string, unknown> };
      scene.required.push('location', 'objects');
      scene.properties['location'] = { type: 'string' };
      scene.required.push('place'); scene.properties['place'] = placeMod.placeJsonSchema();
      scene.properties['objects'] = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'phrase', 'size'], properties: { id: { type: 'string' }, phrase: { type: 'string' }, size: { type: 'string', enum: ['small', 'medium', 'large', 'huge'] } } } };
    }
    // Self-healing: some newer models (gpt-6.1-sol) can return empty direction; retry with more thinking, then the proven gpt-5 deployment.
    const ask = (dep: string, effort: 'none' | 'medium') => azureJson<{ cast: unknown[]; scenes: Record<string, unknown>[] }>(dep, data.advanced ? VISUAL_DIRECTOR + ADVANCED_DIRECTION + placeMod.PLACE_PROMPT : VISUAL_DIRECTOR,
      data.scenes.map((s, i) => `${i}: ${s}\nScene-matched models: ${searchLibrary(s, 5).filter(o => objects.some(a => a.id === o.id)).map(o => `${o.id}${o.clips?.length ? ' [rigged]' : ''}`).join(', ') || 'use faithful built-in props'}`).join('\n') + (objects.length ? `\n\nLibrary objects for this story (use kind=asset with asset=<id>):\n${objects.map(o => `${o.id} — ${o.name}${o.type === 'sprite' ? ' (flat animal art)' : o.clips?.length ? ' (animated: idle/walk/run)' : ''}`).join('\n')}` : ''), 'cartoon_direction', schema, 'Visual director', effort);
    const empty = (r: { cast: unknown[]; scenes: unknown[] }) => !r.cast?.length || !r.scenes?.length;
    let raw = await ask(data.deployment, 'none');
    if (empty(raw)) raw = await ask(data.deployment, 'medium');
    if (empty(raw) && data.deployment !== 'gpt-5') raw = await ask('gpt-5', 'none').catch(() => raw);
    // Empty speaker means narration (no lip sync); trim lists to engine limits before strict validation.
    const scenes = raw.scenes.map(s => ({ ...s, speaker: s['speaker'] || undefined, keyword: String(s['keyword'] ?? '').slice(0, 40) || undefined,
      actors: Array.isArray(s['actors']) && s['actors'].length ? s['actors'].slice(0, 3) : undefined, props: Array.isArray(s['props']) ? (s['props'] as Record<string, unknown>[]).map((p): Record<string, unknown> => ({ ...p, asset: p['asset'] || undefined })).filter(p => (p['kind'] === 'asset') === !!p['asset']).slice(0, 4) : [], fx: Array.isArray(s['fx']) ? s['fx'].slice(0, 3) : [], cues: Array.isArray(s['cues']) ? s['cues'].slice(0, 4) : [] }));
    const { cinematicPass } = await import('./cinematic-pass');
    const { groundLibraryScenes } = await import('./library-direction');
    const { sanitizeDirection } = await import('./cartoon-job');
    const cast = diversifyCast(raw.cast as CastMember[], data.advanced ? 4 : 3);
    const grounded = groundLibraryScenes(scenes as unknown as Parameters<typeof cinematicPass>[0], narration, objects);
    let edited = cinematicPass(grounded, narration, { literal: Boolean(data.advanced) });
    if (data.advanced) {
      // Owner rule: objects come from descriptive phrases; a model is used only on a whole-phrase match, otherwise a painted card.
      const { resolveSceneObjects } = await import('./object-resolution');
      const { requirePlaces, liftDressing } = placeMod;
      const places = requirePlaces(raw.scenes as { place?: unknown }[]);   // stops here, before any paid rendering
      let located = edited.map((s, i) => {
        const lifted = liftDressing(places[i]!, Array.isArray(raw.scenes[i]?.['objects']) ? raw.scenes[i]!['objects'] as { phrase?: string; id?: string; size?: string }[] : []);
        return { ...s, location: String(raw.scenes[i]?.['location'] ?? '').trim().slice(0, 160) || undefined, place: lifted.place, objects: lifted.objects };
      });
      // Anything the 5,000-model library cannot match is composed from shapes (one batched call); a failure keeps the painted-card fallback.
      try {
        const need: { phrase: string; size?: string }[] = [];
        for (const sc of located) for (const o of (sc.objects ?? []) as { phrase?: string; size?: string }[]) {
          const phrase = String(o.phrase ?? '').trim();
          if (phrase && need.length < 8 && !need.some(n => n.phrase === phrase)) need.push({ phrase, size: o.size });
        }
        if (need.length) {
          const composed = await composePropsOp({ phrases: need, deployment: data.deployment });
          const byPhrase = new Map(composed.map(c => [String(c.phrase).trim(), c]));
          located = located.map(sc => {
            const items = ((sc.objects ?? []) as { phrase?: string }[]).map(o => byPhrase.get(String(o.phrase ?? '').trim())).filter((c): c is NonNullable<typeof c> => Boolean(c));
            if (!items.length) return sc;
            const withAsm = placeMod.addAssemblies(sc.place as never, items.map(c => ({ name: c.name, parts: c.parts, height: c.height, count: c.count, layout: c.layout })));
            const done = new Set(items.map(c => String(c.phrase).trim()));
            return { ...sc, place: withAsm, objects: ((sc.objects ?? []) as { phrase?: string }[]).filter(o => !done.has(String(o.phrase ?? '').trim())) } as typeof sc;
          });
        }
      } catch (e) { console.warn('Prop composer skipped', e instanceof Error ? e.message : e); }
      const resolved = resolveSceneObjects(located as never[], Math.max(0, Math.min(8, 24 - cast.length * 4)));
      if (resolved.missing.length) console.warn('Missing objects', JSON.stringify(resolved.missing));
      edited = resolved.scenes as typeof edited;
    }
    const result = cartoonDirection.parse(sanitizeDirection({ cast, scenes: edited } as unknown as Parameters<typeof sanitizeDirection>[0], narration));
    if (result.scenes.length !== data.scenes.length) throw Error('This story needs cartoon actions or props that are not supported yet');
    return result;
  };
type CastMember = { id: string; seed: number; outfit: string };
// Distinct looks per cast member: duplicate outfits/seeds are swapped for unused ones so characters never read as clones.
export function diversifyCast(cast: CastMember[], max = 3): CastMember[] {
  const used = new Set<string>(), seeds = new Set<number>();
  return (cast || []).slice(0, max).map((c, i) => {
    let outfit = (OUTFITS as readonly string[]).includes(c.outfit) ? c.outfit : OUTFITS[0];
    if (used.has(outfit)) outfit = OUTFITS.find(o => !used.has(o)) ?? outfit;
    used.add(outfit);
    let seed = Number.isInteger(c.seed) && c.seed >= 1 ? c.seed : 7 + i * 131;
    while (seeds.has(seed)) seed = (seed * 7 + 113) % 997 + 1;
    seeds.add(seed);
    return { id: c.id, seed, outfit };
  });
}
// Advanced Video AI: every cast id becomes a painted card, so animals and creatures can act like people.
const ADVANCED_DIRECTION = `
ADVANCED VIDEO AI CAST (overrides the cast limits above): up to 4 cast ids, each drawn from a painted card of exactly what the narration says, so the outfit is only a placeholder.
- Every person AND every animal or creature that acts or is named as a character in the narration (a pig, a dog, a horse) is its own cast id (e.g. "pig") and appears as an actor in every scene where it is mentioned or acts.
- Literal staging overrides the generic cast/reaction rules below: cast only actual people or animals in the story. Do not invent a narrator, rival, "Threat", or human mascot for a tool or chip. One real user is enough for a device explainer.
- The main object is the subject of a mechanism sentence. Keep it visible and reuse exact object identities across cuts.
ADVANCED 3D CINEMATOGRAPHY (the Advanced engine films each line in a real 3D location with a moving camera, like a film editor):
- Plan the video as a journey through places: choose the world where each sentence actually happens (landscape for farms, crop fields, open country, desert and bush; town or market for townsfolk and trade, lab for inventions, castle for royalty, ship/storm_sea for the sea, night_camp for armies at night, mine underground). When the story moves, the world moves with it; do not park the whole video in one world.
- Bodies act out the spoken verb literally: walk when someone travels or arrives, run when anyone flees/chases/charges/scatters, aim/fire for shooting, carry/lift for hauling, point when someone discovers/orders/declares, cower when afraid, cheer only for a real win. An animal that runs or scatters gets action run.
- Vary the camera every sentence like a film editor: open on a wide or low establishing shot, cut to medium for actions, close/extreme_close for faces and reactions, low for power or threat, high for scale and numbers (thousands, an army, a herd), over_shoulder when two characters face each other, insert for a key object. Never use the same shot type twice in a row.
- Moves carry energy: push_in on tension, pull_back to reveal scale, pan to follow movement, whip on surprises, shake on gunfire, crashes and explosions.
- Use expressions only when something happens to that character; avoid unrelated scenery and irrelevant props.
ADVANCED PLACES AND OBJECTS (the 3D planner reads these, not the world list):
- location: the real place where this line happens, in plain words with city/area, indoors or outdoors and era (e.g. "Commercial Street in Boston's North End, 1919", "a Boston courtroom, 1925", "a dusty country road outside St. Louis, 1904"). Never squeeze it into the world list; keep the same wording while the story stays there.
- objects: the 0-2 concrete things this line is about, each as a descriptive phrase with material, purpose, era and scale (e.g. "huge riveted steel molasses storage tank, 1919", "wave of thick brown molasses", "elevated railway track on steel girders"). id = a stable snake_case name for the PHYSICAL thing, reused every time it appears (the tank is always the same id whether it stands, leaks or bursts; describe the state in the phrase). Use at most 6 different ids in the whole video, and include the story's main object in every line that talks about it. size: small (hand-held), medium (up to waist/chest), large (taller than a person, vehicle), huge (building, tank, ship, landmark).
- objects are only real physical things that could stand in that place: never people, crowds or animals, never captions, labels, signs, text, documents with writing, graphics, symbols, diagrams, arrows or question marks (those cannot be painted and will be dropped).
- props: only add a library id or built-in prop when it is exactly that object; a word match is not enough (a molasses tank is not an army tank).`;
const VISUAL_DIRECTOR = `You are the Visual Director of a bright outlined 3D cartoon Shorts studio. Every sentence must SHOW what the narrator says, using ONLY the listed vocabulary (the engine cannot draw anything else; never invent items, never write code).
Return a cast and exactly one direction per input sentence, in order.
Cast (2-3 members whenever the story involves more than one person or group; 1 only for a true solo story): stable ids that name the role (hero, captain, rival, queen, doctor...), different seeds 1-999, and an outfit from the outfits list that matches each person's job, era and place (soldier/knight/veteran for armies, queen/noble/king for royalty, doctor/nurse for medicine, pharaoh for ancient Egypt, cowboy for the Wild West, chef for food, monk/priest for religion, woman/maid/peasant for townsfolk). Every cast member gets a DIFFERENT outfit so viewers can tell them apart.
Use the whole cast: introduce each member on screen early, put the person a sentence is about on screen as the subject, and give the others reaction roles. Do not show the same single character in every scene.
Per sentence:
- world + light: keep the same world across consecutive sentences unless the story moves; storm_sea for storms, night_camp for night outdoors.
- actors: 1-3 performers on screen with distinct slots (left/center/right) and facing (-1 faces left, 1 faces right, 0 camera). If two characters interact, put both on screen facing each other. "actor"/"action"/"expression" repeat the main subject.
- action and expression must act out the verb and emotion of the sentence (grab, point, cower, cheer, shout, look_back, think, carry, pour...). Do not leave everyone idle.
- props: the concrete nouns the sentence names (pirate_ship approaching on the sea, wave rising, coins in hand, map, cannon). place=hand for something held (max one), sea for ships/waves, sky for clouds/sun/moon/gulls, background for buildings/towers, ground_left/right for objects. motion animates them (approach, rise, fall, bob, spin, grow).
- main prop: EVERY scene needs at least one prop, listed first, that is the hero object of that sentence (the thing the story is about: the vest, the barrel, the beaker, the ship). Keep the same hero object across sentences about it so viewers follow it. For "how it works" sentences show that object with shot insert or extreme_close (an explainer cutaway).
- animated library objects (marked animated) are rigged 3D people, animals, dinosaurs and monsters that really move: motion approach = walks/runs in, rise/fall = runs, spin/grow = celebrates, bob/none = idle. Prefer them for crowds, animals and creatures the story names.
- library objects: when a listed library object shows a noun better than the built-in props (animals, vehicles, food, furniture, buildings, space, graveyard, trees), use kind=asset with its exact id; never on place=hand. Use asset="" for built-in props. Buildings, trees, vehicles and ships go to background or sea; small items to ground_left/right.
- Choose models from each sentence's scene-matched list, not the first entries of the story-wide catalog. Prefer full 3D and rigged animals over flat art. A named animal or vehicle must be visible as that model, not a map/compass placeholder. Do not add unrelated objects for variety. Keep a recurring object's exact asset id stable. Main speaking cast stays the expressive drawn performers; rigged people are extras, not replacements for their speech/hand mechanics.
- shot + move: vary them like an editor. Establish with wide, show hands/objects with insert or close, reactions with close or extreme_close, threats with low; push_in on tension, shake on impact, whip on surprises, pull_back to reveal scale. Avoid the same shot twice in a row.
- mood: calm, tense (danger/mystery) or reveal (the twist/payoff sentence).
- fx: weather and moments (rain, lightning in storms, splash, smoke, fire, sparkle/burst on the reveal, dust on impacts).
- speaker: the actor id ONLY if the sentence is that character's spoken line (quoted dialogue); otherwise empty string.
- cues: up to 4 sound hits; word is the 0-based word index inside that sentence where the sound lands.
- keyword: the single most important word of the sentence for the yellow caption highlight, copied exactly as written.
If the core story truly cannot be shown with this vocabulary and the listed library objects, return empty scenes.
Vocabulary: ${JSON.stringify(VOCAB)}`;
export interface FactSheet { claims: Claim[]; myth: string; reality: string; hedge: string }
const factSchema = {
  type: "object", additionalProperties: false, required: ["claims", "myth", "reality", "hedge"],
  properties: {
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["claim", "sources", "date", "confidence"], properties: {
      claim: { type: "string" }, sources: { type: "array", items: { type: "string" } }, date: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] },
    } } },
    myth: { type: "string" }, reality: { type: "string" }, hedge: { type: "string" },
  },
};

export const factCheckOperation = async ({ data }: { data: { topic: string; deployment: string } }) => azureJson<FactSheet>(data.deployment,
    `You are a meticulous history & science fact-checker for a Shorts channel. List 5-8 atomic, checkable claims the video will rely on. For each give 2+ independent named sources (book, paper, museum, primary document, e.g. "Pliny, Natural History II.234", "Franklin letter to Brownrigg, 1774"), the date/period, and a confidence rating. Never invent sources; if you are unsure, lower confidence. "myth" = what the popular telling says, "reality" = what evidence supports. "hedge" = ONE short spoken line (max 12 words) the narrator must say if the effect is partial or overstated, else "".`,
    `Topic: ${data.topic}`, "fact_sheet", factSchema, "Fact checker");

// ---------------- Research: anchors, premise, question, payoff, money shot ----------------

export interface Research {
  anchors: { year: string; place: string; org: string; subject: string; stakes: string };
  premise: string; question: string;
  oneImage: { ok: boolean; picture: string };
  hero: { name: string; role: string; want: string };
  skeptic: { name: string; role: string }; threat: string;
  payoff: string; moneyShot: string; tries: string[]; analogy: string; proof: string;
}
const S = { type: "string" } as const;
const researchSchema = {
  type: "object", additionalProperties: false,
  required: ["anchors", "premise", "question", "oneImage", "hero", "skeptic", "threat", "payoff", "moneyShot", "tries", "analogy", "proof"],
  properties: {
    anchors: { type: "object", additionalProperties: false, required: ["year", "place", "org", "subject", "stakes"], properties: { year: S, place: S, org: S, subject: S, stakes: S } },
    premise: S, question: S,
    oneImage: { type: "object", additionalProperties: false, required: ["ok", "picture"], properties: { ok: { type: "boolean" }, picture: S } },
    hero: { type: "object", additionalProperties: false, required: ["name", "role", "want"], properties: { name: S, role: S, want: S } },
    skeptic: { type: "object", additionalProperties: false, required: ["name", "role"], properties: { name: S, role: S } },
    threat: S, payoff: S, moneyShot: S, tries: { type: "array", items: S }, analogy: S, proof: S,
  },
};

export const researchStoryOperation = async ({ data }: { data: { topic: string; facts: string; deployment: string; advanced?: boolean } }) => azureJson<Research>(data.deployment,
    data.advanced ? `You research a factual history or science Short. ${ADVANCED_STORY_DIRECTION}
Return the existing research fields. Subject is the actual object/person in everyday words. For a mechanism, year/place/org/stakes may be empty; hero can be the object with role "object" and want empty. Leave skeptic/threat empty unless real. Tries are documented causal steps, never invented failures. Premise describes what happens and why; question is a simple curiosity; proof and moneyShot show the real mechanism; payoff answers it accurately. Use only supplied checked facts, preserving qualifications.` : `You are the research producer of a story Shorts channel. From the topic and fact sheet, extract what the writer needs BEFORE writing:
- anchors: year (or era like "1940s"), place (main location of THIS story), org (organisation/people involved), subject (the one concrete noun the story is about, e.g. "factory", "ship"), stakes (one word for what is at risk, e.g. "bombers", "storm", "war"). Each anchor is 1-3 plain words that the narrator will literally say.
- premise: exactly "This video is about [WHO] who [ODD, VISIBLE ACTION] because [HIDDEN REASON]."
- question: ONE impossible question, max 10 words, a stranger understands with no context (e.g. "How do you hide a factory from the sky?").
- oneImage: ok=false if the odd action CANNOT be drawn in a single picture; picture = that single image.
- hero: ONE real or representative protagonist (named person if documented, otherwise a role like "the head painter") who WANTS something visible; want = one short sentence.
- skeptic: the person who voices the viewer's doubt. threat: the rival/danger.
- tries: 2-3 real attempts in order (naive try, why it failed, the bigger adaptation).
- payoff: the strongest documented consequence or twist for the ending. NEVER an absence ("nobody came"); if the result is an absence, frame it as success with a surprising detail.
- moneyShot: the one image that sums up the video (e.g. split view: fake street above, real factory below).
- analogy: one household analogy a 5-year-old gets. proof: one visual demonstration shot.
Only use facts from the fact sheet; word disputed things carefully.`,
    `Topic: ${data.topic}\nFact sheet:\n${data.facts}`, "research", researchSchema, "Research");

// ---------------- Blind judges (Pass A / B / C) ----------------

interface PassAnswer { what: string; where: string; odd: string; next: string }
const passASchema = { type: "object", additionalProperties: false, required: ["what", "where", "odd", "next"], properties: { what: S, where: S, odd: S, next: S } };
const passBSchema = { type: "object", additionalProperties: false, required: ["premise", "hero", "want", "question"], properties: { premise: S, hero: S, want: S, question: S } };
const passCSchema = { type: "object", additionalProperties: false, required: ["answered", "answer", "payoff", "weakest"], properties: { answered: { type: "boolean" }, answer: S, payoff: S, weakest: S } };
const gradeSchema = {
  type: "object", additionalProperties: false, required: ["passA", "passB", "readAloud", "literal", "filler", "swipe"],
  properties: {
    passA: { type: "integer" }, passB: { type: "integer" },
    readAloud: { type: "array", items: S }, literal: { type: "array", items: { type: "integer" } }, filler: { type: "array", items: S }, swipe: { type: "array", items: S },
  },
};

export const judgeScriptOperation = async ({ data, checkpoint = <T,>(fn: () => Promise<T>) => fn() }: { data: { first3: string; first15: string; full: string; truth: string; shots: string; deployment: string; advanced?: boolean; shape?: boolean }; checkpoint?: <T>(fn: () => Promise<T>) => Promise<T> }) => {
    const blind = "You are a cold viewer who has never heard of this topic. Answer ONLY from what you are shown; if you can't tell, answer \"unclear\".";
    const a = await checkpoint(() => azureJson<PassAnswer>(data.deployment, blind, `You saw the first 3 seconds of a Short:\n${data.first3}\nWhat is happening? Where? Why is it odd? What might happen next?`, "pass_a", passASchema, "Judge A"));
    const b = await checkpoint(() => azureJson<{ premise: string; hero: string; want: string; question: string }>(data.deployment, blind, `You saw the first 15 seconds:\n${data.first15}\n${data.advanced ? 'State the premise; hero = actual subject/object; want = why the action or mechanism matters; question = curiosity raised by the opening, explicit or implicit. Do not demand a human goal in a device explanation.' : 'State the premise, the hero, what the hero wants and the central question.'}`, "pass_b", passBSchema, "Judge B"));
    const c = await checkpoint(() => azureJson<{ answered: boolean; answer: string; payoff: string; weakest: string }>(data.deployment, blind, `Full script:\n${data.full}\nWas the opening question answered (quote the answer)? What was the payoff? Which beat was weakest?`, "pass_c", passCSchema, "Judge C"));
    const g = await checkpoint(() => azureJson<{ passA: number; passB: number; readAloud: string[]; literal: number[]; filler: string[]; swipe: string[] }>(data.deployment,
      "You grade blind viewer answers against the truth, and audit a script. Be strict but fair: an answer is correct if a stranger clearly got the idea. readAloud flags grammatical defects only, never brevity, quoted dialogue, present tense or unfamiliar subject matter. A full subject-verb sentence such as 'Then a dragon clicks.' or 'A bronze ball drops west.' is grammatical. Dialogue with attribution such as '\"That cannot work,\" a minister laughs.' is grammatical. filler must exclude first introductions of a checked year/place and new consequences such as a delayed courier confirming the event. literal audits the visible noun/action, not whether an invisible idea can be photographed." + (data.advanced ? " For an object/mechanism, score understanding of subject, causal steps, purpose and curiosity rather than a human want. No required date/location when irrelevant. Also flag confusing metaphors, unexplained technical terms, missing causal steps and ambiguous referents as swipe issues. A necessary connecting sentence is not filler. Do not demand danger or a surprise in every line. Evaluate the first three spoken words for concrete interest, without borrowing clarity from captions." : '') + (data.shape ? ` ${STORY_SHAPE_JUDGE} Short fragments used for rhythm ("No wires. No battery. Nothing.") and a one-word "How?" are NOT read-aloud defects. The hero may be an object and the want may be implied by the trap.` : ''),
      `TRUTH:\n${data.truth}\n\nPass A answers (what/where/odd/next): ${JSON.stringify(a)}\nPass B answers (premise/hero/want/question): ${JSON.stringify(b)}\n\nFULL SCRIPT:\n${data.full}\n\nSCENES (index: narration => visual):\n${data.shots}\n\nReturn passA = number of the 4 Pass A answers that are correct, passB = number of the 4 Pass B answers that are correct. readAloud = sentences that are fragments, drop words, or don't parse when spoken aloud (quote them; [] if none). literal = scene indexes whose visual does NOT literally show the main noun/action of its narration. filler = sentences that only describe a scene and add no new fact or reversal. swipe = sentences (quote them) where a bored 8-year-old scrolling Shorts would swipe away: no surprise, no danger, no new fact, no funny moment, or a word they don't know ([] if none).`,
      "grade", gradeSchema, "Grader"));
    return { passA: g.passA, passB: g.passB, passC: !!c.answered, payoff: c.payoff, weakest: c.weakest, readAloud: g.readAloud, literal: g.literal, filler: g.filler, swipe: g.swipe ?? [], answers: { a, b, c } };
  };

// ---------------- Continuity gate (vision) ----------------

export const checkContinuityOperation = async ({ data }: { data: { sheet: string; shot: string; cast: string; deployment: string } }) => {
    const res = await azure(`${safeName(data.deployment)}/chat/completions`, {
      messages: [
        { role: "system", content: "You check character continuity for an animated series. Compare the characters in the SHOT to the REFERENCE SHEET: same face, hair, outfit, colours, proportions." },
        { role: "user", content: [
          { type: "text", text: `Characters expected in the shot: ${data.cast.slice(0, 600)}. Image 1 = reference sheet, image 2 = shot. Score 0-10 how closely the characters match (10 = identical). Reply JSON {"score": n, "issue": "..."}.` },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.sheet}`, detail: "low" } },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.shot}`, detail: "low" } },
        ] },
      ],
      max_completion_tokens: 2000, reasoning_effort: effortFor(data.deployment, "none"),
      response_format: { type: "json_schema", json_schema: { name: "continuity", strict: true, schema: { type: "object", additionalProperties: false, required: ["score", "issue"], properties: { score: { type: "integer" }, issue: S } } } },
    });
    if (!res.ok) await fail(res, "Continuity check");
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    try { return JSON.parse(j.choices?.[0]?.message?.content ?? "") as { score: number; issue: string }; } catch { return { score: 10, issue: "unreadable" }; }
  };

// ---------------- Hooks ----------------

export interface Hook { type: string; line: string; visual: string; text: string; curiosity: number; clarity: number; visualness: number; speakability: number }
const hookSchema = {
  type: "object", additionalProperties: false, required: ["hooks"],
  properties: { hooks: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["type", "line", "visual", "text", "curiosity", "clarity", "visualness", "speakability"],
    properties: {
      type: { type: "string", enum: ["paradox_image", "shocking_number", "mid_action", "direct_question", "contrarian"] },
      line: { type: "string" }, visual: { type: "string" }, text: { type: "string" },
      curiosity: { type: "integer" }, clarity: { type: "integer" }, visualness: { type: "integer" }, speakability: { type: "integer" },
    } } } },
};

export const generateHooksOperation = async ({ data }: { data: { topic: string; facts: string; research: string; prefer?: string; deployment: string; advanced?: boolean; shape?: boolean } }) => {
    const shapeHook = data.shape ? `\nSTORY SHAPE v3 OVERRIDE for every hook: 8-12 words, a CONTRADICTION that makes the viewer need the answer and HIDES the reason (no "because", "which is why" or mechanism). No mandatory year or place. Gold hooks: "A gift with no battery spied on America for seven years." / "Hannibal was trapped, so he strapped fire to two thousand oxen."` : '';
    if (data.shape) {
      // Shorts: the gold-shape hook prompt replaces the legacy type quotas (no direct questions, no mandatory place/time).
      const sys = `You write the first 3 seconds of viral story Shorts. Write exactly 10 different hooks in the owner's gold shape.
"line": 8-12 words, ONE plain statement (never a question), a CONTRADICTION that pairs the strange fact with what makes it impossible ("A gift with no battery spied on America for seven years." / "Hannibal was trapped, so he strapped fire to two thousand oxen."). It hides the reason: never "because", "which is why" or the mechanism. Say the subject in the first 8 words. Words a 10-year-old knows, no metaphors, no "we/us". Every number and name must come from the fact sheet.
"visual" = a literal WIDE first frame showing the odd thing (never a face close-up). "text" = at most 6 words, states the oddity as a fact, must not repeat the spoken line's words. Score each 1-10 honestly on curiosity, clarity, visualness, speakability.${data.advanced ? `\n${ADVANCED_STORY_DIRECTION}` : ''}`;
      const ask = (extra = '') => azureJson<{ hooks: Hook[] }>(data.deployment, sys, `Topic: ${data.topic}\nResearch (anchors, premise, question):\n${data.research}\nFact sheet:\n${data.facts}${extra}`, "hooks", hookSchema, "Hook writer");
      let all = (await ask()).hooks;
      const good = (h: Hook[]) => h.filter((x) => !hookShapeIssues(x.line).length);
      if (good(all).length < 3) {
        const bad = all.filter((x) => hookShapeIssues(x.line).length).slice(0, 5).map((x) => `"${x.line}": ${hookShapeIssues(x.line).join('; ')}`).join('\n');
        all = [...good(all), ...(await ask(`\nYour previous hooks failed these checks; write 10 new ones that pass:\n${bad}`)).hooks];
      }
      return { all };
    }
    const r = await azureJson<{ hooks: Hook[] }>(data.deployment,
      (data.advanced ? `Write exactly 10 original hooks, two each of paradox_image, shocking_number, mid_action, direct_question, contrarian. ${ADVANCED_STORY_DIRECTION}\nReturn line (4-12 words), visual (literal wide/action first frame), text (at most six words, fact not question, not repeating spoken wording), curiosity/clarity/visualness/speakability (honest 1-10). Each first three words must contain the subject or concrete act, with a specific fact by the end. No invented numbers or stakes; no mandatory year/place.` : `You write the first 3 seconds of viral story Shorts. Write exactly 10 hooks, 2 of each type: paradox_image, shocking_number, mid_action, direct_question, contrarian.
HARD RULES for "line" (the first spoken sentence):
- 8-12 words. Open mid-crisis or on the stakes (danger, a chase, a looming failure, a strange action happening NOW). NEVER start with a date ("In 1965..."), a name + biography ("X was a chemist"), or a dry fact; put the year later in the sentence. Use a strong action verb (roars, snaps, swallows, surges, races).
- No greeting, no joke setup, no riddle, never "Did you know", never "Imagine", never "A [job] knocks...", nothing that needs context from later.
- Must contain: a concrete subject (say the subject anchor word), an odd action or number, and a place OR time anchor (say the year/era or place).
- States the oddity in concrete words a 5-year-old understands, so a stranger instantly knows what is odd. It may tease but must not give the hidden reason.
- Every number must come from the fact sheet. Family-friendly words only. direct_question hooks must still contain the subject + anchor.
"visual" = the first frame: a WIDE shot that shows the odd thing (never a face close-up).
"text" = on-screen hook text, max 6 words, states the oddity as a FACT (no question mark), and must NOT repeat the spoken line's words (e.g. spoken "America hid a whole bomber factory under a fake street in 1942." -> text "FAKE STREET. REAL BOMBERS.").
Score each 1-10 honestly on curiosity, clarity, visualness, speakability.${data.prefer ? `\nOur audience data says these hook types perform best (in order): ${data.prefer}.` : ""}`) + shapeHook,
      `Topic: ${data.topic}\nResearch (anchors, premise, question):\n${data.research}\nFact sheet:\n${data.facts}`, "hooks", hookSchema, "Hook writer");
    return { all: r.hooks };
  };

// ---------------- Script / plan ----------------

export interface PlanInput {
  topic: string;
  format: "long" | "short";
  durationSec: number;
  archetype: string;
  style: string;
  deployment: string;
  facts?: string; // fact-check summary (claims, myth vs reality, hedge)
  research?: string; // anchors, premise, question, hero, payoff, money shot
  hook?: string; // chosen opening line
  repair?: string; // validator issues from a previous draft
  kid?: boolean; // Advanced Video AI: words an 8-year-old knows, stricter story shape
  shape?: boolean; // Story Shape v3 (owner's gold Shorts) overrides the older beat quotas
  lockedNarration?: string[]; // Shorts Writer v4: approved voice-over lines; the plan only splits them into scenes
}
export type Camera = "push_in" | "pull_out" | "pan_left" | "pan_right" | "tilt_up" | "tilt_down" | "punch_in" | "orbit" | "hold";
export interface PlanCharacter { name: string; role: string; look: string }
export interface PlanScene {
  beat: string; narration: string; image_prompt: string; characters: string[];
  camera: Camera; sfx: string; mood: "tension" | "reveal"; color: string; angle: string;
  shot: "wide" | "aerial" | "action" | "macro" | "face"; money: boolean; loop_opened: string; loop_closed: string; purpose: string;
}
export interface PlanBeat { beat: string; start_s: number; end_s: number; words: number; purpose: string; loop_opened: string; loop_closed: string; visual: string; camera_move: string }
export interface Plan {
  premise: string; question: string; hero: { name: string; role: string; want: string };
  beats: PlanBeat[]; script: string; title: string; description: string; palette: string; hookText: string; loopLine: string; characters: PlanCharacter[]; scenes: PlanScene[];
}

const BEATS = ["hook", "context", "question", "try", "fail", "escalation", "myth", "reveal", "analogy", "proof", "payoff"];
const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["premise", "question", "hero", "beats", "script", "title", "description", "palette", "hookText", "loopLine", "characters", "scenes"],
  properties: {
    premise: S, question: S,
    hero: { type: "object", additionalProperties: false, required: ["name", "role", "want"], properties: { name: S, role: S, want: S } },
    beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["beat", "start_s", "end_s", "words", "purpose", "loop_opened", "loop_closed", "visual", "camera_move"], properties: {
      beat: { type: "string", enum: BEATS }, start_s: { type: "number" }, end_s: { type: "number" }, words: { type: "integer" }, purpose: S, loop_opened: S, loop_closed: S, visual: S, camera_move: S,
    } } },
    hookText: S, loopLine: S, script: S, title: S, description: S, palette: S,
    characters: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "role", "look"], properties: { name: S, role: S, look: S } },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beat", "narration", "image_prompt", "characters", "camera", "sfx", "mood", "color", "angle", "shot", "money", "loop_opened", "loop_closed", "purpose"],
        properties: {
          beat: { type: "string", enum: BEATS },
          color: { type: "string", enum: ["bright", "dark_cold", "warm_interior", "golden_macro", "high_contrast"] },
          angle: { type: "string", enum: ["wide", "close", "aerial", "top_down", "macro", "pov", "low_angle", "over_shoulder"] },
          shot: { type: "string", enum: ["wide", "aerial", "action", "macro", "face"] },
          money: { type: "boolean" },
          loop_opened: S, loop_closed: S, purpose: S,
          narration: S,
          image_prompt: S,
          characters: { type: "array", items: S },
          camera: { type: "string", enum: ["push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "punch_in", "orbit"] },
          sfx: { type: "string", enum: ["none", "whoosh", "boom", "snap", "splash", "thunder", "creak", "coin", "fire", "heartbeat", "crowd", "clang", "wind", "pour", "wave", "crash", "spray", "knock", "rustle", "plane", "siren", "impact"] },
          mood: { type: "string", enum: ["tension", "reveal"] },
        },
      },
    },
  },
};

const KID_RULES = (words: number) => `
KID-LEVEL WORDS (Advanced Video AI; these override the language rules above where stricter):
- An 8-year-old must understand EVERY word. Use words a second-grader says every day. Names of people and places are fine; explain them in kid words the first time ("San Juan, a small island").
- Banned adult words and their swaps: boundary -> line between two lands; dispute/conflict -> fight; escalate -> get worse; crisis -> big problem; treaty -> deal; territory -> land; military/troops -> army/soldiers; government/officials -> leaders; vessel -> ship; massive -> huge; ancient -> very old; incident -> thing that happened; negotiate -> talk it out; commander -> boss; eventually -> in the end.
- Natural complete sentences, usually 6-16 words, connected by so/but/because. Do not chop a sentence just to fit one shot. The voice is for everyone, with words a child understands, not baby talk.
- Every sentence must make a kid want the next one: a surprise, a danger, a funny moment or a new fact. Never two calm lines in a row.
- Talk like a real storyteller, not a headline: full natural sentences with little joiners (so, but, then, uh-oh), never clipped telegraph lines like "Calm heads win." or "Hudson's Bay Company wants pay." Say WHO does WHAT and WHY it is funny or scary.
- Prefer a person or animal doing something ("The pig squeezes under the fence and munches Lyman's potatoes!") over a fact about organisations.
- Exactly ${words} words (±10%). Count them; a machine checks.
- If an animal or object causes the story (a pig, a cannon, a jar), name it in the first sentence and keep it on screen: it is a character.`;
const EXPLAINER_RULES = `
ADVANCED EXPLAINER OVERRIDE: When the topic explains a device, natural process or mechanism rather than a documented event, REPLACE mandatory hero-want, rival, organisation/year/place anchors, try-fail cycles and invented dialogue with: concrete strange hook -> one clear question -> sequential physical steps -> visible proof -> plain answer. Use the real object as the subject; do not give clocks, chips, signals or GPS human feelings. A user is optional, not a quota. Never fabricate failed attempts, historical dates or danger. Explain technical words accurately on first use (a satellite is a machine moving around Earth; GPS uses radio travel times from satellites to find position). Never call a signal a voice or an intersection a shout. Write connected, accurate everyday sentences that make sense aloud. Keep cause and effect and qualifications. History topics keep factual motives and chronology without inventing people or quotes. This overrides the supplied story examples where they conflict.`;
const MICRO_RULES = (D: number, words: number, scenes: number) => `
LOOP SHORT (${D} seconds; these rules REPLACE the skeleton, word clock, myth, analogy, escalation and long payoff rules above):
- Exactly ${scenes} scenes and ${words} words in total (±10%). No more: the voice must fit in ${D} seconds.
- Scene 1 (0-2s): the hook, max 8 words, the strangest true fact with the subject word. Scene 2 (by 5s): one short question ending "?" (loop_opened "main"). Middle scenes: one new surprise each, the hero acting. Last scene: the answer as a twist (loop_closed "main"), written so it flows straight back into the first line when the video loops.
- The hero (person or animal) is in at least 60% of scenes. No myth line, no "Ever ...?" analogy, no dates in the first line.`;
export const generatePlanOperation = async ({ data }: { data: PlanInput }): Promise<Plan> => {
    const short = data.format === "short";
    const D = data.durationSec;
    const words = Math.round(D * (short ? 2.6 : 2.37)); // Atlas Shorts pace ~153 wpm; long-form narrator ~142 wpm
    const micro = short && D < 25; // seamless loop Short (the guide's 12-second format)
    const scenes = short ? (micro ? Math.max(3, Math.round(D / (data.kid ? 4 : 2.5))) : Math.max(8, Math.round(D / 3))) : Math.min(90, Math.max(14, Math.round(D / 6)));
    const perScene = Math.round(words / scenes);
    const at = (f: number) => Math.round(D * f);
    const system = `You write ${D}-second ${short ? "vertical story Shorts" : "story documentaries"} for a viral history & science channel. You write a STORY with a hero, not a lecture.
First output the premise sentence and an impossible question of at most 10 words. Then output a beat sheet with fields: beat, start_s, end_s, words, purpose, loop_opened, loop_closed, visual (must literally show the narrated noun/action), camera_move.
The video has ONE hero with a want, at most 3 recurring characters (hero, skeptic or ally, threat), and a money-shot image that appears early and again at the payoff.
The hook (8-12 words) opens mid-crisis or on the stakes with a concrete oddity and a place or time anchor; it never starts with a date ("In 1965..."), a biography line, a riddle, joke setup or greeting (put the year later in the sentence). By 8s the viewer knows who, where, when and what is at stake. From ~${at(0.15)}s to ~${at(0.7)}s run try-fail-adapt twice, each bigger than the last. Reveal the answer once, with one everyday analogy and one visual proof. Close the opening question in the last 8 seconds. Sentences are 3-12 words and must be grammatical when spoken aloud. Re-hook every 6-8 seconds.

WORD CLOCK (the narrator says ~2.6 words per second — count words, this is checked by a machine):
- Words 1-12: the hook; say the EXACT subject anchor in its first 8 words and a checked place or year. Within words 1-20 (=8s), say subject, year, place and stakes. Start the ONE main question by word 20 and finish it by word 30 (ending "?", max 12 words, matching the research mystery). The question may overlap the hero-want sentence; combine anchors naturally rather than cramming labels. No second question starts before word 39.
- Within words 1-26 (=10s): the sentence "[hero name] wants/needs ..." and the org name by word ~38 (=15s).
- The main question is answered (loop_closed "main") in a scene starting at 65-75% of all words.
- The LAST ~20 words repeat the main question's key words and answer it plainly.

SKELETON (scale to ${D}s):
- 0-3s hook: the oddity in concrete words, shown on screen (wide shot, money shot or the odd thing).
- 3-${at(0.15)}s context: place, year, who, what is at stake. Premise fully clear by 8s. Say ALL anchors by 8s: subject, year, place, stakes; say the org by 15s.
- by 8s question: the main question is SPOKEN (one sentence ending "?", max 12 words, plain words). It is the ONLY question before 15s. Then try #1 shown visibly.
- ${at(0.3)}-${at(0.7)}s escalation: try -> fail -> adapt, twice; each bigger, riskier or stranger. One skeptic line in quoted dialogue ("That can't work."), one rival/threat. Beats "try", "fail", "escalation" (a "fail" or "escalation" beat must start before 30s).
- myth beat at 40-60% of the words: "Most people think/picture X. Actually Y." before the proof.
- reveal + analogy + proof (main loop closes at 65-75%): ONE reveal that answers the question, ONE household analogy starting "Ever ...?" built on a physical action every viewer has done and can picture instantly (blowing on hot soup, squeezing a sponge, ripping tape, shaking a snow globe); never a lab, chemistry or cooking-technique concept (no gelatin, solutions, polymers), ONE visual proof shot.
- STORYTELLING VOICE: active voice and vivid physical verbs (roars, snaps, surges, slams); at least two short quoted lines of dialogue between characters across the video; every scene is something HAPPENING, not an explanation.
- payoff (last ~${Math.max(6, at(0.12))}s): a dramatic on-screen EVENT the viewer did not expect (the wave hits the pirates, the vest stops the bullet), never a re-explanation or summary of the science (never an absence like "nobody came" unless framed as success: "It worked so well that..."). The final 8s REPEAT the opening question's words and answer it plainly ("So how do you hide a factory from the sky? You turn its roof into a fake street."). loopLine = that closing line.

HERO & CAST:
- The hero (a person, named if documented, else a clear role like "the head painter") states their want by 10s in a sentence of the exact form "[hero name] wants/needs/must ..." ("Lockheed wants the factory hidden from enemy bombers."). Use the hero's name in that sentence and in "hero.name". The hero appears (in "characters") in at least 60% of scenes.
- Every character is introduced with a name or role in the same sentence. Every "he/she/they" must refer to someone named in the previous sentence; otherwise repeat the name. Never introduce side characters, extra places or side examples.

ONE CONTINUOUS STORY (most important):
- The whole video is ONE story about ONE event, told in time order, start to finish. Never jump to a second example, another country, another era or "another time". No list of facts.
- Every scene follows from the one before: it is caused by it, reacts to it, or continues it. Link scenes with plain joiners ("So", "But", "Then", "Now", "That's when"). If you removed one scene, the next one should stop making sense.
- The same hero, place and problem run from the hook to the last line. The try/fail beats are the hero's own attempts at that same problem. The reveal, analogy and proof all explain that same event.

LANGUAGE:
- Write like you are telling a story to a 5-year-old at bedtime: tiny everyday words, grade-1 reading level. If a kid wouldn't say the word, swap it ("hide" not "conceal", "big" not "massive", "ship" not "vessel", "plan" not "strategy", "trick" not "illusion", "old" not "ancient", "smart" not "ingenious").
- NEVER speak beat labels ("Try one:", "Proof:", "Step two:"). Every sentence is a full spoken sentence with a verb — never a list or a bare place name ("Burbank, California." is wrong; "This is Burbank, California." is right).
- Words a 5-year-old knows. Apart from the anchor words, avoid words of 3+ syllables (say "street" not "neighborhood", "work" not "production", "can't be seen" not "invisible"). Short, complete subject-verb-object sentences, present tense for action, one idea per sentence. Every sentence adds one new fact or a reversal; delete scene-only description.
- Re-hook every 6-8s after 15s with a new danger, number, reversal or question.
- Use sound words on key moments (knock, splash, crash, boom, creak, rustle, siren, plane, thunder) so the editor can add sound.
- Family-friendly words only (never blood, kill, die, dead, corpse, stab, slaughter, drown). Stay inside the fact sheet; word disputed claims carefully ("no attack is documented").
- No subscribe calls, no "in this video".

LOOP REGISTRY: in scenes, set loop_opened/loop_closed to loop ids. The main question is id "main" (opened in the question scene, closed in the reveal at 65-75%). Every other loop you open (e.g. "q2") must be closed before the end.

VISUALS (one scene ≈ 3s, one clear moment):
- image_prompt shows exactly what the narration says (the main noun or action, literally): if the line says "a plane", show the plane. Show the process (hands painting, nets being hung, the view from above).
- shot: wide/aerial (≥40% of scenes), action (~30%), macro/process insert (~20%), face close-up (≤30%, never the first scene). Avoid posed smiling groups looking at camera.
- money: true for the money-shot scene (by 10s) and again for a payoff scene (both show the money-shot image).
- color per beat with a story reason: bright (setup), dark_cold (tension), warm_interior (reveal), golden_macro (proof), high_contrast (payoff).
- camera: a move every shot (push_in, pull_out, pan_left, pan_right, tilt_up, tilt_down, punch_in for shocks, orbit for scale). angle: vary every scene.
- characters: max 3, each with name, role and a very specific fixed look (age, build, face, hair, clothing colours, one prop).
- palette: one sentence of LIGHT, bright colors (light skies, soft pastels, sunny tones). Never a dark or gloomy palette; even night or storm scenes are brightly lit and readable.
- Safety filter: no gore, injuries, corpses, children, nudity or real living people. Show danger indirectly. Never put text or letters in images.
- sfx: the sound of the visual event (knock, rustle, plane, siren, impact, pour, wave, crash...).
- hookText: max 6 words, states the oddity as a fact, never repeats the spoken hook words.

${data.kid ? KID_RULES(words) + EXPLAINER_RULES : ""}${micro ? MICRO_RULES(D, words, scenes) : ""}
Write the WHOLE narration first in "script" (read it aloud in your head; fix anything that doesn't parse), THEN split that exact text, word for word, into the scenes' "narration" fields.

${short ? "" : `
LONG-FORM RETENTION (this is a ${Math.round(D / 60)}-minute video; these rules override the Shorts timings above where they differ):
- Open with the same hook, main question and hero want inside the first 20 seconds, then ONE promise line before 30s that the ending pays off ("By the end, you will see why that one bucket saved the whole ship."). Never say "in this video".
- Split the story into CHAPTERS of ~60-90 seconds (${Math.max(3, Math.round(D / 75))} chapters). Each chapter has its own small question: open it in the chapter's first scene (loop_opened "c1", "c2", ...) and answer it in that chapter's last scene.
- STACK THE LOOPS: open the next chapter's question BEFORE you answer the current one ("That fixed the leak. But it caused a much bigger problem."), so at every moment the viewer is waiting for at least one answer. The main question stays open until ~70%.
- Every 15-25 seconds add a re-hook: a surprising number, a reversal ("But it didn't work."), a ticking stake, or a tease of what's coming ("And that's not even the strangest part.").
- A big twist at ~50% that changes what the viewer thought was going on.
- Each chapter moves the SAME story forward in time (new try, new obstacle, new discovery). More detail, more tries and more real facts than a Short, but still one story, never a list.
- Narrator voice is a calm, warm documentary storyteller: sentences may run up to 16 words now and then, but most stay short and spoken.
- One scene ≈ 5-7 seconds of narration; vary shots and camera moves so the picture changes at every scene.
- Last 20 seconds: answer the main question plainly, then a closing line that makes the payoff stick.`}
EXAMPLES (learn the structure, never reuse content):
${FEW_SHOT}`;
    const user = data.kid ? `Topic: ${data.topic}\n${short ? 'Short 9:16' : 'Documentary 16:9'}, ${D} seconds, target ${words} words. About ${scenes} scenes, not a words-per-scene quota. Write natural sentences first, then split only at useful literal visual moments.\nCHECKED FACTS:\n${data.facts ?? ''}\nRESEARCH (facts not mandatory beat quotas):\n${data.research ?? ''}\nPreferred opening: ${data.hook ?? 'choose the clearest concrete fact'}; rewrite if it is vague or names the wrong subject.\n${data.repair ? `Previous draft and failures:\n${data.repair}` : ''}\nReturn an original complete plan, with no image text, no mathematical labels, no invented people for object narration. Use loop id main for the actual puzzle and answer. Read every sentence as one connected thought. An example of plain mechanism language (not content to copy): "Your compass works without a battery. Its needle is a tiny magnet, and Earth is a giant one. That pull turns the needle until it points north." Do not compress the answer into "often off true" or leave a technical term unexplained.` : `Format: ${short ? "YouTube Short / Reel, vertical 9:16" : "long-form YouTube story documentary, 16:9 (same structure, more tries and more detail)"}.
Topic: ${data.topic}
Viral archetype: ${data.archetype}
Target: ${D} seconds ≈ ${words} words of narration total (±8%). About ${scenes} scenes of ~${perScene} words each.
${data.research ? `Research (use these anchors, hero, question, tries, payoff and money shot):\n${data.research}\n` : ""}${data.facts ? `Fact sheet (obey it):\n${data.facts}\n` : ""}${data.hook ? data.repair ? `Preferred hook: "${data.hook}". Rewrite it if the opening checks require it.\n` : `Open with this exact hook line: "${data.hook}"\n` : ""}${data.repair ? `A previous draft FAILED these checks — fix every one, including scene metadata and visuals. Structural failures require a structural rewrite, not cosmetic edits:\n${data.repair}\n` : ""}Return a click-worthy title (under 60 chars) and a 2-sentence YouTube description.`;

    const repairPriority = data.repair && !data.kid ? `\nFINAL REPAIR PRIORITY: The earlier examples are structure references, not exceptions. The repair contract and checked facts override every example and preferred hook. Before returning JSON, count the opening words and verify the main question STARTS by word 20. Put it immediately after the hook, before secondary context. Then state the hero's want. Do not put decorative setting lines before the question. Recount the WHOLE scene narration: target ${words} words, maximum ${Math.floor(words * 1.08)}. Verify every named character, shot and loop field as well as the spoken lines. Do not present a speculative reconstruction or invented try/fail as a historical fact.` : '';
    const advancedSystem = `${ADVANCED_STORY_DIRECTION}\nFormat: ${short ? 'vertical Short' : 'landscape documentary'}, ${D} seconds, target ${words} words (90-108%), about ${scenes} literal scenes. Up to four actual recurring cast members, no minimum. Fields follow the JSON schema. Keep scene timings/beat words consistent with narration. For long form, build curiosity across factual chapters every 60-90 seconds. For a Short under 25 seconds, tell just one tiny mechanism or event; omit secondary context rather than cramming it in. Do not force a dramatic twist if the plain answer is satisfying.`;
    // Shape v3 REPLACES the legacy beat-quota prompt (appending it was ignored in tests: myth/analogy/skeptic lines persisted).
    const shapeSystem = `You write ${D}-second vertical story Shorts for a viral history & science channel.
${STORY_SHAPE_DIRECTION}
Target ${words} words in total (90-105%; a machine counts), about ${scenes} scenes.
BEAT SKELETON (fill it in order; every line is one sentence):
L1 the given hook, word for word. L2-L4 present-tense setup that already contains danger or a mystery (no bare dates, no "X works in an office" lines). L5 a loop line ("How?" alone, or "But..."/"Yet..."/"Nothing." pressure). L6-L8 the first attempt or clue. L9 a loop line (a reversal, "Then...", "But it gets stranger."-style turn, or a held-back question). L10-L12 the mechanism, one visible action per line. L13 a loop line (a new problem, doubt or "Nobody knows why yet"). L14-L16 the reveal. L17 the payoff line, 8 words or fewer. L18 the close: echo two or three hook words inside a NEW sentence; never repeat the hook or any earlier line.
RULE: never more than 3 sentences in a row without a loop line (question, but/yet/then/until/nothing/nobody/instead/wrong/secret, or a reversal). Every setup line must carry a surprise, danger or new fact, or a viewer swipes: never a bare date or place line ("North America, 1890s."), never "X works in an office", never scenery with no consequence ("A fast train rushes toward shining steel."). No "like..." comparisons. Only use names that appear in the checked facts; if a person's name is not there, say "an engineer" or "a reporter". Use only words a 10-year-old knows; replace Latin or technical names with plain words.
Write the WHOLE voice-over first in the gold shape, then split it into scenes at literal visual moments; scene narrations concatenate exactly to "script".
The research may list tries, a skeptic, a myth or an analogy: use them ONLY if they are real and fit the gold shape; never add a "Most people think" line, an "Ever ...?" analogy or a staged "That can't work" quote by default.
JSON fields: question = the held-back question the story answers; hero = the real person, or the object if there is no person; loop_opened "main" where that question is planted and loop_closed "main" where it is answered; money = true on the hook scene and the payoff scene; each visual literally shows its narrated noun/action; at most 3 recurring characters. Shot mix: at least 40% wide or aerial, about 30% action, about 20% macro, at most 30% faces, never a face first. hookText: max 6 words, states the oddity as a fact, never repeats the spoken hook.`;
    if (data.lockedNarration?.length) return splitLockedNarration(data, D, scenes);
    const plan = await azureJson<Plan>(data.deployment, data.shape ? `${data.kid ? `${ADVANCED_STORY_DIRECTION}\n` : ''}${shapeSystem}` : data.kid ? advancedSystem : system + repairPriority, user, "video_plan", planSchema, "Script writer");
    if (!plan.scenes?.length) throw new Error("Script writer returned an empty plan");
    if (data.shape && data.hook) lockShapeHook(plan, data.hook);
    return plan;
  };

/** Shorts Writer v4: the narration is final; this pass only adds scenes, pictures and cast without changing a word. */
const wordsOf = (t: string) => t.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean).join(" ");
/** Re-cut scene texts from the ORIGINAL voice-over (exact punctuation, curly quotes, dashes), keeping the director's
 * scene boundaries. The render start demands scenes joined === script character for character; a dropped comma or
 * straightened apostrophe from the AI would otherwise fail the video after paid voice/pictures. */
export function snapScenesToNarration<T extends { narration: string }>(scenes: T[], narration: string): T[] {
  const tokens = narration.split(/\s+/).filter(Boolean);
  const count = (t: string) => (wordsOf(t) ? wordsOf(t).split(" ").length : 0);
  const out: T[] = []; let k = 0;
  scenes.forEach((sc, i) => {
    let need = count(sc.narration); const take: string[] = [];
    while (k < tokens.length && (need > 0 || (take.length && count(tokens[k]!) === 0))) { need -= count(tokens[k]!); take.push(tokens[k++]!); }
    if (i === scenes.length - 1) while (k < tokens.length) take.push(tokens[k++]!);
    if (take.length) out.push({ ...sc, narration: take.join(" ") });
  });
  return out;
}
async function splitLockedNarration(data: PlanInput, D: number, scenes: number): Promise<Plan> {
  const narration = data.lockedNarration!.join(" ");
  const system = `You are the visual director for a ${D}-second vertical story Short. The voice-over below is FINAL and approved: never add, remove, reorder or change a single word or punctuation mark.
Split it, in order, into about ${scenes} scenes at literal visual moments (a scene is one or two short sentences or part of a long one). Scene narrations concatenated with single spaces must equal the voice-over EXACTLY; set "script" to the full voice-over.
For each scene: image_prompt literally shows the narrated noun/action; at most 3 recurring characters (real people from the story, or the object if there is none); shot mix at least 40% wide or aerial, about 30% action, about 20% macro, at most 30% faces, never a face first. question = the story's main question; hero = the real person or object; loop_opened "main" on the scene that plants the question and loop_closed "main" on the scene that answers it; money = true on the hook scene and the payoff scene. Beats: hook, setup, escalation, twist, payoff, close. hookText: max 6 words, states the oddity as a fact, never repeats the spoken hook. Title and description must be factual.`;
  const user = `Topic: ${data.topic}\nStyle: ${data.style}\nCHECKED FACTS:\n${data.facts ?? ''}\nFINAL VOICE-OVER (one line per spoken thought):\n${data.lockedNarration!.join("\n")}`;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const plan = await azureJson<Plan>(data.deployment, system, attempt ? `${user}\nYour previous split changed the words (${last}). Copy the voice-over exactly.` : user, "video_plan", planSchema, "Scene director");
    if (plan.scenes?.length && wordsOf(plan.scenes.map((s) => s.narration).join(" ")) === wordsOf(narration)) return { ...plan, scenes: snapScenesToNarration(plan.scenes, narration), script: narration };
    last = `got ${plan.scenes?.map((s) => s.narration).join(" ").split(/\s+/).length ?? 0} words, expected ${narration.split(/\s+/).length}`;
  }
  throw new Error("The scene director could not keep the approved narration word for word. No voice or pictures were started.");
}

// ---------------- Voice ----------------

export interface VoiceInput { text: string; voice: string; deployment: string; style: string }

import { narrationSettings } from "@/lib/narration-direction";

const VOICES = new Set(["onyx", "ash", "echo", "ballad", "verse", "cedar"]);

export const generateVoiceOperation = async ({ data }: { data: VoiceInput }): Promise<{ audio: string; engine: "lovable"; deployment: string; voice: string }> => {
    // Atlas narrator: Gemini Charon via Lovable AI (owner's choice; Azure has no cloning and no TTS deployment).
    const narration = narrationSettings(data.style, data.text);
    const res = await generateSpeech({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: narration.text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: narration.voice } } } },
    });
    const v = narration.voice;
    return { audio: toBase64(await (await res.blob()).arrayBuffer()), engine: "lovable", deployment: `gemini-${v.toLowerCase()}`, voice: v };
  };

// ---------------- Images ----------------

export interface ImageInput {
  prompt: string;
  aspect: "portrait" | "landscape";
  deployment: string;
  quality: "low" | "medium" | "high";
  style: string;
  crisp?: boolean; // sharp flat line art at max compression quality (Ink explainer)
  palette?: string;
  cast?: string; // "Name: look; Name: look" for characters in this shot
  reference?: string; // base64 jpeg character sheet for consistency
  sheet?: boolean; // generating the character sheet itself
}

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function imageCall(data: ImageInput, prompt: string) {
  const size = data.sheet ? "1536x1024" : data.aspect === "portrait" ? "1024x1536" : "1536x1024";
  if (data.reference) {
    const fd = new FormData();
    fd.append("image[]", new Blob([b64ToBytes(data.reference)], { type: "image/jpeg" }), "cast.jpg");
    fd.append("prompt", prompt);
    fd.append("size", size);
    fd.append("quality", data.quality);
    fd.append("output_format", "jpeg");
    fd.append("output_compression", data.crisp ? "96" : "82");
    fd.append("n", "1");
    return azureOpenAIRequest(`${safeName(data.deployment)}/images/edits`, fd, true);
  }
  return azure(`${safeName(data.deployment)}/images/generations`, {
    prompt, size, quality: data.quality, output_format: "jpeg", output_compression: data.crisp ? 96 : 82, n: 1,
  });
}

export const generateImageOperation = async ({ data }: { data: ImageInput }): Promise<{ image: string | null; note: string }> => {
    const anchor = styleAnchor(data.style);
    const build = (p: string) => data.sheet
      ? `Character reference sheet. ${anchor}. Full-body front view of each character standing side by side on a plain light grey studio background, evenly spaced, neutral pose, consistent scale: ${p}. No text, no labels.`
      : `${anchor}. ${data.palette ? `Color direction: ${data.palette}. ` : ""}${data.reference ? "Keep the characters EXACTLY as they look in the reference sheet (same faces, hair, clothes, colors, proportions) but place them in this new shot; do not show the grey sheet background. " : ""}Shot: ${p}${data.cast ? ` Characters: ${data.cast}.` : ""} Full-bleed ${data.aspect === "portrait" ? "vertical 9:16" : "16:9"} frame, subject large and centered, dramatic depth. Family-friendly, no gore.${data.crisp ? " RENDER: razor-sharp clean vector-like ink lines of even thickness, perfectly flat solid fills, no paper grain, no texture noise, no blur, no soft focus, no gradients; one clear subject filling most of the frame." : ""} Absolutely no text, letters, captions or watermarks.`;
    // Azure's safety filter rejects violent wording: try original → softened → calm establishing shot.
    const attempts = [
      { p: data.prompt, note: "original" },
      { p: softenPrompt(data.prompt), note: "softened" },
      { p: `A calm, atmospheric establishing shot related to: ${softenPrompt(data.prompt).slice(0, 200)}. No people in distress`, note: "safe" },
    ];
    for (const a of attempts) {
      const res = await imageCall(data, build(a.p).slice(0, 3900));
      if (res.ok) {
        const json = (await res.json()) as { data?: { b64_json?: string }[] };
        const b64 = json.data?.[0]?.b64_json;
        if (b64) return { image: b64, note: a.note };
        continue;
      }
      const text = await res.text();
      if (res.status === 400 && /moderation_blocked|content_policy|safety system|ResponsibleAI/i.test(text)) {
        console.warn(`Image prompt blocked by safety filter (${a.note}), retrying safer`);
        continue;
      }
      console.error(`Image generator failed [${res.status}]: ${text.slice(0, 300)}`);
      throw new Error(`[${res.status}] Image generator failed`);
    }
    return { image: null, note: "blocked" };
  };

const HARSH: [RegExp, string][] = [
  [/\b(blood(y|ied)?|gore|gory|bleed(ing)?|wound(ed|s)?|injur(y|ies|ed))\b/gi, ""],
  [/\b(corpses?|dead bod(y|ies)|bodies|skulls?|skeletons?|carcass(es)?)\b/gi, "ruins"],
  [/\b(kill(s|ed|ing)?|murder(s|ed)?|slaughter(ed)?|massacre(d)?|execut(e|ed|ion)|behead(ed|ing)?|stab(bed|bing)?|tortur(e|ed|ing))\b/gi, "defeat"],
  [/\b(dy(ing)?|die(s|d)?|death|dead)\b/gi, "fallen"],
  [/\b(explod(e|es|ed|ing)|explosions?|blasts?|bombs?)\b/gi, "dramatic smoke"],
  [/\b(burn(s|ed|ing|t)?|flames?|ablaze|on fire|fire)\b/gi, "glowing orange light"],
  [/\b(screams?|screaming|agony|terrified|panic(ked)?|horror)\b/gi, "tense"],
  [/\b(weapons?|guns?|rifles?|swords?|spears?|cannons?)\b/gi, "equipment"],
  [/\b(soldiers?|warriors?|army|troops)\b/gi, "figures"],
  [/\b(prisoners?|inmates?|captives?)\b/gi, "a man"],
  [/\b(violent(ly)?|violence|brutal(ly)?|savage(ly)?|catastroph(e|ic))\b/gi, "dramatic"],
  [/\b(naked|nude|shirtless)\b/gi, "clothed"],
  [/\b(child(ren)?|kids?|boys?|girls?)\b/gi, "people"],
];

function softenPrompt(p: string) {
  let out = p;
  for (const [re, rep] of HARSH) out = out.replace(re, rep);
  return out.replace(/\s{2,}/g, " ").trim();
}

// ---------------- Remix a YouTube Short (Apify transcript -> new topic) ----------------

const YT_URL = /^https:\/\/(www\.|m\.)?(youtube\.com\/(shorts\/|watch\?v=)|youtu\.be\/)[A-Za-z0-9_-]{6,20}/;

export interface ShortImport { transcript: string; topic: string; summary: string; facts: string[] }

export const importShortOperation = async ({ data }: { data: { url: string; deployment: string } }) => {
    const lovable = process.env["LOVABLE_API_KEY"], apify = process.env["APIFY_API_KEY"];
    if (!lovable || !apify) throw new Error("Apify is not connected");
    const res = await fetch("https://connector-gateway.lovable.dev/apify/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": apify, "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: data.url }),
    });
    if (!res.ok) await fail(res, "Transcript reader");
    const items = (await res.json()) as { data?: { text?: string }[] }[];
    const transcript = (items[0]?.data ?? []).map((x) => x.text ?? "").join(" ").replace(/\[(music|applause|laughter)\]/gi, "").replace(/\s+/g, " ").trim().slice(0, 30000);
    if (transcript.split(" ").length < 15) throw new Error("This video has no readable spoken words (no captions found). Try another link.");
    const out = await azureJson<Omit<ShortImport, "transcript">>(data.deployment,
      "You analyse a viral YouTube video's (Short or long-form) transcript so a channel can make its OWN new video on the same true topic. topic: a short catchy video title (max 10 words) naming the real-world subject, e.g. 'Why Sailors Carried Storm Oil'. summary: 1-2 plain sentences on the true story/fact behind it. facts: 3-6 checkable real-world facts the video relies on. Never copy lines.",
      `Transcript:\n${transcript.slice(0, 12000)}`, "short_import",
      { type: "object", additionalProperties: false, required: ["topic", "summary", "facts"], properties: { topic: { type: "string" }, summary: { type: "string" }, facts: { type: "array", items: { type: "string" } } } },
      "Topic reader");
    return { transcript, ...out };
  };

// ---------------- Thumbnails ----------------

/** One clean 16:9 thumbnail picture (no text: the exact title is drawn by the browser so spelling is guaranteed). */
export async function thumbnailImageOperation(data: { subject: string; region: string; figure: string; deployment: string; variant: number }) {
  const looks = [
    'The figure stands on the right third, three-quarter view, confident expression, warm golden rim light.',
    'The figure stands on the right third, facing the viewer, intense stare, dramatic cool side light.',
  ];
  const prompt = `Viral YouTube history documentary thumbnail, 16:9, ultra crisp and saturated. Background: a bright 3D relief map of ${data.region} seen from above at a slight angle, vivid green lowlands, yellow-ochre plains and brown mountains with strong hillshade, deep glossy blue sea, thin white country borders. The territory of ${data.subject} glows bright red with a thick white outline and a soft red glow, covering the left and middle of the frame. Foreground: a bold stylised digital painting (illustration, not a photograph) of ${data.figure}, chest-up, highly detailed costume. ${looks[data.variant % looks.length]} Keep the top-left quarter free of important detail for a title. Absolutely no text, letters, numbers, logos or watermarks.`;
  const res = await azure(`${safeName(data.deployment)}/images/generations`, { prompt, size: '1536x1024', quality: 'medium', output_format: 'jpeg', output_compression: 90, n: 1 });
  if (!res.ok) await fail(res, 'Thumbnail');
  const j = await res.json() as { data?: { b64_json?: string }[] };
  const image = j.data?.[0]?.b64_json;
  if (!image) throw Error('Thumbnail came back empty');
  return { image };
}

// ---------------- Ink explainer: white idea cards + hero thumbnails ----------------

const INK_CARDS = `You are the editor of a hand-drawn stick-figure explainer channel. Between full illustrated scenes the video cuts to plain white "idea cards": one short hand-lettered phrase plus one tiny doodle (e.g. "3 BILLION YEARS AGO" + timeline, "2 MINUTES LEFT" + hourglass, "NIGHT OWL?" + owl, "BACK / FORWARD" + arrows).
Pick the sentences that work best as cards: numbers, dates, durations, choices, comparisons, short rhetorical questions, countdowns, a single striking word. Choose about one in five sentences, never two neighbours, never the first sentence.
For each, give: index, text (1-4 words, ALL CAPS, exactly matching the sentence's meaning, spelled correctly, may end with "?"), icon (a single simple object to doodle, 1-4 words, no text in it).`;

export async function inkCardsOperation(data: { scenes: string[]; deployment: string }) {
  const schema = { type: 'object', additionalProperties: false, required: ['cards'], properties: { cards: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'text', 'icon'], properties: { index: { type: 'integer' }, text: { type: 'string' }, icon: { type: 'string' } } } } } };
  const r = await azureJson<{ cards: { index: number; text: string; icon: string }[] }>(data.deployment, INK_CARDS, data.scenes.map((s, i) => `${i}: ${s}`).join('\n'), 'ink_cards', schema, 'Idea cards');
  return r.cards;
}

export async function inkThumbnailOperation(data: { subject: string; figure: string; deployment: string; variant: number }) {
  const looks = [
    'Extreme close-up of the hero on the left half, head and shoulders filling the frame, huge exaggerated expression (wide eyes, raised brows, open mouth), bright saturated sky-blue background with a simple scene hint behind.',
    'The hero big in the foreground on the left, smug or shocked expression, reacting to the subject on the right side, bright sunny colourful scene, strong contrast.',
  ];
  const prompt = `Viral YouTube explainer thumbnail, 16:9, hand-drawn 2D cartoon with bold black ink outlines and flat bright saturated colours. ${looks[data.variant % looks.length]} Hero: ${data.figure}. Subject: ${data.subject}. Keep the right third and top area simple and uncluttered for big title text added later. No text, no letters, no logos.`;
  const res = await azure(`${safeName(data.deployment)}/images/generations`, { prompt: prompt.slice(0, 3900), size: '1536x1024', quality: 'medium', output_format: 'jpeg', output_compression: 90, n: 1 });
  if (!res.ok) await fail(res, 'Thumbnail');
  const j = await res.json() as { data?: { b64_json?: string }[] };
  const image = j.data?.[0]?.b64_json;
  if (!image) throw Error('Thumbnail came back empty');
  return { image };
}

// ---------------- Ink explainer: one literal picture per spoken phrase ----------------

const INK_BEATS = `You storyboard a hand-drawn stick-figure explainer video (Ink Explainer style). The picture cuts hard every 1-2 seconds, and EVERY cut shows exactly what the narrator is saying at that moment.
For each numbered phrase write ONE picture (max 30 words) that literally shows the key noun, number, place or action spoken in that phrase: if the phrase says "a dead tree", draw a dead tree; "a skeleton buried", a skeleton in a soil cross-section; "the hero runs", the hero running.
Rules: one clear subject, big in frame, simple readable background (sky, ground line, plain room). Literal meaning ALWAYS outranks visual variety: never swap the narrated object to satisfy an alternation or hero quota. The full sentence resolves pronouns and incomplete phrases; show the subject/action of THIS phrase, not the later reveal or a different noun from the scene idea. Keep an ongoing subject for connective phrases; do not invent a new event. Only use "the hero" when the narrated person is actually acting or reacting. Otherwise show the object, place or diagram alone. Never more than one other person. Never any text, letters, numbers or labels in the picture. Keep the topic's era and place.`;

export async function inkBeatsOperation(data: { beats: { i: number; text: string; scene: string }[]; topic: string; deployment: string }) {
  const schema = { type: 'object', additionalProperties: false, required: ['shots'], properties: { shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'visual'], properties: { i: { type: 'integer' }, visual: { type: 'string' } } } } } };
  const user = `Topic: ${data.topic}\nReturn exactly one shot for every supplied index, no duplicates.\n` + data.beats.map(b => `${b.i}: CURRENT SPOKEN PHRASE: "${b.text}"\nContext and subject: ${b.scene}`).join('\n');
  const r = await azureJson<{ shots: { i: number; visual: string }[] }>(data.deployment, INK_BEATS, user, 'ink_beats', schema, 'Picture storyboard');
  const expected = new Set(data.beats.map(b => b.i));
  const seen = new Set<number>();
  for (const shot of r.shots) {
    if (!expected.has(shot.i) || seen.has(shot.i) || !shot.visual.trim()) throw new Error('Picture storyboard returned invalid scene associations');
    seen.add(shot.i);
  }
  if (seen.size !== expected.size) throw new Error('Picture storyboard omitted a spoken phrase');
  return r.shots;
}

// ---------------- Advanced Video AI: painted character cards ----------------
export const ADVANCED_CARD_STYLE = 'Bold 2D cartoon character for a viral history Short: thick clean dark ink outline, flat bright colours with soft cel shading, big expressive eyes, friendly rounded proportions, slightly exaggerated features, full body standing upright facing the viewer, whole figure visible head to feet, centered, nothing else in the picture, transparent background, no ground, no shadow, no text.';
const CARD_DESIGNER = `You design the on-screen characters and key objects for a 3D cartoon Short where each one is a flat painted card standing in a 3D set.
For every cast id, read the narration and decide who or what that role should actually look like so the picture matches the story literally (it may be an animal, a creature or a person of the right era, place and job).
Return one short visual description per id (max 40 words): species or person, era-accurate clothes/colours, one signature item, a friendly expressive face. Distinct silhouettes and colours between ids.
Then list up to 3 key OBJECTS the narrator names that matter to the story and are NOT already shown in that scene's props (e.g. a potato patch, a fence, a letter): a snake_case name, a max-30-word look, and the zero-based scene indexes where it is said.
Never people or animals in objects, never real living people's likeness, never gore, never text.`;
export const designAdvancedCardsOperation = async ({ data }: { data: { scenes: string[]; ids: string[]; deployment: string } }) => {
  const schema = { type: 'object', additionalProperties: false, required: ['cards', 'objects'], properties: {
    cards: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'look'], properties: { id: { type: 'string', enum: data.ids }, look: { type: 'string' } } } },
    objects: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'look', 'scenes'], properties: { name: { type: 'string' }, look: { type: 'string' }, scenes: { type: 'array', items: { type: 'integer' } } } } } } };
  const r = await azureJson<{ cards: { id: string; look: string }[]; objects: { name: string; look: string; scenes: number[] }[] }>(data.deployment, CARD_DESIGNER, `Cast ids: ${data.ids.join(', ')}\n\nNarration with each scene's acting role and props:\n${data.scenes.map((t, i) => `${i}. ${t}`).join('\n')}`, 'card_design', schema, 'Card designer');
  const seen = new Set<string>();
  const objects = (r.objects ?? []).map(o => ({ name: o.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30), look: o.look.slice(0, 300), scenes: [...new Set(o.scenes.filter(i => Number.isInteger(i) && i >= 0 && i < data.scenes.length))] }))
    .filter(o => o.name && o.scenes.length && !seen.has(o.name) && (seen.add(o.name), true)).slice(0, 3);
  return { cards: data.ids.map(id => ({ id, look: (r.cards.find(c => c.id === id)?.look ?? 'a friendly cartoon storyteller in era clothes').slice(0, 300) })), objects };
};
// Advanced Video AI staging: casting per shot from the facts, object families and the climax sequence (pure rules in advanced-staging.ts decide).
const STAGER = `You stage a factual history Short that is drawn as 3D cartoon shots. You only choose from the ids given; you never invent people, objects or events.
1. cast: for every cast id say who it is in the story (max 12 words, from the narration's facts) and enters = the 0-based line where that person or group first becomes part of the story. A person who only acts later (an investigator, a judge, a rescuer) must not enter before the line that introduces them.
2. scenes: for every line, the cast members physically present at that moment according to the facts (0-3), each with a short reason quoting or paraphrasing the line. Never place anyone before their enters line. Use an empty list when the moment is an event, place or object with nobody from the cast there.
3. families: group object ids that are the SAME physical thing in different states (e.g. a tank intact, its seam leaking, its wall torn). canonical = the intact/normal object; variants = the other ids with a 1-3 word state (leaking, failing, burst, aftermath). A different thing (a wave of liquid, a building, a railway) is not a variant.
4. climax: the line that states the story's key physical event (e.g. "the tank burst") and the 2-3 object ids that show it in order: intact -> failing -> burst/aftermath, using existing ids only. scene = -1 and sequence = [] if the story has no physical key event.`;
export const stageAdvancedDirectionOperation = async ({ data }: { data: { narration: string[]; cast: string[]; objects: { scene: number; id: string; phrase: string }[]; actors: string[][]; deployment: string } }) => {
  const S = { type: 'string' }, I = { type: 'integer' };
  const schema = { type: 'object', additionalProperties: false, required: ['cast', 'scenes', 'families', 'climax'], properties: {
    cast: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'who', 'enters'], properties: { id: { type: 'string', enum: data.cast }, who: S, enters: I } } },
    scenes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['actors'], properties: { actors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['actor', 'reason'], properties: { actor: { type: 'string', enum: data.cast }, reason: S } } } } } },
    families: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['canonical', 'variants'], properties: { canonical: S, variants: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'state'], properties: { id: S, state: S } } } } } },
    climax: { type: 'object', additionalProperties: false, required: ['scene', 'sequence'], properties: { scene: I, sequence: { type: 'array', items: S } } } } };
  const ids = [...new Set(data.objects.map(o => o.id))];
  const lines = data.narration.map((t, i) => `${i}. ${t}
   shot plan cast: ${data.actors[i]?.join(', ') || 'none'}; objects: ${data.objects.filter(o => o.scene === i).map(o => `${o.id} = ${o.phrase}`).join('; ') || 'none'}`).join('\n');
  const r = await azureJson<import('./advanced-staging').StagingAnswer>(data.deployment, STAGER, `Cast ids: ${data.cast.join(', ')}\nObject ids: ${ids.join(', ') || 'none'}\n\nLines:\n${lines}`, 'advanced_staging', schema, 'Shot stager');
  if (!Array.isArray(r.scenes) || r.scenes.length !== data.narration.length) throw Error('Shot stager changed the line count');
  return r;
};
// Advanced Video AI final editor: same scenes and facts, retold for an 8-year-old in natural storytelling.
export const polishKidScriptOperation = async ({ data }: { data: { scenes: string[]; problems: string[]; words: number; names: string[]; deployment: string } }) => {
  const schema = { type: 'object', additionalProperties: false, required: ['scenes'], properties: { scenes: { type: 'array', items: { type: 'string' } } } };
  const r = await azureJson<{ scenes: string[] }>(data.deployment, `You are the final script editor for a kids-friendly viral history Short. Rewrite the narration so a bored 8-year-old understands every word and cannot stop watching.
Rules:
- Return exactly ${data.scenes.length} scene lines, same order, same facts, same events, one line per scene (the pictures are already planned for each line, so each line must still say what its old line showed).
- Total ${Math.round(data.words * 0.9)}-${Math.round(data.words * 1.05)} words. Write connected complete sentences, usually 6-16 words, maximum 20. A cut is not a sentence boundary.
- Only everyday words a second-grader uses. Keep these names exactly: ${data.names.join(', ') || 'none'}; explain a place once in kid words. Spell numbers and years as words ("nineteen thirty-two").
- Sound like a real storyteller talking to a friend using words a child knows. WHO does WHAT and WHY, with so/but/because where natural. No invented quotes, forced danger or baby talk. No headline fragments, metaphors standing in for mechanisms or unexplained technical words. The first THREE words contain the real subject or concrete action, not "This tiny screen". The last line resolves the opening curiosity plainly. Preserve existing questions but do not add question quotas or myths.
- Every line adds a surprise, danger, funny moment or new fact. The first line hooks with the strangest true fact; the last line answers the opening question with a twist.
- Family friendly: no blood, kill, die, dead.`, `Problems to fix:\n${data.problems.map(x => `- ${x}`).join('\n') || '- none'}\n\nCurrent lines:\n${data.scenes.map((t, i) => `${i}. ${t}`).join('\n')}`, 'kid_script', schema, 'Kid editor');
  if (!Array.isArray(r.scenes) || r.scenes.length !== data.scenes.length || r.scenes.some(x => typeof x !== 'string' || !x.trim())) throw Error('Kid editor changed the scene count');
  return { scenes: r.scenes.map(x => x.trim().replace(/\s+/g, ' ')) };
};
export const ADVANCED_BACKDROP_STYLE = 'Painted background plate for a 3D cartoon history Short, one locked house style: soft painterly gouache with clean simplified shapes, gentle atmospheric perspective, muted natural palette, no outlines on distant forms, accurate architecture, vehicles and landscape for the stated place and year. No people, no animals, no characters. Absolutely no text, letters, numbers, signs, posters or logos anywhere.';
export const ADVANCED_OBJECT_STYLE = 'Bold 2D cartoon prop for a viral history Short: thick clean dark ink outline, flat bright colours with soft cel shading, the whole object visible and centered, seen from the front, nothing else in the picture, transparent background, no ground, no shadow, no people. Absolutely no text, letters, numbers, labels, logos or signage painted on it.';
const POSE_TEXT: Record<'reach' | 'shock' | 'happy', string> = {
  reach: 'now pointing forward with one arm stretched out (or the animal leaning forward with one leg raised), mouth open as if saying something important',
  shock: 'now shocked: eyes wide, mouth open, eyebrows up, hands (or paws/ears) thrown up in surprise, leaning back a little',
  happy: 'now laughing and cheering: big open smile, eyes squeezed happy, arms (or front legs) up in joy',
};
/** Owner rule: a painted object card must not contain readable text or lettering (vision check of the transparent PNG). */
export const checkCardTextOperation = async ({ data }: { data: { image: string; deployment: string } }) => {
  const res = await azure(`${safeName(data.deployment)}/chat/completions`, {
    messages: [
      { role: 'system', content: 'You inspect a cartoon prop picture for an animated video. Report whether ANY readable text, letters, numbers, words, logos with lettering or signage appear anywhere in it, even small or partial. Rivets, stripes, wood grain and unreadable scribbles on paper are not text.' },
      { role: 'user', content: [{ type: 'text', text: 'Does this picture contain readable text or lettering? Reply JSON {"text": true|false, "what": "the text you can read, or empty"}.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${data.image}`, detail: 'low' } }] },
    ],
    max_completion_tokens: 2000, reasoning_effort: effortFor(data.deployment, 'none'),
    response_format: { type: 'json_schema', json_schema: { name: 'card_text', strict: true, schema: { type: 'object', additionalProperties: false, required: ['text', 'what'], properties: { text: { type: 'boolean' }, what: { type: 'string' } } } } },
  });
  if (!res.ok) await fail(res, 'Text check');
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  // An unreadable verdict counts as text: an unchecked card is never shown as clean.
  try { const v = JSON.parse(j.choices?.[0]?.message?.content ?? '') as { text: boolean; what: string }; return { text: !!v.text, what: String(v.what ?? '').slice(0, 120), tokens: (j.usage?.prompt_tokens ?? 0) + (j.usage?.completion_tokens ?? 0) }; }
  catch { return { text: true, what: 'unreadable check', tokens: 0 }; }
};
/** Paints a transparent card: a standing character, an object, or (with a reference) the same character in another pose. */
export const paintAdvancedCardOperation = async ({ data }: { data: { look: string; deployment: string; kind?: 'character' | 'object' | 'backdrop-far' | 'backdrop-mid' | undefined; pose?: 'reach' | 'shock' | 'happy' | 'rig' | undefined; reference?: string | undefined } }) => {
  if (data.kind === 'backdrop-far' || data.kind === 'backdrop-mid') {
    // World Pack backdrop: one locked painted style for every story; far layer opaque, mid layer a transparent cut-out.
    const far = data.kind === 'backdrop-far';
    for (const look of [data.look, softenPrompt(data.look)]) {
      const res = await azure(`${safeName(data.deployment)}/images/generations`, { prompt: `${ADVANCED_BACKDROP_STYLE} ${far ? 'Full opaque painting edge to edge, horizon in the lower third.' : 'Transparent background except the painted features at the left and right edges.'} Place: ${look}`.slice(0, 3900), size: '1024x1536', quality: 'medium', background: far ? 'opaque' : 'transparent', output_format: 'png', n: 1 });
      if (res.ok) { const j = await res.json() as { data?: { b64_json?: string }[] }; const b = j.data?.[0]?.b64_json; if (b) return { image: b }; }
      else if (res.status !== 400) await fail(res, 'Backdrop');
    }
    throw Error('Backdrop could not be painted');
  }
  const style = data.kind === 'object' ? ADVANCED_OBJECT_STYLE : ADVANCED_CARD_STYLE;
  if (data.pose && data.reference) {
    // Same design in a new pose: the standing card is the reference so face, colours and outfit stay identical.
    for (let i = 0; i < 2; i++) {
      const fd = new FormData();
      fd.append('image[]', new Blob([b64ToBytes(data.reference)], { type: 'image/png' }), 'card.png');
      const posePrompt=data.pose==='rig' ? `Create a CLEAN transparent puppet sprite sheet, NOT a whole character. Same face and clothing identity as reference. Exact canvas 1024x1536, 2 columns by 4 rows of equal 512x384 cells, NO grid lines, NO text. Draw ONE isolated part centered in each cell with generous transparent padding, each part wholly inside its cell, no background and no other parts: row 1 left HEAD including face/hair, right TORSO shirt only without head/arms/legs; row 2 left UPPER ARM vertical sleeve, right FOREARM vertical wrist without hand; row 3 left THIGH vertical trouser, right SHIN vertical trouser; row 4 left HAND palm, right FOOT shoe side view. Each limb is straight and vertical. Never draw a complete figure. Face mouth closed. Consistent colours and ink. Character: ${data.look}` : `${style} Keep EXACTLY the same character as the reference image: same face, species, colours, clothes, proportions and line style. Character: ${i ? softenPrompt(data.look) : data.look} The character is ${POSE_TEXT[data.pose]}. Full body, head to feet, centered.`;
      fd.append('prompt', posePrompt.slice(0,3900));
      fd.append('size', '1024x1536'); fd.append('quality', 'medium'); fd.append('background', 'transparent'); fd.append('output_format', 'png'); fd.append('n', '1');
      const res = await azureOpenAIRequest(`${safeName(data.deployment)}/images/edits`, fd, true);
      if (res.ok) { const j = await res.json() as { data?: { b64_json?: string }[] }; const b = j.data?.[0]?.b64_json; if (b) return { image: b }; }
      else if (res.status !== 400) await fail(res, 'Character pose');
    }
    throw Error('Character pose could not be painted');
  }
  if (data.kind === 'object' && data.reference) {
    // State variant of a canonical object (leaking, failing, burst): painted FROM the canonical card so it is visibly the same object.
    for (let i = 0; i < 2; i++) {
      const fd = new FormData();
      fd.append('image[]', new Blob([b64ToBytes(data.reference)], { type: 'image/png' }), 'object.png');
      fd.append('prompt', `${style} Keep EXACTLY the same object as the reference image: same shape, material, colours, proportions, rivets and line style; only its state changes. Show it in this state: ${i ? softenPrompt(data.look) : data.look}. Absolutely no text, letters or numbers anywhere.`.slice(0, 3900));
      fd.append('size', '1024x1536'); fd.append('quality', 'medium'); fd.append('background', 'transparent'); fd.append('output_format', 'png'); fd.append('n', '1');
      const res = await azureOpenAIRequest(`${safeName(data.deployment)}/images/edits`, fd, true);
      if (res.ok) { const j = await res.json() as { data?: { b64_json?: string }[] }; const b = j.data?.[0]?.b64_json; if (b) return { image: b }; }
      else if (res.status !== 400) await fail(res, 'Object variant');
    }
    throw Error('Object variant could not be painted');
  }
  const tries = data.kind === 'object' ? [data.look, softenPrompt(data.look)] : [data.look, softenPrompt(data.look), 'a friendly cartoon storyteller in simple period clothes'];
  for (const look of tries) {
    const res = await azure(`${safeName(data.deployment)}/images/generations`, { prompt: `${style} ${data.kind === 'object' ? 'Object' : 'Character'}: ${look}`.slice(0, 3900), size: '1024x1536', quality: 'medium', background: 'transparent', output_format: 'png', n: 1 });
    if (res.ok) { const j = await res.json() as { data?: { b64_json?: string }[] }; const b = j.data?.[0]?.b64_json; if (b) return { image: b }; }
    else if (res.status !== 400) await fail(res, 'Character card');
  }
  throw Error('Character card could not be painted');
};
