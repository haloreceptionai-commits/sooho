import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { styleAnchor } from "@/lib/styles";
import { FEW_SHOT } from "@/lib/story-v2";
import { cartoonDirection, OUTFITS, VOCAB } from '@/lib/cartoon-job';
import { z } from 'zod';

// Server-side calls to Azure OpenAI (through the Lovable connector gateway) and,
// for narration when no Azure speech deployment exists, Lovable AI speech.

const AZURE_GATEWAY = "https://connector-gateway.lovable.dev/udc_azure_openai";
const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1";
const API_VERSION = "2025-04-01-preview";

const safeName = (s: string) => {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(s)) throw new Error("Invalid deployment name");
  return s;
};

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const azure = process.env["UDC_AZURE_OPENAI_API_KEY"];
  if (!lovable || !azure) throw new Error("Azure OpenAI is not connected");
  return { lovable, azure };
}

async function azure(path: string, body: unknown) {
  const k = keys();
  const res = await fetch(`${AZURE_GATEWAY}/openai/deployments/${path}?api-version=${API_VERSION}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${k.lovable}`, "X-Connection-Api-Key": k.azure, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res;
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
export const directCartoon = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { scenes: string[]; deployment: string }) => z.object({ scenes: z.array(z.string().min(1).max(4000)).min(1).max(120), deployment: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const en = (k: keyof typeof VOCAB) => ({ type: 'string', enum: VOCAB[k] });
    // Searchable CC0 library: the Director sees only objects matching this story's words.
    const { shortlist } = await import('./object-library');
    const objects = shortlist(data.scenes);
    const performer = { type: 'object', additionalProperties: false, required: ['actor', 'action', 'expression', 'slot', 'facing'], properties: { actor: { type: 'string' }, action: en('actions'), expression: en('expressions'), slot: en('slots'), facing: { type: 'integer', enum: [-1, 0, 1] } } };
    const schema = { type: 'object', additionalProperties: false, required: ['cast', 'scenes'], properties: {
      cast: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'seed', 'outfit'], properties: { id: { type: 'string' }, seed: { type: 'integer' }, outfit: { type: 'string', enum: [...OUTFITS] } } } },
      scenes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['world', 'light', 'action', 'expression', 'actor', 'wide', 'shot', 'move', 'mood', 'actors', 'speaker', 'props', 'fx', 'cues', 'keyword'], properties: {
        world: en('worlds'), light: en('lights'), action: en('actions'), expression: en('expressions'), actor: { type: 'string' }, wide: { type: 'boolean' },
        shot: en('shots'), move: en('moves'), mood: en('moods'), actors: { type: 'array', items: performer }, speaker: { type: 'string' },
        props: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'place', 'motion', 'asset'], properties: { kind: en('props'), place: en('places'), motion: en('prop_motions'), asset: { type: 'string', enum: ['', ...objects.map(o => o.id)] } } } },
        fx: { type: 'array', items: en('fx') }, cues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['word', 'kind'], properties: { word: { type: 'integer' }, kind: en('sounds') } } }, keyword: { type: 'string' },
      } } },
    } };
    const raw = await azureJson<{ cast: unknown[]; scenes: Record<string, unknown>[] }>(data.deployment, VISUAL_DIRECTOR,
      data.scenes.map((s, i) => `${i}: ${s}`).join('\n') + (objects.length ? `\n\nLibrary objects for this story (use kind=asset with asset=<id>):\n${objects.map(o => `${o.id} — ${o.name}${o.type === 'sprite' ? ' (flat animal art)' : o.clips?.length ? ' (animated: idle/walk/run)' : ''}`).join('\n')}` : ''), 'cartoon_direction', schema, 'Visual director');
    // Empty speaker means narration (no lip sync); trim lists to engine limits before strict validation.
    const scenes = raw.scenes.map(s => ({ ...s, speaker: s['speaker'] || undefined, keyword: String(s['keyword'] ?? '').slice(0, 40) || undefined,
      actors: Array.isArray(s['actors']) && s['actors'].length ? s['actors'].slice(0, 3) : undefined, props: Array.isArray(s['props']) ? (s['props'] as Record<string, unknown>[]).map((p): Record<string, unknown> => ({ ...p, asset: p['asset'] || undefined })).filter(p => (p['kind'] === 'asset') === !!p['asset']).slice(0, 4) : [], fx: Array.isArray(s['fx']) ? s['fx'].slice(0, 3) : [], cues: Array.isArray(s['cues']) ? s['cues'].slice(0, 4) : [] }));
    const result = cartoonDirection.parse({ cast: diversifyCast(raw.cast as CastMember[]), scenes });
    if (result.scenes.length !== data.scenes.length) throw Error('This story needs cartoon actions or props that are not supported yet');
    return result;
  });
