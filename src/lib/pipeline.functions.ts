import { createServerFn } from "@tanstack/react-start";
import { styleAnchor } from "@/lib/styles";

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
    reasoning_effort: "low",
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

export const factCheck = createServerFn({ method: "POST" })
  .inputValidator((d: { topic: string; deployment: string }) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required");
    return d;
  })
  .handler(async ({ data }) => azureJson<FactSheet>(data.deployment,
    `You are a meticulous history & science fact-checker for a Shorts channel. List 5-8 atomic, checkable claims the video will rely on. For each give 2+ independent named sources (book, paper, museum, primary document, e.g. "Pliny, Natural History II.234", "Franklin letter to Brownrigg, 1774"), the date/period, and a confidence rating. Never invent sources; if you are unsure, lower confidence. "myth" = what the popular telling says, "reality" = what evidence supports. "hedge" = ONE short spoken line (max 12 words) the narrator must say if the effect is partial or overstated, else "".`,
    `Topic: ${data.topic}`, "fact_sheet", factSchema, "Fact checker"));

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

export const generateHooks = createServerFn({ method: "POST" })
  .inputValidator((d: { topic: string; facts: string; deployment: string }) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required");
    return { ...d, facts: (d.facts ?? "").slice(0, 4000) };
  })
  .handler(async ({ data }) => {
    const r = await azureJson<{ hooks: Hook[] }>(data.deployment,
      `You write 0:00 hooks for viral history Shorts (RicksClips / Zack D. Films style). Write exactly 10 hooks, 2 of each type: paradox_image, shocking_number, mid_action, direct_question, contrarian. Each "line" is the first spoken sentence: max 12 words, THIRD person ("A sailor...", "He..."; never "I" or "we"), present tense, family-friendly words only (no blood, bleeding, killing, dying, corpses, weapons hurting people), starts mid-action, no greeting, never "Did you know", no "in this video". "visual" = the matching first-frame image (an odd, concrete action). "text" = a 3-6 word on-screen version (no punctuation except ?). Score each 1-10 honestly on curiosity, clarity, visualness, speakability. Stay factually true to the fact sheet, but NEVER reveal or hint at the answer/explanation — the hook only shows the weird action and opens the "why?" loop (e.g. "A sailor pours cooking oil into the sea as pirates close in.").`,
      `Topic: ${data.topic}\nFact sheet: ${data.facts}`, "hooks", hookSchema, "Hook writer");
    const total = (h: Hook) => h.curiosity * 1.4 + h.clarity + h.visualness * 1.2 + h.speakability - (h.line.split(/\s+/).length > 12 ? 10 : 0) - (/did you know|hello|hey guys|welcome/i.test(h.line) ? 20 : 0);
    const ranked = [...r.hooks].sort((a, b) => total(b) - total(a));
    return { best: ranked[0]!, runnerUp: ranked[1] ?? ranked[0]!, all: ranked };
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
  hook?: string; // chosen opening line
  repair?: string; // validator issues from a previous draft
}
export type Camera = "push_in" | "pull_out" | "pan_left" | "pan_right" | "tilt_up" | "tilt_down" | "punch_in";
export interface PlanCharacter { name: string; look: string }
export interface PlanScene {
  beat: string; narration: string; image_prompt: string; characters: string[];
  camera: Camera; sfx: string; mood: "tension" | "reveal"; color: string; angle: string;
}
export interface PlanBeat { beat: string; start_s: number; end_s: number; words: number; purpose: string; open_loop_id: string; visual_note: string }
export interface Plan { beats: PlanBeat[]; script: string; title: string; description: string; palette: string; hookText: string; loopLine: string; characters: PlanCharacter[]; scenes: PlanScene[] }

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["beats", "script", "title", "description", "palette", "hookText", "loopLine", "characters", "scenes"],
  properties: {
    beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["beat", "start_s", "end_s", "words", "purpose", "open_loop_id", "visual_note"], properties: {
      beat: { type: "string" }, start_s: { type: "number" }, end_s: { type: "number" }, words: { type: "integer" }, purpose: { type: "string" }, open_loop_id: { type: "string" }, visual_note: { type: "string" },
    } } },
    hookText: { type: "string" },
    loopLine: { type: "string" },
    script: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    palette: { type: "string" },
    characters: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "look"], properties: { name: { type: "string" }, look: { type: "string" } } },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beat", "narration", "image_prompt", "characters", "camera", "sfx", "mood", "color", "angle"],
        properties: {
          beat: { type: "string", enum: ["hook", "stakes", "defeat", "countdown", "climax", "reveal", "proof", "payoff"] },
          color: { type: "string", enum: ["bright", "dark_cold", "warm_interior", "golden_macro", "high_contrast"] },
          angle: { type: "string", enum: ["wide", "close", "aerial", "top_down", "macro", "pov", "low_angle", "over_shoulder"] },
          narration: { type: "string" },
          image_prompt: { type: "string" },
          characters: { type: "array", items: { type: "string" } },
          camera: { type: "string", enum: ["push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "punch_in"] },
          sfx: { type: "string", enum: ["none", "whoosh", "boom", "snap", "splash", "thunder", "creak", "coin", "fire", "heartbeat", "crowd", "clang", "wind", "pour", "wave", "crash"] },
          mood: { type: "string", enum: ["tension", "reveal"] },
        },
      },
    },
  },
};

