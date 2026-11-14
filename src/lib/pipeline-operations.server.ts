import { styleAnchor } from "@/lib/styles";
import { FEW_SHOT } from "@/lib/story-v2";
import { cartoonDirection, OUTFITS, VOCAB } from '@/lib/cartoon-job';
import { z } from 'zod';

import { azureOpenAIRequest } from './azure-openai.server';

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
export async function azureJson<T>(deployment: string, system: string, user: string, name: string, schema: unknown, what: string): Promise<T> {
  const res = await azure(`${safeName(deployment)}/chat/completions`, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_completion_tokens: 32000,
    reasoning_effort: "none",
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

const directCartoonChunk = async (data: { scenes: string[]; deployment: string; advanced?: boolean | undefined }) => {
    const en = (k: keyof typeof VOCAB) => ({ type: 'string', enum: VOCAB[k] });
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
    const raw = await azureJson<{ cast: unknown[]; scenes: Record<string, unknown>[] }>(data.deployment, data.advanced ? VISUAL_DIRECTOR + ADVANCED_DIRECTION : VISUAL_DIRECTOR,
      data.scenes.map((s, i) => `${i}: ${s}\nScene-matched models: ${searchLibrary(s, 5).filter(o => objects.some(a => a.id === o.id)).map(o => `${o.id}${o.clips?.length ? ' [rigged]' : ''}`).join(', ') || 'use faithful built-in props'}`).join('\n') + (objects.length ? `\n\nLibrary objects for this story (use kind=asset with asset=<id>):\n${objects.map(o => `${o.id} — ${o.name}${o.type === 'sprite' ? ' (flat animal art)' : o.clips?.length ? ' (animated: idle/walk/run)' : ''}`).join('\n')}` : ''), 'cartoon_direction', schema, 'Visual director');
    // Empty speaker means narration (no lip sync); trim lists to engine limits before strict validation.
    const scenes = raw.scenes.map(s => ({ ...s, speaker: s['speaker'] || undefined, keyword: String(s['keyword'] ?? '').slice(0, 40) || undefined,
      actors: Array.isArray(s['actors']) && s['actors'].length ? s['actors'].slice(0, 3) : undefined, props: Array.isArray(s['props']) ? (s['props'] as Record<string, unknown>[]).map((p): Record<string, unknown> => ({ ...p, asset: p['asset'] || undefined })).filter(p => (p['kind'] === 'asset') === !!p['asset']).slice(0, 4) : [], fx: Array.isArray(s['fx']) ? s['fx'].slice(0, 3) : [], cues: Array.isArray(s['cues']) ? s['cues'].slice(0, 4) : [] }));
    const { cinematicPass } = await import('./cinematic-pass');
    const { groundLibraryScenes } = await import('./library-direction');
    const { sanitizeDirection } = await import('./cartoon-job');
    const cast = diversifyCast(raw.cast as CastMember[], data.advanced ? 4 : 3);
    const grounded = groundLibraryScenes(scenes as unknown as Parameters<typeof cinematicPass>[0], narration, objects);
    const result = cartoonDirection.parse(sanitizeDirection({ cast, scenes: cinematicPass(grounded, narration) } as unknown as Parameters<typeof sanitizeDirection>[0], narration));
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
- The hero is in at least 60% of scenes. Pick actions and expressions that match each line (point when someone shows, shock when something goes wrong, cheer or grin on wins, walk/run when someone moves).`;
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

export const researchStoryOperation = async ({ data }: { data: { topic: string; facts: string; deployment: string } }) => azureJson<Research>(data.deployment,
    `You are the research producer of a story Shorts channel. From the topic and fact sheet, extract what the writer needs BEFORE writing:
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

export const judgeScriptOperation = async ({ data, checkpoint = <T,>(fn: () => Promise<T>) => fn() }: { data: { first3: string; first15: string; full: string; truth: string; shots: string; deployment: string }; checkpoint?: <T>(fn: () => Promise<T>) => Promise<T> }) => {
    const blind = "You are a cold viewer who has never heard of this topic. Answer ONLY from what you are shown; if you can't tell, answer \"unclear\".";
    const a = await checkpoint(() => azureJson<PassAnswer>(data.deployment, blind, `You saw the first 3 seconds of a Short:\n${data.first3}\nWhat is happening? Where? Why is it odd? What might happen next?`, "pass_a", passASchema, "Judge A"));
    const b = await checkpoint(() => azureJson<{ premise: string; hero: string; want: string; question: string }>(data.deployment, blind, `You saw the first 15 seconds:\n${data.first15}\nState the premise, the hero, what the hero wants and the central question.`, "pass_b", passBSchema, "Judge B"));
    const c = await checkpoint(() => azureJson<{ answered: boolean; answer: string; payoff: string; weakest: string }>(data.deployment, blind, `Full script:\n${data.full}\nWas the opening question answered (quote the answer)? What was the payoff? Which beat was weakest?`, "pass_c", passCSchema, "Judge C"));
    const g = await checkpoint(() => azureJson<{ passA: number; passB: number; readAloud: string[]; literal: number[]; filler: string[]; swipe: string[] }>(data.deployment,
      "You grade blind viewer answers against the truth, and audit a script. Be strict but fair: an answer is correct if a stranger clearly got the idea. readAloud flags grammatical defects only, never brevity, quoted dialogue, present tense or unfamiliar subject matter. A full subject-verb sentence such as 'Then a dragon clicks.' or 'A bronze ball drops west.' is grammatical. Dialogue with attribution such as '\"That cannot work,\" a minister laughs.' is grammatical. filler must exclude first introductions of a checked year/place and new consequences such as a delayed courier confirming the event. literal audits the visible noun/action, not whether an invisible idea can be photographed.",
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
      max_completion_tokens: 2000, reasoning_effort: "none",
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

export const generateHooksOperation = async ({ data }: { data: { topic: string; facts: string; research: string; prefer?: string; deployment: string } }) => {
    const r = await azureJson<{ hooks: Hook[] }>(data.deployment,
      `You write the first 3 seconds of viral story Shorts. Write exactly 10 hooks, 2 of each type: paradox_image, shocking_number, mid_action, direct_question, contrarian.
HARD RULES for "line" (the first spoken sentence):
- 8-12 words. Open mid-crisis or on the stakes (danger, a chase, a looming failure, a strange action happening NOW). NEVER start with a date ("In 1965..."), a name + biography ("X was a chemist"), or a dry fact; put the year later in the sentence. Use a strong action verb (roars, snaps, swallows, surges, races).
- No greeting, no joke setup, no riddle, never "Did you know", never "Imagine", never "A [job] knocks...", nothing that needs context from later.
- Must contain: a concrete subject (say the subject anchor word), an odd action or number, and a place OR time anchor (say the year/era or place).
- States the oddity in concrete words a 5-year-old understands, so a stranger instantly knows what is odd. It may tease but must not give the hidden reason.
- Every number must come from the fact sheet. Family-friendly words only. direct_question hooks must still contain the subject + anchor.
"visual" = the first frame: a WIDE shot that shows the odd thing (never a face close-up).
"text" = on-screen hook text, max 6 words, states the oddity as a FACT (no question mark), and must NOT repeat the spoken line's words (e.g. spoken "America hid a whole bomber factory under a fake street in 1942." -> text "FAKE STREET. REAL BOMBERS.").
Score each 1-10 honestly on curiosity, clarity, visualness, speakability.${data.prefer ? `\nOur audience data says these hook types perform best (in order): ${data.prefer}.` : ""}`,
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
- Sentences of 4-12 words, one idea each, like a fun big sister telling a story. Use sound words (oink! boom! splash!) and short funny quotes from the characters.
- Every sentence must make a kid want the next one: a surprise, a danger, a funny moment or a new fact. Never two calm lines in a row.
- Exactly ${words} words (±10%). Count them; a machine checks.
- If an animal or object causes the story (a pig, a cannon, a jar), name it in the first sentence and keep it on screen: it is a character.`;
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
    const scenes = short ? (micro ? Math.max(3, Math.round(D / 2.5)) : Math.max(8, Math.round(D / 3))) : Math.min(90, Math.max(14, Math.round(D / 6)));
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

${data.kid ? KID_RULES(words) : ""}${micro ? MICRO_RULES(D, words, scenes) : ""}
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
    const user = `Format: ${short ? "YouTube Short / Reel, vertical 9:16" : "long-form YouTube story documentary, 16:9 (same structure, more tries and more detail)"}.
Topic: ${data.topic}
Viral archetype: ${data.archetype}
Target: ${D} seconds ≈ ${words} words of narration total (±8%). About ${scenes} scenes of ~${perScene} words each.
${data.research ? `Research (use these anchors, hero, question, tries, payoff and money shot):\n${data.research}\n` : ""}${data.facts ? `Fact sheet (obey it):\n${data.facts}\n` : ""}${data.hook ? data.repair ? `Preferred hook: "${data.hook}". Rewrite it if the opening checks require it.\n` : `Open with this exact hook line: "${data.hook}"\n` : ""}${data.repair ? `A previous draft FAILED these checks — fix every one, including scene metadata and visuals. Structural failures require a structural rewrite, not cosmetic edits:\n${data.repair}\n` : ""}Return a click-worthy title (under 60 chars) and a 2-sentence YouTube description.`;

    const repairPriority = data.repair ? `\nFINAL REPAIR PRIORITY: The earlier examples are structure references, not exceptions. The repair contract and checked facts override every example and preferred hook. Before returning JSON, count the opening words and verify the main question STARTS by word 20. Put it immediately after the hook, before secondary context. Then state the hero's want. Do not put decorative setting lines before the question. Recount the WHOLE scene narration: target ${words} words, maximum ${Math.floor(words * 1.08)}. Verify every named character, shot and loop field as well as the spoken lines. Do not present a speculative reconstruction or invented try/fail as a historical fact.` : '';
    const plan = await azureJson<Plan>(data.deployment, system + repairPriority, user, "video_plan", planSchema, "Script writer");
    if (!plan.scenes?.length) throw new Error("Script writer returned an empty plan");
    return plan;
  };

// ---------------- Voice ----------------

export interface VoiceInput { text: string; voice: string; deployment: string; style: string }

import { LONG_NARRATION_DIRECTION } from "@/lib/narration-direction";

const VOICES = new Set(["onyx", "ash", "echo", "ballad", "verse", "cedar"]);

export const generateVoiceOperation = async ({ data }: { data: VoiceInput }): Promise<{ audio: string; engine: "lovable"; deployment: string; voice: string }> => {
    // Atlas narrator: Gemini Charon via Lovable AI (owner's choice; Azure has no cloning and no TTS deployment).
    const longDirection = LONG_NARRATION_DIRECTION;
    const direction = data.style === "long" ? longDirection : "A light, relaxed, friendly male storyteller, amused, like telling a buddy a wild true story. Fast and nearly non-stop, only tiny breaths between sentences, an easy grin in the voice, quick playful character voices for any quoted lines, a little extra punch on the twist and the reveal. Every word crisp and clear. Not dramatic, not shouting, not whispering";
    const lovable = process.env["LOVABLE_API_KEY"];
    if (!lovable) throw new Error("Lovable AI is not configured");
    const res = await fetch(`https://ai.gateway.lovable.dev/v1/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovable}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: `${direction}: Read the following narration aloud, word for word. Narration: ${data.text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: data.style === "long" ? "Charon" : "Puck" } } } },
        stream_format: "audio",
      }),
    });
    if (!res.ok) { console.error(`Voice text was: ${data.text.slice(0, 600)}`); await fail(res, "Voice"); }
    const v = data.style === "long" ? "Charon" : "Puck";
    return { audio: toBase64(await res.arrayBuffer()), engine: "lovable", deployment: `gemini-${v.toLowerCase()}`, voice: v };
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
const CARD_DESIGNER = `You design the on-screen characters for a 3D cartoon Short where each character is one flat painted card standing in a 3D set.
For every cast id, read the narration and decide who or what that role should actually look like so the picture matches the story literally (it may be an animal, an object-mascot or a person of the right era, place and job).
Return one short visual description per id (max 40 words): species or person, era-accurate clothes/colours, one signature item, expression. Distinct silhouettes and colours between ids. Never real living people's likeness, never gore, never text.`;
export const designAdvancedCardsOperation = async ({ data }: { data: { scenes: string[]; ids: string[]; deployment: string } }) => {
  const schema = { type: 'object', additionalProperties: false, required: ['cards'], properties: { cards: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'look'], properties: { id: { type: 'string', enum: data.ids }, look: { type: 'string' } } } } } };
  const r = await azureJson<{ cards: { id: string; look: string }[] }>(data.deployment, CARD_DESIGNER, `Cast ids: ${data.ids.join(', ')}\n\nNarration with each scene's acting role:\n${data.scenes.map((t, i) => `${i + 1}. ${t}`).join('\n')}`, 'card_design', schema, 'Card designer');
  return data.ids.map(id => ({ id, look: (r.cards.find(c => c.id === id)?.look ?? 'a friendly cartoon storyteller in era clothes').slice(0, 300) }));
};
export const paintAdvancedCardOperation = async ({ data }: { data: { look: string; deployment: string } }) => {
  const tries = [data.look, softenPrompt(data.look), 'a friendly cartoon storyteller in simple period clothes'];
  for (const look of tries) {
    const res = await azure(`${safeName(data.deployment)}/images/generations`, { prompt: `${ADVANCED_CARD_STYLE} Character: ${look}`.slice(0, 3900), size: '1024x1536', quality: 'medium', background: 'transparent', output_format: 'png', n: 1 });
    if (res.ok) { const j = await res.json() as { data?: { b64_json?: string }[] }; const b = j.data?.[0]?.b64_json; if (b) return { image: b }; }
    else if (res.status !== 400) await fail(res, 'Character card');
  }
  throw Error('Character card could not be painted');
};