type CastMember = { id: string; seed: number; outfit: string };
// Distinct looks per cast member: duplicate outfits/seeds are swapped for unused ones so characters never read as clones.
export function diversifyCast(cast: CastMember[]): CastMember[] {
  const used = new Set<string>(), seeds = new Set<number>();
  return (cast || []).slice(0, 3).map((c, i) => {
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
  .handler(async ({ data }) => azureJson<FactSheet>(data.deployment,
    `You are a meticulous history & science fact-checker for a Shorts channel. List 5-8 atomic, checkable claims the video will rely on. For each give 2+ independent named sources (book, paper, museum, primary document, e.g. "Pliny, Natural History II.234", "Franklin letter to Brownrigg, 1774"), the date/period, and a confidence rating. Never invent sources; if you are unsure, lower confidence. "myth" = what the popular telling says, "reality" = what evidence supports. "hedge" = ONE short spoken line (max 12 words) the narrator must say if the effect is partial or overstated, else "".`,
    `Topic: ${data.topic}`, "fact_sheet", factSchema, "Fact checker"));

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
  .handler(async ({ data }) => azureJson<Research>(data.deployment,
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
    `Topic: ${data.topic}\nFact sheet:\n${data.facts}`, "research", researchSchema, "Research"));

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
  .handler(async ({ data }) => {
    const blind = "You are a cold viewer who has never heard of this topic. Answer ONLY from what you are shown; if you can't tell, answer \"unclear\".";
    const [a, b, c] = await Promise.all([
      azureJson<PassAnswer>(data.deployment, blind, `You saw the first 3 seconds of a Short:\n${data.first3}\nWhat is happening? Where? Why is it odd? What might happen next?`, "pass_a", passASchema, "Judge A"),
      azureJson<{ premise: string; hero: string; want: string; question: string }>(data.deployment, blind, `You saw the first 15 seconds:\n${data.first15}\nState the premise, the hero, what the hero wants and the central question.`, "pass_b", passBSchema, "Judge B"),
      azureJson<{ answered: boolean; answer: string; payoff: string; weakest: string }>(data.deployment, blind, `Full script:\n${data.full}\nWas the opening question answered (quote the answer)? What was the payoff? Which beat was weakest?`, "pass_c", passCSchema, "Judge C"),
    ]);
    const g = await azureJson<{ passA: number; passB: number; readAloud: string[]; literal: number[]; filler: string[] }>(data.deployment,
      "You grade blind viewer answers against the truth, and audit a script. Be strict but fair: an answer is correct if a stranger clearly got the idea.",
      `TRUTH:\n${data.truth}\n\nPass A answers (what/where/odd/next): ${JSON.stringify(a)}\nPass B answers (premise/hero/want/question): ${JSON.stringify(b)}\n\nFULL SCRIPT:\n${data.full}\n\nSCENES (index: narration => visual):\n${data.shots}\n\nReturn passA = number of the 4 Pass A answers that are correct, passB = number of the 4 Pass B answers that are correct. readAloud = sentences that are fragments, drop words, or don't parse when spoken aloud (quote them; [] if none). literal = scene indexes whose visual does NOT literally show the main noun/action of its narration. filler = sentences that only describe a scene and add no new fact or reversal.`,
      "grade", gradeSchema, "Grader");
    return { passA: g.passA, passB: g.passB, passC: !!c.answered, payoff: c.payoff, weakest: c.weakest, readAloud: g.readAloud, literal: g.literal, filler: g.filler, answers: { a, b, c } };
  });

// ---------------- Continuity gate (vision) ----------------

export const checkContinuity = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { sheet: string; shot: string; cast: string; deployment: string }) => {
    if (d.sheet.length > 6_000_000 || d.shot.length > 6_000_000) throw new Error("Image too large");
    return d;
  })
  .handler(async ({ data }) => {
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
  });

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
  .handler(async ({ data }) => {
    const r = await azureJson<{ hooks: Hook[] }>(data.deployment,
      `You write the first 3 seconds of viral story Shorts. Write exactly 10 hooks, 2 of each type: paradox_image, shocking_number, mid_action, direct_question, contrarian.
HARD RULES for "line" (the first spoken sentence):
- 8-12 words. No greeting, no joke setup, no riddle, never "Did you know", never "Imagine", never "A [job] knocks...", nothing that needs context from later.
- Must contain: a concrete subject (say the subject anchor word), an odd action or number, and a place OR time anchor (say the year/era or place).
- States the oddity in concrete words a 5-year-old understands, so a stranger instantly knows what is odd. It may tease but must not give the hidden reason.
- Every number must come from the fact sheet. Family-friendly words only. direct_question hooks must still contain the subject + anchor.
"visual" = the first frame: a WIDE shot that shows the odd thing (never a face close-up).
"text" = on-screen hook text, max 6 words, states the oddity as a FACT (no question mark), and must NOT repeat the spoken line's words (e.g. spoken "In 1942, America hid a bomber factory under a fake neighbourhood." -> text "FAKE STREET. REAL BOMBERS.").
Score each 1-10 honestly on curiosity, clarity, visualness, speakability.${data.prefer ? `\nOur audience data says these hook types perform best (in order): ${data.prefer}.` : ""}`,
      `Topic: ${data.topic}\nResearch (anchors, premise, question):\n${data.research}\nFact sheet:\n${data.facts}`, "hooks", hookSchema, "Hook writer");
    return { all: r.hooks };
  });

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
}
export type Camera = "push_in" | "pull_out" | "pan_left" | "pan_right" | "tilt_up" | "tilt_down" | "punch_in" | "orbit";
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
    return { ...d, durationSec: Math.max(20, Math.min(1200, Math.round(d.durationSec))) };
  })
  .handler(async ({ data }): Promise<Plan> => {
    const short = data.format === "short";
    const D = data.durationSec;
    const words = Math.round(D * (short ? 2.6 : 2.37)); // Atlas Shorts pace ~153 wpm; long-form narrator ~142 wpm
    const scenes = short ? Math.max(8, Math.round(D / 3)) : Math.min(90, Math.max(14, Math.round(D / 6)));
    const perScene = Math.round(words / scenes);
    const at = (f: number) => Math.round(D * f);
    const system = `You write ${D}-second ${short ? "vertical story Shorts" : "story documentaries"} for a viral history & science channel. You write a STORY with a hero, not a lecture.
First output the premise sentence and an impossible question of at most 10 words. Then output a beat sheet with fields: beat, start_s, end_s, words, purpose, loop_opened, loop_closed, visual (must literally show the narrated noun/action), camera_move.
The video has ONE hero with a want, at most 3 recurring characters (hero, skeptic or ally, threat), and a money-shot image that appears early and again at the payoff.
The hook (8-12 words) states a concrete oddity with a place or time anchor and never starts with a riddle, joke setup or greeting. By 8s the viewer knows who, where, when and what is at stake. From ~${at(0.15)}s to ~${at(0.7)}s run try-fail-adapt twice, each bigger than the last. Reveal the answer once, with one everyday analogy and one visual proof. Close the opening question in the last 8 seconds. Sentences are 3-12 words and must be grammatical when spoken aloud. Re-hook every 6-8 seconds.

WORD CLOCK (the narrator says ~2.6 words per second — count words, this is checked by a machine):
- Words 1-12: the hook. Words 1-20 (=8s): say ALL of subject, year, place and stakes words, AND finish the ONE main question sentence (ending "?", max 12 words, containing the subject word). No other "?" until word ~40.
- Within words 1-26 (=10s): the sentence "[hero name] wants/needs ..." and the org name by word ~38 (=15s).
- The main question is answered (loop_closed "main") in a scene starting at 65-75% of all words.
- The LAST ~20 words repeat the main question's key words and answer it plainly.

SKELETON (scale to ${D}s):
- 0-3s hook: the oddity in concrete words, shown on screen (wide shot, money shot or the odd thing).
- 3-${at(0.15)}s context: place, year, who, what is at stake. Premise fully clear by 8s. Say ALL anchors by 8s: subject, year, place, stakes; say the org by 15s.
- by 8s question: the main question is SPOKEN (one sentence ending "?", max 12 words, plain words). It is the ONLY question before 15s. Then try #1 shown visibly.
- ${at(0.3)}-${at(0.7)}s escalation: try -> fail -> adapt, twice; each bigger, riskier or stranger. One skeptic line in quoted dialogue ("That can't work."), one rival/threat. Beats "try", "fail", "escalation" (a "fail" or "escalation" beat must start before 30s).
- myth beat at 40-60% of the words: "Most people think/picture X. Actually Y." before the proof.
- reveal + analogy + proof (main loop closes at 65-75%): ONE reveal that answers the question, ONE household analogy starting "Ever ...?", ONE visual proof shot.
- payoff (last ~${Math.max(6, at(0.12))}s): a consequence, twist, number or image the viewer did not expect (never an absence like "nobody came" unless framed as success: "It worked so well that..."). The final 8s REPEAT the opening question's words and answer it plainly ("So how do you hide a factory from the sky? You turn its roof into a fake street."). loopLine = that closing line.

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
${data.research ? `Research (use these anchors, hero, question, tries, payoff and money shot):\n${data.research}\n` : ""}${data.facts ? `Fact sheet (obey it):\n${data.facts}\n` : ""}${data.hook ? `Open with this exact hook line: "${data.hook}"\n` : ""}${data.repair ? `A previous draft FAILED these checks — fix every one, keep what passed:\n${data.repair}\n` : ""}Return a click-worthy title (under 60 chars) and a 2-sentence YouTube description.`;

    const plan = await azureJson<Plan>(data.deployment, system, user, "video_plan", planSchema, "Script writer");
    if (!plan.scenes?.length) throw new Error("Script writer returned an empty plan");
    return plan;
  });