// Tone reference (style only — never reuse its content).
const TONE_EXAMPLE = `"Pour cooking oil into the sea with a pirate ship so close behind them he could hear the pirates laughing. His captain grabs him by the collar and goes, 'We're about to get boarded, and you're making soup?' But he doesn't even look up. He just points at the black clouds. 'Steer into the storm.' ... You see, sailors really carried oil just for this. They called it storm oil. Ever blown on a bowl of soup? The broth ripples, but the oily spots stay perfectly smooth... And fifty yards behind, it curls over and drops straight onto the pirates' deck."`;

export const generatePlan = createServerFn({ method: "POST" })
  .inputValidator((d: PlanInput) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required (max 300 chars)");
    return { ...d, durationSec: Math.max(20, Math.min(1200, Math.round(d.durationSec))) };
  })
  .handler(async ({ data }): Promise<Plan> => {
    const short = data.format === "short";
    const wpm = 153; // approved Atlas narrator pace
    const words = Math.round((data.durationSec / 60) * wpm);
    const scenes = short ? Math.max(8, Math.round(data.durationSec / 3)) : Math.min(90, Math.max(14, Math.round(data.durationSec / 7)));
    const perScene = Math.round(words / scenes);
    const system = `You are the head writer of a viral history & science Shorts channel (style of RicksClips3000 / Zack D. Films, 7.8M+ average views).
You write a STORY, not a lecture: an ordinary protagonist does something that looks insane, a rival mocks or doubts it, danger escalates, then the hidden science/history is revealed and the rival gets the catastrophe.
Voice of the narration — copy this TONE, never its content: ${TONE_EXAMPLE}
Rules:
- 0:00 hook: start mid-action with the strange act itself, under 12 words before the first comma or period. No greetings, no "did you know", no "in this video".
- Third person, present tense, conversational ("goes,", "and all he gets back is,"). Short quoted dialogue lines between characters.
- CURIOSITY-GAP MINI-STORY. Beats in order: hook (weird action, the open loop "why?") → stakes (antagonist + a SKEPTIC who doubts it out loud in quoted dialogue) → defeat → countdown (escalation with 2 mini-twists; a new event, place or question every 6-8 seconds; withhold the answer) → climax (peak tension) → reveal ("You see, ..." name the real practice + one everyday household analogy starting with "Ever ...?") → proof (one visual demo of the mechanism, e.g. a macro shot of soup) → payoff (spectacle; rival gets the catastrophe) and the LAST sentence is the loopLine: it loops back to the hook image or opens a follow-up question.
- The reveal beat must START between 60% and 72% of the total words. Every question raised must be answered by the end.
- WORDS A 5-YEAR-OLD KNOWS: use only short, common, everyday words a young kid hears at home ("big", "boat", "oil", "water", "scared", "trick"). Never words like "phenomenon", "viscosity", "surface tension", "maritime", "navigate", "catastrophic", "approximately", "mechanism", "unprecedented". If a science idea needs a name, say it once and explain it in kid words right away ("a thin skin on top of the water").
- HOOK (first sentence): a strange action or a shocking picture that makes the viewer ask "WHY?". Never give the answer.
- RE-HOOKS: every 8-10 seconds before the reveal, end a sentence with a NEW question the viewer now needs answered ("So why would he waste good oil?", "But how can oil stop a wave?"). Each one opens a new loop; at least ${Math.max(2, Math.floor((data.durationSec * 0.65) / 12))} questions before the reveal.
- FALSE BELIEF BROKEN: once, state what most people believe, then smash it ("Most people think oil makes things slippery and worse. But that's wrong."). Put it right before or inside the reveal.
- SOUND WORDS: use vivid action words the editor can add sound to (splash, spray, crash, boom, creak, pour, thunder) on the key moments.
- First write the timed beat sheet in "beats" (start_s, end_s, words, purpose, open_loop_id, visual_note), THEN write the prose to match it.
- SENTENCES: 6-12 words each (never fragments under 5 words like "Reed curses." or "Spray blinds the crew."), present-tense action, concrete nouns, one idea per sentence, questions as pivots, dialogue quoted inside narration. It must still flow as one story told out loud (use "But", "So", "Then" to link) — no lists, at most 3 named characters, crystal clear to a 5-year-old on first listen. No passive voice, no jargon without an analogy.
- FACTS: stay inside the fact sheet. If it gives a hedge line, say it (in your own words) in the reveal or proof, never overstate the effect.
- Historically accurate. No subscribe/like calls. No filler; every sentence pushes forward.
- Plain, simple spoken words. Every line must make literal sense; no poetic metaphors ("glassy knuckles", "clock ticks in his ears"), no "us/we" from the narrator, refer to characters by role ("the cook", "his captain", "the pirates") more than by name.
- Write the WHOLE narration first in "script" (polish it until it reads perfectly out loud), THEN split that exact text, word for word, into the scenes' "narration" fields.
Visuals — a new shot about every 3 seconds with smooth continuous camera moves, so every scene is ONE clear action moment:
- characters: 2–4 recurring characters with a fixed, very specific look (age, build, face, hair/beard, clothing colors, one signature prop). Reuse the exact names in scenes.
- palette: one sentence of color direction (e.g. deep navy storm sea vs glowing amber oil). Even night/storm scenes must be BRIGHTLY lit and vivid — readable, saturated, never murky.
- image_prompt: what the camera sees in that instant — subject + action + expression, setting, camera angle (close-up, low angle, over-the-shoulder, wide aerial...), lighting. Vary angles shot to shot. Characters are always DOING the action (pouring, grabbing, pointing, gripping the wheel) — never standing in a lineup or posing. At least 40% of shots show no faces at all: the threat (a ship, a towering wave, storm clouds), a key object in extreme close-up, or a wide aerial establishing shot. Include a simple explainer visual for the reveal (e.g. a bowl of soup with an oil droplet). Include the key prop in a contrasting color. Never put text, letters or signs in the image.
- Narration safety (the voice engine blocks violent text): family-friendly words only — never "blood", "bleeding", "kill", "murder", "die/dead/death", "corpse", "stab", "slaughter", "drown" (say "sink", "swamped", "wiped out", "in trouble" instead).
- Safety filter: never describe gore, blood, corpses, injuries, people dying, children, nudity or real living people. Show danger indirectly (towering waves, cracking stone, smoke, terrified faces, the rival ship swamped by foam).
- camera: the motion that best sells the moment (punch_in for shocks/reveals, tilt_up for something huge, pan for chases).
- angle: change it on every scene (wide, close, aerial, top_down, macro, pov, low_angle, over_shoulder); never the same angle twice in a row.
- color: colour arc tracks emotion — "bright" for the sunny setup, "dark_cold" for tension/storm, "warm_interior" for the reveal, "golden_macro" for the proof close-up, "high_contrast" for the payoff spectacle.
- sfx: the sound of the visual event (pour, wave, crash, clang, splash...). mood: "tension" until the reveal, then "reveal".
- hookText: a 3-6 word on-screen version of the hook.`;
    const user = `Format: ${short ? "YouTube Short / Reel, vertical 9:16" : "long-form YouTube story documentary, 16:9 (same storytelling style, more detail and more twists)"}.
Topic: ${data.topic}
Viral archetype: ${data.archetype}
Target: ${data.durationSec} seconds ≈ ${words} words of narration total (±8%). Exactly about ${scenes} scenes of ~${perScene} words each — a scene's narration may end mid-sentence; it continues in the next scene.
${data.facts ? `Fact sheet (obey it): ${data.facts}\n` : ""}${data.hook ? `Open with this exact hook line: "${data.hook}"\n` : ""}${data.repair ? `A previous draft FAILED these checks — fix every one: ${data.repair}\n` : ""}Return a click-worthy title (under 60 chars, curiosity "Why..."/"The..." style) and a 2-sentence YouTube description.`;

    const plan = await azureJson<Plan>(data.deployment, system, user, "video_plan", planSchema, "Script writer");
    if (!plan.scenes?.length) throw new Error("Script writer returned an empty plan");
    return plan;
  });

// ---------------- Voice ----------------

export interface VoiceInput { text: string; voice: string; deployment: string; style: string }

const VOICES = new Set(["onyx", "ash", "echo", "ballad", "verse", "cedar"]);

export const generateVoice = createServerFn({ method: "POST" })
  .inputValidator((d: VoiceInput) => {
    if (!d.text?.trim() || d.text.length > 4000) throw new Error("Narration text must be 1–4000 characters");
    if (!VOICES.has(d.voice)) throw new Error("Unknown voice");
    return d;
  })
  .handler(async ({ data }): Promise<{ audio: string; engine: "azure" | "lovable" }> => {
    // Atlas narrator: exact voice + direction of the approved audition (renderer applies the 0.85 pace).
    const direction = "A grounded male baritone with bright, excited energy. You are thrilled to tell one friend a fascinating secret fact. Speak a little faster than a calm documentary, lively and upbeat, with a knowing grin in the voice, punchy emphasis on the twist lines, rising anticipation, then delighted amazement at the reveal. Keep every word crisp and clear, short natural pauses only. Not shouting, not whispering, not rushed";
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

export const generateImage = createServerFn({ method: "POST" })
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
