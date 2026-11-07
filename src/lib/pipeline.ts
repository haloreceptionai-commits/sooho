// Client orchestrator: script → voice + images → render → save. Runs in the background
// while the user moves around the app.
import { actions, getState, type VideoInput } from "@/lib/store";
import { factCheck, generateHooks, generateImage, generatePlan, generateVoice } from "@/lib/pipeline.functions";
import { qaScore, validateScript } from "@/lib/quality";
import { renderVideo, type RenderScene, type VoiceChunk } from "@/lib/renderer";
import { pollClip, startClip } from "@/lib/clips.functions";
import { saveVideoFile } from "@/lib/video-db";
import { ARCHETYPES } from "@/lib/viral-brain";

const b64ToBuf = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry only rate limits / transient server errors, with backoff. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4, cap = 16000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const m = e instanceof Error ? e.message : String(e);
      if (!/\[(429|5\d\d)\]/.test(m) || i === tries - 1) throw e;
      await sleep(Math.min(cap, 2000 * 2 ** i) + Math.random() * 1500);
    }
  }
  throw last;
}

async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]!, i);
    }
  }));
}

function thumbnail(img: ImageBitmap) {
  const c = document.createElement("canvas");
  const w = 360; c.width = w; c.height = Math.round((img.height / img.width) * w);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

const ANGLE: Record<string, string> = {
  wide: "Wide establishing shot:", close: "Close-up:", aerial: "High aerial drone shot:", top_down: "Straight top-down shot:",
  macro: "Extreme macro close-up:", pov: "First-person POV shot:", low_angle: "Dramatic low-angle shot:", over_shoulder: "Over-the-shoulder shot:",
};
const COLOR: Record<string, string> = {
  bright: "Sunny bright daylight, clear blue sky, cheerful saturated colors.",
  dark_cold: "Dark stormy navy-blue palette, cold moonlit highlights, still clearly lit and readable.",
  warm_interior: "Warm orange interior lantern light, cozy amber tones.",
  golden_macro: "Glowing golden amber light, shallow depth of field.",
  high_contrast: "High-contrast dramatic lighting, crisp white foam against deep blue.",
};

const running = new Set<string>();

export async function runVideo(id: string, input: VideoInput) {
  if (running.has(id)) return;
  running.add(id);
  const s = getState().settings;
  const up = (p: Parameters<typeof actions.updateVideo>[1]) => actions.updateVideo(id, p);
  try {
    up({ status: "running", stage: "script", progress: 3, detail: "Viral Brain is writing the script…", error: undefined });
    const archetype = ARCHETYPES.find((a) => a.id === input.archetype);
    // 1) fact check
    up({ detail: "Fact-checking the story…" });
    const facts = await withRetry(() => factCheck({ data: { topic: input.topic, deployment: s.scriptDeployment } }));
    const factText = [
      ...facts.claims.map((c) => `- ${c.claim} [${c.confidence}; ${c.sources.join("; ")}]`),
      `Myth: ${facts.myth}`, `Reality: ${facts.reality}`, facts.hedge ? `Hedge line to include: ${facts.hedge}` : "",
    ].join("\n");
    const confidence = facts.claims.length ? facts.claims.filter((c) => c.confidence !== "low").length / facts.claims.length : 0;
    up({ progress: 5, facts: { myth: facts.myth, reality: facts.reality, claims: facts.claims.length, confidence }, detail: "Writing 10 hooks…" });
    // 2) hooks
    const hooks = await withRetry(() => generateHooks({ data: { topic: input.topic, facts: factText, deployment: s.scriptDeployment } }));
    const hb = hooks.best;
    const hookScore = hb.curiosity + hb.clarity + hb.visualness + hb.speakability;
    up({ progress: 7, hooks: { best: hb.line, runnerUp: hooks.runnerUp.line }, detail: "Viral Brain is writing the beat sheet and script…" });
    // 3) beat sheet + script, checked, rewritten once if it fails
    const base = {
      topic: input.topic, format: input.format, durationSec: input.durationSec,
      archetype: archetype ? `${archetype.name} — ${archetype.formula}` : "Best fit", style: input.style, deployment: s.scriptDeployment,
      facts: factText, hook: hb.line,
    };
    let plan = await withRetry(() => generatePlan({ data: base }));
    let check = validateScript(plan.scenes, plan.loopLine, input.durationSec);
    if (!check.ok) {
      up({ detail: `Script checker: fixing ${check.issues.length} issue${check.issues.length === 1 ? "" : "s"}…` });
      const repaired = await withRetry(() => generatePlan({ data: { ...base, repair: check.issues.join("; ") } })).catch(() => null);
      if (repaired) {
        const c2 = validateScript(repaired.scenes, repaired.loopLine, input.durationSec);
        if (c2.issues.length <= check.issues.length) { plan = repaired; check = c2; }
      }
    }
    up({ checks: check.issues });
    const n = plan.scenes.length;
    up({ title: plan.title, description: plan.description, sceneCount: n, stage: "voice", progress: 10, detail: `Script ready · ${n} scenes` });

    const portrait = input.format === "short";
    const scenes: Partial<RenderScene>[] = plan.scenes.map((sc) => ({ text: sc.narration, sfx: sc.sfx, camera: sc.camera, mood: sc.mood, beat: sc.beat }));
    // narration is recorded in chunks of a few scenes so the delivery flows like one take
    const groups: number[][] = [];
    let cur: number[] = []; let wc = 0;
    plan.scenes.forEach((sc, i) => {
      const w = sc.narration.split(/\s+/).filter(Boolean).length;
      // new take when the pace class changes (action / reveal / normal) so each take gets its own rate
      const cls = (b: string) => (["countdown", "climax", "defeat"].includes(b) ? 1 : ["reveal", "proof"].includes(b) ? 2 : 0);
      const brk = cur.length && cls(plan.scenes[cur[0]!]!.beat) !== cls(sc.beat);
      if (cur.length && (brk || wc + w > (portrait ? 60 : 90))) { groups.push(cur); cur = []; wc = 0; }
      cur.push(i); wc += w;
    });
    if (cur.length) groups.push(cur);
    const voice: VoiceChunk[] = groups.map((g) => ({ scenes: g, audio: new ArrayBuffer(0) }));

    const totalAssets = groups.length + n + 1;
    let done = 0;
    const tick = (what: string) => {
      done++;
      up({ progress: 10 + Math.round((done / totalAssets) * 60), detail: `${what} · ${done}/${totalAssets} assets`, stage: "images" });
    };
    const rawImg: (string | undefined)[] = [];
    const looks = new Map(plan.characters.map((c) => [c.name.toLowerCase(), c]));
    const img = (extra: Partial<Parameters<typeof generateImage>[0]["data"]>, prompt: string) =>
      withRetry(() => generateImage({ data: { prompt, aspect: portrait ? "portrait" : "landscape", deployment: s.imageDeployment, quality: s.imageQuality, style: input.style, palette: plan.palette, ...extra } }), 9, 30000);

    await Promise.all([
      pool(groups, 3, async (g, gi) => {
        const text = g.map((i) => plan.scenes[i]!.narration.trim()).join(" ");
        const r = await withRetry(() => generateVoice({ data: { text, voice: input.voice, deployment: s.ttsDeployment, style: portrait ? "short" : "long" } }));
        voice[gi]!.audio = b64ToBuf(r.audio);
        tick("Recording narration");
      }),
      (async () => {
        // 1) character sheet keeps the cast identical in every shot
        let sheet: string | undefined;
        if (plan.characters.length) {
          try {
            const r = await img({ sheet: true }, plan.characters.map((c) => `${c.name}: ${c.look}`).join("; "));
            sheet = r.image ?? undefined;
          } catch { /* continue without reference */ }
        }
        tick("Designing characters");
        await pool(plan.scenes, 2, async (sc, i) => {
          const cast = sc.characters.map((nm) => looks.get(nm.toLowerCase())).filter(Boolean).map((c) => `${c!.name}: ${c!.look}`).join("; ");
          const shot = `${ANGLE[sc.angle] ?? ""} ${sc.image_prompt} ${COLOR[sc.color] ?? ""}`.trim();
          let r = await img((cast && sheet ? { cast, reference: sheet } : { cast }), shot).catch((e: unknown) => { if (/\[429\]/.test(String(e))) throw e; return null; });
          if (!r) r = await img({ cast }, shot); // retry without the reference
          if (r.image) rawImg[i] = r.image;
          if (r.image) scenes[i]!.image = await createImageBitmap(new Blob([b64ToBuf(r.image)], { type: "image/jpeg" }));
          tick("Painting scenes");
        });
      })(),
    ]);

    // scenes whose image was blocked by the safety filter reuse the nearest image
    const firstImg = scenes.find((x) => x.image)?.image;
    if (!firstImg) throw new Error("Azure's safety filter blocked every scene image for this topic. Try rephrasing the topic.");
    let lastImg = firstImg;
    for (const sc of scenes) { if (sc.image) lastImg = sc.image; else sc.image = lastImg; }
    const full = scenes as RenderScene[];

    // Gemini Omni engine: animate runs of scenes (~8s each) starting from their scene image.
    let clips: { scenes: number[]; video: HTMLVideoElement }[] | undefined;
    if (input.engine === "omni") {
      const runs: number[][] = []; let run: number[] = []; let sec = 0;
      plan.scenes.forEach((sc, i) => {
        const d = (sc.narration.split(/\s+/).filter(Boolean).length * 60) / 153;
        if (run.length && (sec + d > 8 || !rawImg[run[0]!])) { runs.push(run); run = []; sec = 0; }
        run.push(i); sec += d;
      });
      if (run.length) runs.push(run);
      const est = runs.map((r) => r.reduce((a, i) => a + (plan.scenes[i]!.narration.split(/\s+/).filter(Boolean).length * 60) / 153, 0));
      clips = [];
      let made = 0, failed = 0;
      up({ stage: "images", progress: 70, detail: `Animating ${runs.length} AI video clips with Gemini Omni…` });
      await pool(runs, 2, async (r, ri) => {
        const start = rawImg[r[0]!];
        if (!start) { failed++; return; }
        const action = r.map((i) => plan.scenes[i]!.image_prompt).join(" Then: ");
        const prompt = `Animate this exact frame as a ${input.style} scene in a single continuous shot with lively character acting, expressive faces and constant dynamic camera motion. Keep the characters exactly as they look. Action: ${action}. Consider micro-detail, expression and timing. No dialogue, no speech, no music, no on-screen text. Ambient sound only.`;
        try {
          const { id: jobId } = await withRetry(() => startClip({ data: { prompt: prompt.slice(0, 3400), image: start, aspect: portrait ? "portrait" : "landscape", seconds: Math.ceil(est[ri]!) } }), 6, 30000);
          const t = Date.now();
          while (Date.now() - t < 12 * 60_000) {
            await sleep(8000);
            const st = await withRetry(() => pollClip({ data: { id: jobId } }), 4);
            if (st.status === "failed") throw new Error(st.error ?? "AI clip failed");
            if (st.video) {
              const v = document.createElement("video");
              v.muted = true; v.playsInline = true; v.preload = "auto";
              v.src = URL.createObjectURL(new Blob([b64ToBuf(st.video)], { type: "video/mp4" }));
              await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error("Clip could not load")); });
              clips!.push({ scenes: r, video: v });
              made++;
              up({ progress: 70 + Math.round((made / runs.length) * 2), detail: `AI video clips · ${made}/${runs.length}` });
              return;
            }
          }
          throw new Error("AI clip timed out");
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          if (/\[(402|403)\]/.test(m)) throw e; // credits / access problems stop the whole video
          failed++; // this run falls back to animated stills
        }
      });
      if (!made) throw new Error("Gemini Omni could not animate any clip for this video. Try again or switch to Own model.");
    }
    up({ stage: "render", progress: 72, detail: "Assembling video (renders in real time — keep this tab open)…", thumb: thumbnail(full[0]!.image) });
    const out = await renderVideo(full, voice, {
      width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080,
      captions: s.burnCaptions, sfx: s.soundEffects, targetSec: input.durationSec, hookText: plan.hookText, ...(clips ? { clips } : {}),
      onProgress: (p) => up({ progress: 72 + Math.round(p * 0.26) }),
    });
    up({ stage: "saving", progress: 99, detail: "Saving…" });
    await saveVideoFile(id, out.blob);
    const width = portrait ? 1080 : 1920, height = portrait ? 1920 : 1080;
    const qa = qaScore({
      hookScore, revealPos: check.revealPos, factConfidence: confidence, wordsPerSec: out.stats.wordsPerSec, avgShotSec: out.stats.avgShotSec,
      captions: s.burnCaptions, lufs: out.stats.lufs, lra: out.stats.lra, loopLine: !!plan.loopLine.trim(), width, height,
    });
    up({ qa, status: "done", stage: "done", progress: 100, detail: "Ready", duration: out.duration, mime: out.mime, size: out.blob.size });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (/PROHIBITED_CONTENT/.test(msg)) msg = "The narrator voice refused part of this script (it reads as too violent). Try a gentler topic wording and generate again.";
    up({ status: "failed", error: msg, detail: "Failed" });
  } finally {
    running.delete(id);
  }
}

export function startVideo(input: VideoInput) {
  const id = actions.addVideo(input);
  void runVideo(id, input);
  return id;
}
