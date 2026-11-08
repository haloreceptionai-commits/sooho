// Client orchestrator: script → voice + images → render → save. Runs in the background
// while the user moves around the app.
import { actions, flushVideo, getState, type VideoInput } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { seedanceRuns } from "@/lib/seedance";
import { submitSeedance, checkSeedance } from "@/lib/seedance.functions";
import { checkContinuity, factCheck, generateHooks, generateImage, generatePlan, generateVoice, judgeScript, researchStory, type Hook, type Plan } from "@/lib/pipeline.functions";
import { finalScore, hookIssues, hookTextIssues, rankHookTypes, sceneStarts, splitSentences, spokenBy, storyScore, validateStory } from "@/lib/story-v2";
import { renderVideo, type RenderScene, type VoiceChunk } from "@/lib/renderer";
import { clipChunk, pollClip, startClip } from "@/lib/clips.functions";
import { saveVideoFile } from "@/lib/video-db";
import { ARCHETYPES } from "@/lib/viral-brain";
import { topicUnavailable } from "@/lib/topics";

const b64ToBuf = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry only rate limits / transient server errors, with backoff. */
export const STEP_TIMEOUT_MS = 3 * 60_000;
async function withRetry<T>(fn: () => Promise<T>, tries = 4, cap = 16000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      // a call that never answers would freeze the video forever: give up after 6 min and retry
      let t: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("[504] The AI took too long to answer")), STEP_TIMEOUT_MS); });
      try { return await Promise.race([fn(), timeout]); } finally { clearTimeout(t); }
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
const SHOT: Record<string, string> = {
  wide: "WIDE ENVIRONMENT SHOT: the place fills the frame; people, if any, are tiny.",
  aerial: "AERIAL VIEW from high in the sky looking down at the whole place; no faces.",
  action: "ACTION SHOT: hands and bodies doing the physical task, motion and props in focus.",
  macro: "MACRO PROCESS INSERT: extreme close-up of the object or material being worked on; no faces.",
  face: "Expressive close-up of the character reacting.",
};
const COLOR: Record<string, string> = {
  bright: "Sunny bright daylight, clear blue sky, cheerful saturated colors.",
  dark_cold: "Tense mood shown with soft cool blue tones, but bright and airy: overcast daylight or bright moonlight, light sky, no deep shadows.",
  warm_interior: "Bright warm interior with big windows and soft golden light, light walls, cozy and well lit.",
  golden_macro: "Bright glowing golden light on a light background, shallow depth of field.",
  high_contrast: "Bright punchy daylight, vivid colors, crisp white highlights on light blue.",
};
/** Every picture leans to the lighter side (user request). */
const LIGHT = "LIGHTING: bright, light and airy image, high-key exposure, pastel-bright light background, soft shadows, never dark, gloomy or underexposed.";

const ROTATE: Record<string, string> = { wide: "low_angle", aerial: "top_down", close: "over_shoulder", top_down: "wide", macro: "close", pov: "wide", low_angle: "close", over_shoulder: "close" };

/** A scene longer than ~4s would hold one picture too long: split it at a sentence into two shots (new picture, new angle). */
export function splitLongScenes(scenes: Plan["scenes"], maxWords = 11): Plan["scenes"] {
  const out: Plan["scenes"] = [];
  for (const sc of scenes) {
    const parts = splitSentences(sc.narration);
    if (sc.narration.split(/\s+/).length <= maxWords || parts.length < 2) { out.push(sc); continue; }
    const total = sc.narration.split(/\s+/).length;
    let cut = 1, acc = parts[0]!.split(/\s+/).length;
    while (cut < parts.length - 1 && acc + parts[cut]!.split(/\s+/).length <= total / 2 + 3) { acc += parts[cut]!.split(/\s+/).length; cut++; }
    const a = parts.slice(0, cut).join(" "), b = parts.slice(cut).join(" ");
    out.push({ ...sc, narration: a, loop_closed: "" });
    out.push(...splitLongScenes([{ ...sc, narration: b, money: false, loop_opened: "", angle: ROTATE[sc.angle] ?? "close", camera: sc.camera === "push_in" ? "pan_right" : "push_in", image_prompt: `${sc.image_prompt} Next moment, from a different angle, showing: ${b.slice(0, 160)}` }], maxWords));
  }
  return out;
}