// ---------------- Voice ----------------

export interface VoiceInput { text: string; voice: string; deployment: string; style: string }

const VOICES = new Set(["onyx", "ash", "echo", "ballad", "verse", "cedar"]);

export const generateVoice = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: VoiceInput) => {
    if (!d.text?.trim() || d.text.length > 4000) throw new Error("Narration text must be 1–4000 characters");
    if (!VOICES.has(d.voice)) throw new Error("Unknown voice");
    return d;
  })
  .handler(async ({ data }): Promise<{ audio: string; engine: "azure" | "lovable" }> => {
    // Atlas narrator: exact voice + direction of the approved audition (renderer applies the 0.85 pace).
    const longDirection = "A warm, grounded male documentary narrator telling a true story to a curious friend. Calm, clear and confident at a natural storytelling pace, never rushed; gentle curiosity rising into each question, a small pause before every answer, quiet intensity in tense moments and real wonder at the reveal. Every word crisp and easy to follow. Not shouting, not whispering, not sleepy";
    const direction = data.style === "long" ? longDirection : "A grounded male baritone with bright, excited energy. You are thrilled to tell one friend a fascinating secret fact. Speak a little faster than a calm documentary, lively and upbeat, with a knowing grin in the voice, punchy emphasis on the twist lines, rising anticipation, then delighted amazement at the reveal. Keep every word crisp and clear, short natural pauses only. Not shouting, not whispering, not rushed";
    // 2) Fallback: Lovable AI speech (Gemini TTS)
    const k = keys();
    const res = await fetch(`${LOVABLE_AI}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${k.lovable}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: `${direction}: Read the following narration aloud, word for word. Narration: ${data.text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } } },
        stream_format: "audio",
      }),
    });
    if (!res.ok) { console.error(`Voice text was: ${data.text.slice(0, 600)}`); await fail(res, "Voice"); }
    return { audio: toBase64(await res.arrayBuffer()), engine: "lovable" };
  });

