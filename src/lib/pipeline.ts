// Client orchestrator: script → voice + images → render → save. Runs in the background
// while the user moves around the app.
import { actions, getState, type VideoInput } from "@/lib/store";
import { checkContinuity, factCheck, generateHooks, generateImage, generatePlan, generateVoice, judgeScript, researchStory, type Hook, type Plan } from "@/lib/pipeline.functions";
import { finalScore, hookIssues, hookTextIssues, rankHookTypes, sceneStarts, splitSentences, spokenBy, storyScore, validateStory } from "@/lib/story-v2";
import { renderVideo, type RenderScene, type VoiceChunk } from "@/lib/renderer";
import { clipChunk, pollClip, startClip } from "@/lib/clips.functions";
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
const SHOT: Record<string, string> = {
  wide: "WIDE ENVIRONMENT SHOT: the place fills the frame; people, if any, are tiny.",
  aerial: "AERIAL VIEW from high in the sky looking down at the whole place; no faces.",
  action: "ACTION SHOT: hands and bodies doing the physical task, motion and props in focus.",
  macro: "MACRO PROCESS INSERT: extreme close-up of the object or material being worked on; no faces.",
  face: "Expressive close-up of the character reacting.",
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
            COLOR[sc.color] ?? "",
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