const running = new Set<string>();
const removed = new Set<string>();

/** Takes a stuck or unwanted job out of the queue: stops it at its next step and hides it (the record is kept, never deleted). */
export function removeFromQueue(id: string) {
  removed.add(id);
  running.delete(id);
  keepAlive();
  actions.updateVideo(id, { status: "failed", removed: true, detail: "Removed from queue", error: "Removed from queue" });
}

export async function runVideo(id: string, input: VideoInput) {
  if (running.has(id)) return;
  removed.delete(id);
  actions.updateVideo(id, { removed: false });
  running.add(id);
  keepAlive();
  const s = getState().settings;
  const up = (p: Parameters<typeof actions.updateVideo>[1]) => { if (removed.has(id)) throw new Error("Removed from queue"); actions.updateVideo(id, p); };
  try {
    const saved = getState().videos.find(v => v.id === id)?.seedanceCheckpoint;
    if (input.engine === "seedance" && saved) {
      await finishSeedance(id, input, saved, up);
      return;
    }
    up({ status: "running", stage: "script", progress: 3, detail: "Viral Brain is writing the script…", error: undefined });
    const archetype = ARCHETYPES.find((a) => a.id === input.archetype);
    // 1) fact check
    up({ detail: "Fact-checking the story…" });
    const facts = await withRetry(() => factCheck({ data: { topic: input.topic, deployment: s.scriptDeployment } }));
    const factText = [
      ...(input.reference ? [`Inspiration video (${input.reference.url}) transcript — use ONLY as research for the same true topic. Write a brand-new original story: never copy its lines, hook or wording, and verify every claim: "${input.reference.transcript.slice(0, 4000)}"`] : []),
      ...(input.topicSource ? [`Research starting point: ${input.topicSource.fact} — ${input.topicSource.url}. Verify this claim independently; do not treat the title as proof.`] : []),
      ...facts.claims.map((c) => `- ${c.claim} (${c.date}) [${c.confidence}; ${c.sources.join("; ")}]`),
      `Myth: ${facts.myth}`, `Reality: ${facts.reality}`, facts.hedge ? `Hedge line to include: ${facts.hedge}` : "",
    ].join("\n");
    const confidence = facts.claims.length ? facts.claims.filter((c) => c.confidence !== "low").length / facts.claims.length : 0;
    up({ progress: 4, facts: { myth: facts.myth, reality: facts.reality, claims: facts.claims.length, confidence }, detail: "Finding the hero, question and payoff…" });
    // 2) research: anchors, premise, impossible question, payoff, money shot
    const rs = await withRetry(() => researchStory({ data: { topic: input.topic, facts: factText, deployment: s.scriptDeployment } }));
    if (!rs.oneImage.ok) throw new Error("Pick a more visual topic: the odd thing in this story can't be shown in one picture.");
    const researchText = [
      `Anchors: subject "${rs.anchors.subject}", year "${rs.anchors.year}", place "${rs.anchors.place}", org "${rs.anchors.org}", stakes "${rs.anchors.stakes}"`,
      `Premise: ${rs.premise}`, `Main question: ${rs.question}`,
      `Hero: ${rs.hero.name} (${rs.hero.role}) wants: ${rs.hero.want}`, `Skeptic: ${rs.skeptic.name} (${rs.skeptic.role})`, `Threat: ${rs.threat}`,
      `Tries: ${rs.tries.join(" -> ")}`, `Analogy: ${rs.analogy}`, `Proof shot: ${rs.proof}`, `Payoff: ${rs.payoff}`, `Money shot: ${rs.moneyShot}`,
    ].join("\n");
    up({ progress: 6, story: { premise: rs.premise, question: rs.question, hero: `${rs.hero.name} — ${rs.hero.want}`, anchors: Object.values(rs.anchors).join(" · ") }, detail: "Writing 10 hooks…" });
    // 3) hooks: score, drop banned / unanchored ones, prefer types that performed best
    const prefer = rankHookTypes(getState().videos.filter((v) => v.perf && v.analytics).map((v) => ({ hookType: v.analytics!.hookType, ...v.perf })));
    const hooks = await withRetry(() => generateHooks({ data: { topic: input.topic, facts: factText, research: researchText, prefer: prefer.join(", "), deployment: s.scriptDeployment } }));
    const rate = (h: Hook) => h.curiosity * 1.4 + h.clarity + h.visualness * 1.2 + h.speakability
      - hookIssues(h.line, rs.anchors, factText).length * 8 - hookTextIssues(h.text, h.line).length * 4 + (prefer[0] === h.type ? 3 : 0);
    const ranked = [...hooks.all].sort((x, y) => rate(y) - rate(x));
    const hb = ranked[0]!, runner = ranked[1] ?? hb;
    up({ progress: 8, hooks: { best: hb.line, runnerUp: runner.line }, detail: "Writing the beat sheet and script…" });
    // 4) beat sheet + script -> blocking validators + blind judges -> up to 2 repair rewrites (before any images or voice)
    const base = {
      topic: input.topic, format: input.format, durationSec: input.durationSec,
      archetype: archetype ? `${archetype.name} — ${archetype.formula}` : "Best fit", style: input.style, deployment: s.scriptDeployment,
      facts: factText, research: researchText, hook: hb.line,
    };
    const evaluate = async (p: Plan) => {
      const story = {
        scenes: p.scenes.map((x) => ({ beat: x.beat, narration: x.narration, characters: x.characters, shot: x.shot, money: x.money, loop_opened: x.loop_opened, loop_closed: x.loop_closed })),
        anchors: rs.anchors, question: p.question || rs.question, hero: p.hero?.name ? p.hero : rs.hero, cast: p.characters.map((c) => ({ name: c.name, role: c.role })), durationSec: input.durationSec,
      };
      const report = validateStory(story);
      const ht = hookTextIssues(p.hookText, p.scenes[0]?.narration ?? "");
      if (ht.length) report.checks.push({ id: "HOOKTEXT", pass: false, msg: ht.join("; ") }), report.failed.push(report.checks[report.checks.length - 1]!);
      const hi = hookIssues(splitSentences(p.script || p.scenes.map((x) => x.narration).join(" "))[0] ?? "", rs.anchors, factText);
      report.checks.push({ id: "HOOK", pass: !hi.length, msg: hi.length ? `Hook: ${hi.join("; ")}` : "Hook rules met" });
      if (hi.length) report.failed.push(report.checks[report.checks.length - 1]!);
      const full = p.scenes.map((x) => x.narration).join(" ");
      const firstShots = (sec: number) => { const st = sceneStarts(story.scenes); return p.scenes.filter((_, i) => st[i]! < sec).map((x) => `[picture: ${x.image_prompt.slice(0, 200)}]`).join(" "); };
      const judge = await withRetry(() => judgeScript({ data: {
        first3: `${p.hookText ? `On-screen text: "${p.hookText}". ` : ""}Narration: "${spokenBy(story.scenes, 3.2)}" ${firstShots(3.2)}`,
        first15: `Narration: "${spokenBy(story.scenes, 15)}" ${firstShots(15)}`,
        full, truth: `${researchText}\nHook: ${hb.line}`,
        shots: p.scenes.map((x, i) => `${i}: ${x.narration} => ${x.image_prompt.slice(0, 220)}`).join("\n"),
        deployment: s.scriptDeployment,
      } })).catch((e: unknown) => { console.warn("Judges unavailable:", e); return null; });
      if (judge?.filler.length && judge.filler.length > 2) report.failed.push({ id: "V8j", pass: false, msg: `V8 new info (judge): "${judge.filler.slice(0, 2).join('", "')}" add nothing new` });
      const gate = storyScore(report, judge, p.scenes.length);
      return { report, judge, gate };
    };
    let plan = await withRetry(() => generatePlan({ data: base }));
    let ev = await evaluate(plan);
    for (let attempt = 1; attempt <= 2 && !ev.gate.ready; attempt++) {
      up({ progress: 8 + attempt, detail: `Story score ${ev.gate.score}/100 — rewriting to fix ${ev.gate.blockers.length} issue${ev.gate.blockers.length === 1 ? "" : "s"} (try ${attempt}/2)…` });
      const repaired = await withRetry(() => generatePlan({ data: { ...base, repair: `${ev.gate.blockers.map((b) => `- ${b}`).join("\n")}\nPrevious script (keep its good lines, rewrite only what breaks the checks above):\n${plan.scenes.map((x) => `[${x.beat}] ${x.narration}`).join(" ")}` } })).catch(() => null);
      if (!repaired) break;
      const ev2 = await evaluate(repaired);
      if (ev2.gate.score >= ev.gate.score) { plan = repaired; ev = ev2; }
    }
    up({ checks: ev.gate.blockers, judges: ev.judge ? { passA: ev.judge.passA, passB: ev.judge.passB, passC: ev.judge.passC, payoff: ev.judge.payoff, weakest: ev.judge.weakest } : undefined });
    plan = { ...plan, scenes: splitLongScenes(plan.scenes) };
    const n = plan.scenes.length;
    up({ title: plan.title, description: plan.description, sceneCount: n, stage: "voice", progress: 12, detail: `Script ready · story score ${ev.gate.score}/100 · ${n} scenes` });

    const portrait = input.format === "short";
    const scenes: Partial<RenderScene>[] = plan.scenes.map((sc) => ({ text: sc.narration, sfx: sc.sfx, camera: sc.camera, mood: sc.mood, beat: sc.beat }));
    // narration is recorded in chunks of a few scenes so the delivery flows like one take
    const groups: number[][] = [];
    let cur: number[] = []; let wc = 0;
    plan.scenes.forEach((sc, i) => {
      const w = sc.narration.split(/\s+/).filter(Boolean).length;
      // new take when the pace class changes (action / reveal / normal) so each take gets its own rate
      const cls = (b: string) => (["try", "fail", "escalation"].includes(b) ? 1 : ["reveal", "analogy", "proof"].includes(b) ? 2 : 0);
      const brk = cur.length && cls(plan.scenes[cur[0]!]!.beat) !== cls(sc.beat);
      if (cur.length && (brk || wc + w > (portrait ? 60 : 90))) { groups.push(cur); cur = []; wc = 0; }
      cur.push(i); wc += w;
    });
    if (cur.length) groups.push(cur);
    // very short takes make the voice engine misread them, so fold them into a neighbour
    const wcount = (g: number[]) => g.reduce((a, i) => a + plan.scenes[i]!.narration.split(/\s+/).filter(Boolean).length, 0);
    for (let gi = groups.length - 1; gi > 0; gi--) {
      if (wcount(groups[gi]!) < 22 && plan.scenes[groups[gi]![0]!]!.beat !== "reveal") { groups[gi - 1]!.push(...groups[gi]!); groups.splice(gi, 1); }
    }
    if (groups.length > 1 && wcount(groups[0]!) < 22) { groups[1]!.unshift(...groups[0]!); groups.shift(); }
    const voice: VoiceChunk[] = groups.map((g) => ({ scenes: g, audio: new ArrayBuffer(0) }));

    const totalAssets = groups.length + n + 1;
    let done = 0;
    const tick = (what: string) => {
      done++;
      up({ progress: 10 + Math.round((done / totalAssets) * 60), detail: `${what} · ${done}/${totalAssets} assets`, stage: "images" });
    };
    const rawImg: (string | undefined)[] = [];
    const contScores: number[] = [];
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
          // Characters only lead action/face shots; wide, aerial and macro shots show the world, the process or the money shot,
          // and skip the sheet reference (it pulls every frame back to a posed line-up).
          const people = sc.shot === "action" || sc.shot === "face";
          const castAll = sc.characters.map((nm) => looks.get(nm.toLowerCase())).filter(Boolean).map((c) => `${c!.name}: ${c!.look}`).join("; ");
          const cast = people ? castAll : "";
          const shot = [
            SHOT[sc.shot] ?? "", ANGLE[sc.angle] ?? "", sc.money && rs.moneyShot ? `MONEY SHOT: ${rs.moneyShot}.` : "", sc.image_prompt,
            people ? "The characters are mid-action, busy with the task, NOT posing side by side and NOT looking at the camera." : castAll ? `Any people are small in the frame (${castAll.slice(0, 200)}).` : "",
            COLOR[sc.color] ?? "", LIGHT,
          ].filter(Boolean).join(" ");
          let r = await img((cast && sheet ? { cast, reference: sheet } : { cast }), shot).catch((e: unknown) => { if (/\[429\]/.test(String(e))) throw e; return null; });
          if (!r) r = await img({ cast }, shot); // retry without the reference
          // continuity gate: compare the cast to the character sheet; redraw once if it drifted
          if (r.image && sheet && cast) {
            const c = await withRetry(() => checkContinuity({ data: { sheet, shot: r!.image!, cast, deployment: s.scriptDeployment } })).catch(() => null);
            if (c) contScores.push(c.score);
            if (c && c.score < 6) {
              const again = await img({ cast, reference: sheet }, `${shot} The characters must match the reference sheet exactly (${c.issue.slice(0, 160)}).`).catch(() => null);
              if (again?.image) {
                const c2 = await withRetry(() => checkContinuity({ data: { sheet, shot: again.image!, cast, deployment: s.scriptDeployment } })).catch(() => null);
                if (!c2 || c2.score >= c.score) { r = again; if (c2) contScores[contScores.length - 1] = c2.score; }
              }
            }
          }
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

    if (input.engine === "seedance") {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const root = `${user.user.id}/${id}/assets`;
      const bucket = supabase.storage.from("videos");
      const imagePaths: string[] = [], voicePaths: { path: string; scenes: number[] }[] = [];
      up({ progress: 70, detail: "Saving scene inputs for safe resume…" });
      for (let i = 0; i < scenes.length; i++) {
        const raw = rawImg[i];
        if (!raw) throw new Error(`Scene ${i + 1} has no image for Seedance animation`);
        const path = `${root}/image-${i}.jpg`;
        const { error } = await bucket.upload(path, b64ToBuf(raw), { contentType: "image/jpeg", upsert: true });
        if (error) throw new Error(error.message);
        imagePaths.push(path);
      }
      for (let i = 0; i < voice.length; i++) {
        const chunk = voice[i];
        if (!chunk) continue;
        const path = `${root}/voice-${i}`;
        const { error } = await bucket.upload(path, chunk.audio, { contentType: "audio/wav", upsert: true });
        if (error) throw new Error(error.message);
        voicePaths.push({ path, scenes: chunk.scenes });
      }
      const checkpoint: SeedanceCheckpoint = { plan, gate: ev.gate, report: { revealSec: ev.report.revealSec, shotMix: ev.report.shotMix }, hookType: hb.type, continuity: contScores.length ? contScores.filter(x => x >= 6).length / contScores.length : 1, images: imagePaths, voice: voicePaths };
      up({ seedanceCheckpoint: checkpoint });
      await flushVideo(id);
      await finishSeedance(id, input, checkpoint, up);
      return;
    }

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
      let made = 0, failed = 0, lastClipErr = "";
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
            if (st.status === "completed") {
              const parts: ArrayBuffer[] = [];
              let off = 0, total = 1;
              while (off < total) {
                const c = await withRetry(() => clipChunk({ data: { id: jobId, offset: off } }), 4);
                const buf = b64ToBuf(c.data);
                if (!buf.byteLength) break;
                parts.push(buf); off += buf.byteLength; total = c.total || off;
              }
              const v = document.createElement("video");
              v.muted = true; v.playsInline = true; v.preload = "auto";
              v.src = URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));
              await new Promise<void>((ok, bad) => {
                const to = setTimeout(() => bad(new Error("Clip took too long to load")), 30000);
                v.onloadeddata = () => { clearTimeout(to); ok(); };
                v.onerror = () => { clearTimeout(to); bad(new Error("Clip could not load")); };
              });
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
          failed++; lastClipErr = m; // this run falls back to animated stills
          console.warn("Gemini Omni clip fell back to stills:", m);
        }
      });
      if (!made) throw new Error(`Gemini Omni could not animate any clip for this video (${lastClipErr || "unknown error"}). Try again or switch to Own model.`);
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
    const fin = finalScore(ev.gate, { wordsPerSec: out.stats.wordsPerSec, avgShotSec: out.stats.avgShotSec, lufs: out.stats.lufs, lra: out.stats.lra, width, height, captions: s.burnCaptions });
    const qa = { score: fin.score, parts: fin.parts };
    const continuity = contScores.length ? contScores.filter((x) => x >= 6).length / contScores.length : 1;
    up({
      ready: fin.ready, analytics: { hookType: hb.type, revealSec: ev.report.revealSec, castSize: plan.characters.length, shotMix: ev.report.shotMix, continuity },
    });
    up({ qa, status: "done", stage: "done", progress: 100, detail: "Ready", duration: out.duration, mime: out.mime, size: out.blob.size });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (/PROHIBITED_CONTENT/.test(msg)) msg = "The narrator voice refused part of this script (it reads as too violent). Try a gentler topic wording and generate again.";
    if (!removed.has(id)) up({ status: "failed", error: msg, detail: "Failed" });
  } finally {
    running.delete(id);
    keepAlive();
  }
}

