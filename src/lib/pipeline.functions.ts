import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { styleAnchor } from "@/lib/styles";
import { FEW_SHOT } from "@/lib/story-v2";
import { cartoonDirection, OUTFITS, VOCAB } from '@/lib/cartoon-job';
import { z } from 'zod';
import { requestAzureVoice } from '@/lib/azure-voice';

// Scripts and images use the owner's Azure resource; narration remains Gemini.

const safeName = (s: string) => {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(s)) throw new Error("Invalid deployment name");
  return s;
};

async function azure(path: string, body: unknown) {
  const { azureOpenAIRequest } = await import('./azure-openai.server');
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
async function azureJson<T>(deployment: string, system: string, user: string, name: string, schema: unknown, what: string): Promise<T> {
  const res = await azure(`${safeName(deployment)}/chat/completions`, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_completion_tokens: 32000,
    reasoning_effort: "none",
    stream: true,
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
  });
  if (!res.ok || !res.body) await fail(res, what);
  let content = "", refusal = "", buf = "";
  const reader = res.body!.getReader();
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
export const designAdvancedCards = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { scenes: string[]; ids: string[]; deployment: string }) => z.object({ scenes: z.array(z.string().min(1).max(4000)).min(1).max(600), ids: z.array(z.string().regex(/^[a-z0-9_-]{1,30}$/)).min(1).max(4), deployment: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => { const { designAdvancedCardsOperation } = await import('./pipeline-operations.server'); return designAdvancedCardsOperation({ data }); });
export const paintAdvancedCard = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { look: string; deployment: string; kind?: 'character' | 'object'; pose?: 'reach' | 'shock' | 'happy'; reference?: string }) => z.object({ look: z.string().min(1).max(300), deployment: z.string().min(1).max(64), kind: z.enum(['character', 'object']).optional(), pose: z.enum(['reach', 'shock', 'happy']).optional(), reference: z.string().max(12_000_000).optional() }).parse(d))
  .handler(async ({ data }) => { const { paintAdvancedCardOperation } = await import('./pipeline-operations.server'); return paintAdvancedCardOperation({ data }); });