// ---------------- Images ----------------

export interface ImageInput {
  prompt: string;
  aspect: "portrait" | "landscape";
  deployment: string;
  quality: "low" | "medium";
  style: string;
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
    const k = keys();
    const fd = new FormData();
    fd.append("image[]", new Blob([b64ToBytes(data.reference)], { type: "image/jpeg" }), "cast.jpg");
    fd.append("prompt", prompt);
    fd.append("size", size);
    fd.append("quality", data.quality);
    fd.append("output_format", "jpeg");
    fd.append("output_compression", "82");
    fd.append("n", "1");
    return fetch(`${AZURE_GATEWAY}/openai/deployments/${safeName(data.deployment)}/images/edits?api-version=${API_VERSION}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${k.lovable}`, "X-Connection-Api-Key": k.azure },
      body: fd,
    });
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
  .handler(async ({ data }): Promise<{ image: string | null; note: string }> => {
    const anchor = styleAnchor(data.style);
    const build = (p: string) => data.sheet
      ? `Character reference sheet. ${anchor}. Full-body front view of each character standing side by side on a plain light grey studio background, evenly spaced, neutral pose, consistent scale: ${p}. No text, no labels.`
      : `${anchor}. ${data.palette ? `Color direction: ${data.palette}. ` : ""}${data.reference ? "Keep the characters EXACTLY as they look in the reference sheet (same faces, hair, clothes, colors, proportions) but place them in this new shot; do not show the grey sheet background. " : ""}Shot: ${p}${data.cast ? ` Characters: ${data.cast}.` : ""} Full-bleed ${data.aspect === "portrait" ? "vertical 9:16" : "16:9"} frame, subject large and centered, dramatic depth. Family-friendly, no gore. Absolutely no text, letters, captions or watermarks.`;
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
  });

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
    if (!YT_URL.test(url) || url.length > 200) throw new Error("Paste a YouTube Short link, like https://www.youtube.com/shorts/abc123");
    return { url, deployment: d.deployment };
  })
  .handler(async ({ data }) => {
    const lovable = process.env["LOVABLE_API_KEY"], apify = process.env["APIFY_API_KEY"];
    if (!lovable || !apify) throw new Error("Apify is not connected");
    const res = await fetch("https://connector-gateway.lovable.dev/apify/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": apify, "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: data.url }),
    });
    if (!res.ok) await fail(res, "Transcript reader");
    const items = (await res.json()) as { data?: { text?: string }[] }[];
    const transcript = (items[0]?.data ?? []).map((x) => x.text ?? "").join(" ").replace(/\[(music|applause|laughter)\]/gi, "").replace(/\s+/g, " ").trim().slice(0, 8000);
    if (transcript.split(" ").length < 15) throw new Error("This Short has no readable spoken words (no captions found). Try another link.");
    const out = await azureJson<Omit<ShortImport, "transcript">>(data.deployment,
      "You analyse a viral YouTube Short's transcript so a channel can make its OWN new video on the same true topic. topic: a short catchy video title (max 10 words) naming the real-world subject, e.g. 'Why Sailors Carried Storm Oil'. summary: 1-2 plain sentences on the true story/fact behind it. facts: 3-6 checkable real-world facts the video relies on. Never copy lines.",
      `Transcript:\n${transcript}`, "short_import",
      { type: "object", additionalProperties: false, required: ["topic", "summary", "facts"], properties: { topic: { type: "string" }, summary: { type: "string" }, facts: { type: "array", items: { type: "string" } } } },
      "Topic reader");
    return { transcript, ...out };
  });