export interface SeedanceCheckpoint {
  plan: Plan;
  gate: Parameters<typeof finalScore>[0];
  report: { revealSec: number; shotMix: Record<string, number> };
  hookType: string;
  continuity: number;
  images: string[];
  voice: { path: string; scenes: number[] }[];
}

async function finishSeedance(id: string, input: VideoInput, cp: SeedanceCheckpoint, up: (p: Parameters<typeof actions.updateVideo>[1]) => void) {
  const bucket = supabase.storage.from("videos");
  const download = async (path: string) => {
    const { data, error } = await bucket.download(path);
    if (error || !data) throw new Error(`Saved scene could not load: ${error?.message ?? path}`);
    return data;
  };
  up({ status: "running", stage: "images", progress: 70, detail: "Continuing Seedance animation from saved scenes…", error: undefined });
  const scenes: RenderScene[] = await Promise.all(cp.plan.scenes.map(async (sc, i) => {
    const path = cp.images[i];
    if (!path) throw new Error("Saved scene is missing");
    return { image: await createImageBitmap(await download(path)), text: sc.narration, sfx: sc.sfx, camera: sc.camera, mood: sc.mood, beat: sc.beat };
  }));
  const voice = await Promise.all(cp.voice.map(async c => ({ scenes: c.scenes, audio: await (await download(c.path)).arrayBuffer() })));
  const runs = seedanceRuns(cp.plan.scenes);
  const clips: { scenes: number[]; video: HTMLVideoElement }[] = [];
  try {
    // Sequential submission respects the shared video concurrency budget. A saved ID is never resubmitted.
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (!run) continue;
      up({ detail: `Seedance clip ${i + 1}/${runs.length} · submitting or resuming…` });
      const imagePath = cp.images[run.scenes[0] ?? 0];
      if (!imagePath) throw new Error("Starting image is missing");
      const blob = await download(imagePath);
      const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
      // No create retry: an ambiguous network failure must not spend credits on another job.
      const job = await submitSeedance({ data: { videoId: id, index: i, image, prompt: run.prompt, seconds: run.seconds, portrait: input.format === "short" } });
      const previous = getState().videos.find(v => v.id === id)?.seedanceClips ?? {};
      up({ seedanceClips: { ...previous, [i]: { ...previous[i], id: job.id } } });
      await flushVideo(id);
      let path: string | undefined;
      while (!path) {
        up({ detail: `Seedance clip ${i + 1}/${runs.length} · waiting for animation…` });
        await sleep(8000);
        if (removed.has(id)) throw new Error("Removed from queue");
        const st = await checkSeedance({ data: { videoId: id, index: i } });
        if (st.status === "failed") throw new Error(st.error ?? "Seedance clip failed");
        if (st.status === "completed") {
          if (!st.path) throw new Error("Seedance clip has not been saved");
          path = st.path;
        }
        up({ progress: 70 + Math.round((i + (st.progress / 100)) / runs.length * 2) });
      }
      const current = getState().videos.find(v => v.id === id)?.seedanceClips ?? {};
      up({ seedanceClips: { ...current, [i]: { id: job.id, path } } });
      await flushVideo(id);
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.src = URL.createObjectURL(await download(path));
      await new Promise<void>((resolve, reject) => { v.onloadeddata = () => resolve(); v.onerror = () => reject(new Error("Seedance clip could not play")); });
      clips.push({ scenes: run.scenes, video: v });
    }
    const settings = getState().settings, portrait = input.format === "short";
    up({ stage: "render", progress: 72, detail: "Assembling Seedance video — keep this tab open…", thumb: scenes[0] ? thumbnail(scenes[0].image) : undefined });
    const out = await renderVideo(scenes, voice, { width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080, captions: settings.burnCaptions, sfx: settings.soundEffects, hookText: cp.plan.hookText, clips, onProgress: p => up({ progress: 72 + Math.round(p * 0.26) }) });
    up({ stage: "saving", progress: 99, detail: "Saving…" });
    await saveVideoFile(id, out.blob);
    const fin = finalScore(cp.gate, { ...out.stats, width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080, captions: settings.burnCaptions });
    up({ qa: { score: fin.score, parts: fin.parts }, ready: fin.ready, analytics: { hookType: cp.hookType, revealSec: cp.report.revealSec, castSize: cp.plan.characters.length, shotMix: cp.report.shotMix, continuity: cp.continuity }, status: "done", stage: "done", progress: 100, detail: "Ready", duration: out.duration, mime: out.mime, size: out.blob.size });
  } finally {
    for (const c of clips) { c.video.pause(); URL.revokeObjectURL(c.video.src); }
    for (const sc of scenes) sc.image.close();
  }
}

// ---- Background safety: warn before closing, keep the screen awake, auto-resume.
let wake: { release: () => Promise<void> } | null = null;
function keepAlive() {
  if (typeof window === "undefined") return;
  if (running.size > 0) {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!wake && nav.wakeLock && document.visibilityState === "visible") void nav.wakeLock.request("screen").then((w) => { wake = w; }).catch(() => undefined);
  } else {
    void wake?.release().catch(() => undefined); wake = null;
  }
}

/** Restarts videos that were cut off because the page was closed or reloaded mid-generation. */
export function resumeInterrupted() {
  // Disabled: auto-restarting on reload trapped videos in a 3% loop. Interrupted videos stay failed with a manual retry.
}

export function startVideo(input: VideoInput) {
  const used = getState().videos.map((v) => ({ topic: v.input.topic, topicId: v.input.topicId, status: v.status }));
  if (topicUnavailable(input.topic, input.topicId, used)) throw new Error("This topic already has a video or is being made. Pick a new topic.");
  const id = actions.addVideo(input);
  void runVideo(id, input);
  return id;
}