export const polishKidScript = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { scenes: string[]; problems: string[]; words: number; names: string[]; deployment: string }) => z.object({ scenes: z.array(z.string().min(1).max(2000)).min(1).max(120), problems: z.array(z.string().max(400)).max(40), words: z.number().int().min(10).max(400), names: z.array(z.string().max(80)).max(20), deployment: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => { const { polishKidScriptOperation } = await import('./pipeline-operations.server'); return polishKidScriptOperation({ data }); });
export const directCartoon = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { scenes: string[]; deployment: string; format?: 'short' | 'long'; advanced?: boolean }) => z.object({ scenes: z.array(z.string().min(1).max(4000)).min(1).max(600), deployment: z.string().min(1).max(64), format: z.enum(['short', 'long']).optional(), advanced: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => { const { directCartoonOperation } = await import('./pipeline-operations.server'); return directCartoonOperation({ data }); });
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
const VISUAL_DIRECTOR = `You are the Visual Director of a bright outlined 3D cartoon Shorts studio. Every sentence must SHOW what the narrator says, using ONLY the listed vocabulary (the engine cannot draw anything else; never invent items, never write code).
Return a cast and exactly one direction per input sentence, in order.
Cast (2-3 members whenever the story involves more than one person or group; 1 only for a true solo story): stable ids that name the role (hero, captain, rival, queen, doctor...), different seeds 1-999, and an outfit from the outfits list that matches each person's job, era and place (soldier/knight/veteran for armies, queen/noble/king for royalty, doctor/nurse for medicine, pharaoh for ancient Egypt, cowboy for the Wild West, chef for food, monk/priest for religion, woman/maid/peasant for townsfolk). Every cast member gets a DIFFERENT outfit so viewers can tell them apart.
Use the whole cast: introduce each member on screen early, put the person a sentence is about on screen as the subject, and give the others reaction roles. Do not show the same single character in every scene.
Per sentence:
- world + light: keep the same world across consecutive sentences unless the story moves; storm_sea for storms, night_camp for night outdoors.
- actors: 1-3 performers on screen with distinct slots (left/center/right) and facing (-1 faces left, 1 faces right, 0 camera). If two characters interact, put both on screen facing each other. "actor"/"action"/"expression" repeat the main subject.
- action and expression must act out the verb and emotion of the sentence (grab, point, cower, cheer, shout, look_back, think, carry, pour...). Do not leave everyone idle.
- props: the concrete nouns the sentence names (pirate_ship approaching on the sea, wave rising, coins in hand, map, cannon). place=hand for something held (max one), sea for ships/waves, sky for clouds/sun/moon/gulls, background for buildings/towers, ground_left/right for objects. motion animates them (approach, rise, fall, bob, spin, grow).
- animated library objects (marked animated) are rigged 3D people, animals, dinosaurs and monsters that really move: motion approach = walks/runs in, rise/fall = runs, spin/grow = celebrates, bob/none = idle. Prefer them for crowds, animals and creatures the story names.
- library objects: when a listed library object shows a noun better than the built-in props (animals, vehicles, food, furniture, buildings, space, graveyard, trees), use kind=asset with its exact id; never on place=hand. Use asset="" for built-in props. Buildings, trees, vehicles and ships go to background or sea; small items to ground_left/right.
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

export const factCheck = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; deployment: string }) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required");
    return d;
  })
  .handler(async ({ data }) => { const { factCheckOperation } = await import('./pipeline-operations.server'); return factCheckOperation({ data }); });

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

export const researchStory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; facts: string; deployment: string }) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required");
    return { ...d, facts: (d.facts ?? "").slice(0, 5000) };
  })
  .handler(async ({ data }) => { const { researchStoryOperation } = await import('./pipeline-operations.server'); return researchStoryOperation({ data }); });

// ---------------- Blind judges (Pass A / B / C) ----------------

interface PassAnswer { what: string; where: string; odd: string; next: string }
const passASchema = { type: "object", additionalProperties: false, required: ["what", "where", "odd", "next"], properties: { what: S, where: S, odd: S, next: S } };
const passBSchema = { type: "object", additionalProperties: false, required: ["premise", "hero", "want", "question"], properties: { premise: S, hero: S, want: S, question: S } };
const passCSchema = { type: "object", additionalProperties: false, required: ["answered", "answer", "payoff", "weakest"], properties: { answered: { type: "boolean" }, answer: S, payoff: S, weakest: S } };
const gradeSchema = {
  type: "object", additionalProperties: false, required: ["passA", "passB", "readAloud", "literal", "filler"],
  properties: {
    passA: { type: "integer" }, passB: { type: "integer" },
    readAloud: { type: "array", items: S }, literal: { type: "array", items: { type: "integer" } }, filler: { type: "array", items: S },
  },
};

export const judgeScript = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { first3: string; first15: string; full: string; truth: string; shots: string; deployment: string }) => ({
    ...d, first3: d.first3.slice(0, 1200), first15: d.first15.slice(0, 3000), full: d.full.slice(0, 12000), truth: d.truth.slice(0, 3000), shots: d.shots.slice(0, 12000),
  }))
  .handler(async ({ data }) => { const { judgeScriptOperation } = await import('./pipeline-operations.server'); return judgeScriptOperation({ data }); });

// ---------------- Continuity gate (vision) ----------------

export const checkContinuity = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { sheet: string; shot: string; cast: string; deployment: string }) => {
    if (d.sheet.length > 6_000_000 || d.shot.length > 6_000_000) throw new Error("Image too large");
    return d;
  })
  .handler(async ({ data }) => { const { checkContinuityOperation } = await import('./pipeline-operations.server'); return checkContinuityOperation({ data }); });

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

export const generateHooks = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; facts: string; research: string; prefer?: string; deployment: string }) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required");
    return { ...d, facts: (d.facts ?? "").slice(0, 4000), research: (d.research ?? "").slice(0, 3000), prefer: (d.prefer ?? "").slice(0, 200) };
  })
  .handler(async ({ data }) => { const { generateHooksOperation } = await import('./pipeline-operations.server'); return generateHooksOperation({ data }); });

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

export const generatePlan = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: PlanInput) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required (max 300 chars)");
    return { ...d, durationSec: Math.max(10, Math.min(1200, Math.round(d.durationSec))) };
  })
  .handler(async ({ data }) => { const { generatePlanOperation } = await import('./pipeline-operations.server'); return generatePlanOperation({ data }); });

// ---------------- Voice ----------------

export interface VoiceInput { text: string; voice: string; deployment: string; style: string }

const VOICES = new Set(["onyx", "ash", "echo", "ballad", "verse", "cedar"]);

export const generateVoice = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: VoiceInput) => {
    if (!d.text?.trim() || d.text.length > 4000) throw new Error("Narration text must be 1–4000 characters");
    if (!VOICES.has(d.voice)) throw new Error("Unknown voice");
    return d;
  })
  .handler(async ({ data }) => { const { generateVoiceOperation } = await import('./pipeline-operations.server'); return generateVoiceOperation({ data }); });

// ---------------- Images ----------------

export interface ImageInput {
  prompt: string;
  aspect: "portrait" | "landscape";
  deployment: string;
  quality: "low" | "medium" | "high";
  style: string;
  crisp?: boolean;
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
    const { azureOpenAIRequest } = await import('./azure-openai.server');
    const fd = new FormData();
    fd.append("image[]", new Blob([b64ToBytes(data.reference)], { type: "image/jpeg" }), "cast.jpg");
    fd.append("prompt", prompt);
    fd.append("size", size);
    fd.append("quality", data.quality);
    fd.append("output_format", "jpeg");
    fd.append("output_compression", "82");
    fd.append("n", "1");
    return azureOpenAIRequest(`${safeName(data.deployment)}/images/edits`, fd, true);
  }
  return azure(`${safeName(data.deployment)}/images/generations`, {
    prompt, size, quality: data.quality, output_format: "jpeg", output_compression: 82, n: 1,
  });
}

export const generateImage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: ImageInput) => {
    if (!d.prompt?.trim() || d.prompt.length > 3000) throw new Error("Image prompt must be 1–3000 characters");
    if (d.reference && d.reference.length > 6_000_000) throw new Error("Reference image too large");
    return d;
  })
  .handler(async ({ data }) => { const { generateImageOperation } = await import('./pipeline-operations.server'); return generateImageOperation({ data }); });

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

export const importShort = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; deployment: string }) => {
    const url = d.url?.trim() ?? "";
    if (!YT_URL.test(url) || url.length > 200) throw new Error("Paste a YouTube link, like https://www.youtube.com/shorts/abc123 or https://www.youtube.com/watch?v=abc123");
    return { url, deployment: d.deployment };
  })
  .handler(async ({ data }) => { const { importShortOperation } = await import('./pipeline-operations.server'); return importShortOperation({ data }); });
