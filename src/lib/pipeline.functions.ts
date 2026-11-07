import { createServerFn } from "@tanstack/react-start";

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

// ---------------- Script / plan ----------------

export interface PlanInput {
  topic: string;
  format: "long" | "short";
  durationSec: number;
  archetype: string;
  style: string;
  deployment: string;
}
export interface PlanScene { beat: string; narration: string; image_prompt: string; sfx: string }
export interface Plan { title: string; description: string; scenes: PlanScene[] }

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "scenes"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["beat", "narration", "image_prompt", "sfx"],
        properties: {
          beat: { type: "string", enum: ["hook", "stakes", "defeat", "countdown", "climax", "payoff"] },
          narration: { type: "string" },
          image_prompt: { type: "string" },
          sfx: { type: "string", enum: ["none", "whoosh", "boom", "snap", "splash", "thunder", "creak", "coin", "fire", "heartbeat", "crowd"] },
        },
      },
    },
  },
};

export const generatePlan = createServerFn({ method: "POST" })
  .inputValidator((d: PlanInput) => {
    if (!d.topic?.trim() || d.topic.length > 300) throw new Error("Topic is required (max 300 chars)");
    return { ...d, durationSec: Math.max(20, Math.min(1200, Math.round(d.durationSec))) };
  })
  .handler(async ({ data }): Promise<Plan> => {
    const short = data.format === "short";
    const wpm = short ? 205 : 150;
    const words = Math.round((data.durationSec / 60) * wpm);
    const scenes = short ? Math.max(8, Math.round(data.durationSec / 5)) : Math.max(12, Math.round(data.durationSec / 18));
    const system = `You are the head writer of a history & facts YouTube channel whose Shorts average 7.8M views (style of RicksClips3000).
Write narration that follows this exact viral formula:
1. HOOK at 0:00 — in media res, UNDER 12 words, zero greetings or fluff, immediate sensory action.
2. STAKES & RIVAL FOIL — who opposes the protagonist / the conventional method.
3. FALSE DEFEAT & PUBLIC DOUBT — the conventional way looks like it won; people mock the odd choice.
4. HIDDEN COUNTDOWN / ENVIRONMENTAL SHIFT — heat, pressure, a storm, time running out.
5. CATASTROPHIC VISUAL CLIMAX — the rival method fails violently and visually.
6. PAYOFF — one short final line that loops back to the hook.
Rules: short punchy sentences, concrete nouns and impact verbs, present-tense tension, historically accurate facts, no "in this video", no calls to subscribe.
Each scene = one still image the editor will animate with slow zoom/pan. image_prompt: a detailed visual description of that single frame (subject, setting, era, lighting, camera angle), in the visual style "${data.style}", no text or letters in the image.
sfx: the single best sound effect for that scene, or "none".`;
    const user = `Format: ${short ? "YouTube Short / Reel, vertical 9:16" : "long-form YouTube documentary, 16:9"}.
Topic: ${data.topic}
Viral archetype: ${data.archetype}
Target length: ${data.durationSec} seconds ≈ ${words} words of narration total (${short ? "195–215 words for 60s" : "~150 wpm"}).
Split into about ${scenes} scenes, spread across the beats in order. Return a click-worthy title (under 60 chars) and a 2-sentence YouTube description.`;

    const res = await azure(`${safeName(data.deployment)}/chat/completions`, {
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_completion_tokens: 32000,
      reasoning_effort: "low",
      response_format: { type: "json_schema", json_schema: { name: "video_plan", strict: true, schema: planSchema } },
    });
    if (!res.ok) await fail(res, "Script writer");
    const json = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string | null } }[] };
    const msg = json.choices?.[0]?.message;
    if (msg?.refusal) throw new Error(`Script writer refused: ${msg.refusal}`);
    try {
      const plan = JSON.parse(msg?.content ?? "") as Plan;
      if (!plan.scenes?.length) throw new Error("empty");
      return plan;
    } catch {
      throw new Error("Script writer returned an unreadable plan");
    }
  });

// ---------------- Voice ----------------

export interface VoiceInput { text: string; voice: string; deployment: string; style: string }

const VOICES = new Set(["onyx", "ash", "echo", "ballad", "verse", "cedar"]);
const GEMINI_VOICE: Record<string, string> = { onyx: "Charon", ash: "Algenib", echo: "Orus", ballad: "Rasalgethi", verse: "Fenrir", cedar: "Alnilam" };

export const generateVoice = createServerFn({ method: "POST" })
  .inputValidator((d: VoiceInput) => {
    if (!d.text?.trim() || d.text.length > 4000) throw new Error("Narration text must be 1–4000 characters");
    if (!VOICES.has(d.voice)) throw new Error("Unknown voice");
    return d;
  })
  .handler(async ({ data }): Promise<{ audio: string; engine: "azure" | "lovable" }> => {
    const instructions = `${data.style} Deliberate cadence, suspenseful micro-pauses before reveals, punch single-syllable impact words, documentary storyteller, never rushed.`;
    // 1) Azure speech deployment (if the user has one)
    if (data.deployment) {
      const res = await azure(`${safeName(data.deployment)}/audio/speech`, {
        model: data.deployment, input: data.text, voice: data.voice, instructions, response_format: "mp3",
      });
      if (res.ok) return { audio: toBase64(await res.arrayBuffer()), engine: "azure" };
      const t = await res.text();
      const unsupported = res.status === 404 || (res.status === 400 && /OperationNotSupported|DeploymentNotFound/i.test(t));
      if (!unsupported) {
        console.error(`Azure voice failed [${res.status}]: ${t.slice(0, 300)}`);
        throw new Error(`[${res.status}] Azure voice failed`);
      }
    }
    // 2) Fallback: Lovable AI speech (Gemini TTS) with the closest male narrator voice
    const k = keys();
    const res = await fetch(`${LOVABLE_AI}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${k.lovable}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: `Narrate as a deep-voiced documentary storyteller. ${instructions}\n\n${data.text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE[data.voice] ?? "Charon" } } } },
        stream_format: "audio",
      }),
    });
    if (!res.ok) await fail(res, "Voice");
    return { audio: toBase64(await res.arrayBuffer()), engine: "lovable" };
  });

// ---------------- Images ----------------

export interface ImageInput { prompt: string; aspect: "portrait" | "landscape"; deployment: string; quality: "low" | "medium" }

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: ImageInput) => {
    if (!d.prompt?.trim() || d.prompt.length > 3000) throw new Error("Image prompt must be 1–3000 characters");
    return d;
  })
  .handler(async ({ data }): Promise<{ image: string }> => {
    const res = await azure(`${safeName(data.deployment)}/images/generations`, {
      prompt: `${data.prompt}. Cinematic, highly detailed, dramatic lighting. Absolutely no text, letters, captions or watermarks.`,
      size: data.aspect === "portrait" ? "1024x1536" : "1536x1024",
      quality: data.quality,
      output_format: "jpeg",
      output_compression: 80,
      n: 1,
    });
    if (!res.ok) await fail(res, "Image generator");
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generator returned no image");
    return { image: b64 };
  });
