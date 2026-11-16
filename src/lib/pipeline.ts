import { advancedOpeningIssues } from './advanced-story';
// Client orchestrator: script → voice + images → render → save. Runs in the background
// while the user moves around the app.
import { actions, flushVideo, getState, setVideoActive, type VideoInput } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { checkContinuity, designAdvancedCards, paintAdvancedCard, polishKidScript, directCartoon, factCheck, generateHooks, generateImage, generatePlan, generateVoice, judgeScript, researchStory, type Hook, type Plan } from "@/lib/pipeline.functions";
import { submitCartoon, resumeApprovedCartoon } from '@/lib/cartoon.functions';
import { canResumeApprovedCartoon } from './cartoon-resume';
import { cartoonStart, sanitizeDirection } from '@/lib/cartoon-job';
import { groupTakes, joinWavs } from './wav';
import { composeInkCard, pickInkCards, type InkCard } from "@/lib/ink-card";
import { planInkBeats, planInkCards } from "@/lib/ink.functions";
import { splitInkBeats } from "@/lib/ink-beats";
import { INK_HERO } from "@/lib/styles";
import { finalScore, hookIssues, hookTextIssues, MICRO_SEC, rankHookTypes, sceneStarts, speakable, spellNumbers, splitSentences, spokenBy, storyScore, validateStory } from "@/lib/story-v2";
import { wordBudget } from "@/lib/plain-words";
import { renderVideo, type RenderScene, type VoiceChunk } from "@/lib/renderer";
import { saveVideoFile } from "@/lib/video-db";
import { ARCHETYPES } from "@/lib/viral-brain";
import { topicUnavailable } from "@/lib/topics";
import { submitHostedRender, cancelHostedRender } from "@/lib/hosted-render.functions";
import { shortsWriterEnabled, shortsWriterStep } from '@/lib/shorts-writer/shorts-writer.functions';
import { writerCalls } from '@/lib/shorts-writer/calls';
import { runShortsV4 } from '@/lib/shorts-writer/stage';
import { autoFixPlan, eligibleHooks, preferRepair, preferAdvancedRepair, repairBrief } from '@/lib/script-repair';
import { backgroundGenerationEnabled, startBackgroundGeneration, cancelBackgroundGeneration } from './generation.functions';

import { assertVideoEngine, usesCartoonWorker } from "./video-engines";
import { ensureAnimalCast, paintAdvancedCards, placeObjectCards } from "@/lib/advanced-cards";

const b64ToBuf = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry only rate limits / transient server errors, with backoff. */
export const STEP_TIMEOUT_MS = 3 * 60_000;
async function withRetry<T>(fn: () => Promise<T>, tries = 4, cap = 16000, timeoutMs = STEP_TIMEOUT_MS): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      // A timeout does not cancel a paid call: never submit it again automatically.
      let t: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("The AI response is unconfirmed. Saved work is safe; do not restart this paid step automatically.")), timeoutMs); });
      try { return await Promise.race([fn(), timeout]); } finally { clearTimeout(t); }
    } catch (e) {
      last = e;
      const m = e instanceof Error ? e.message : String(e);
      if (!/^\[429\]/.test(m) || i === tries - 1) throw e;
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
  void cancelHostedRender({ data: { videoId: id } }).catch(e => console.error("Could not stop hosted assembly", e));
  void cancelBackgroundGeneration({ data: { videoId: id } }).catch(e => console.error('Could not stop background generation', e));
}

export async function runVideo(id: string, input: VideoInput) {
  if (running.has(id)) return;
  try { assertVideoEngine(input.engine); } catch (e) {
    actions.updateVideo(id, { status: "failed", detail: "Video model removed", error: e instanceof Error ? e.message : "Video model removed" });
    return;
  }
  const prior = getState().videos.find(v => v.id === id);
  if (prior?.generationJob) return;
  if (!prior?.scriptCheckpoint && !prior?.cartoonCheckpoint && !prior?.assemblyCheckpoint && !prior?.seedanceCheckpoint) {
    try {
      const rollout = await backgroundGenerationEnabled();
      if (rollout.enabled) {
        await flushVideo(id);
        const job = await startBackgroundGeneration({ data: { videoId: id, settings: getState().settings } });
        actions.updateVideo(id, { generationJob: { id: job.id, status: 'queued' }, detail: 'Background generation · safe to close your browser' });
        return;
      }
    } catch (e) {
      actions.updateVideo(id, { status: 'failed', error: e instanceof Error ? e.message : 'Start could not be confirmed', detail: 'Start unconfirmed · check saved progress before retrying' });
      return;
    }
  }
  // Owner's explicit Resume: a failed/cancelled cartoon run restarts from its saved voice + direction (no new script or voice spend).
  if (usesCartoonWorker(input.engine) && canResumeApprovedCartoon(prior?.hostedRender?.status ?? '', prior?.cartoonReview)) {
    try { await resumeApprovedCartoon({ data: { videoId: id } }); }
    catch (e) { actions.updateVideo(id, { error: e instanceof Error ? e.message : 'Could not resume approved render' }); }
    return;
  }
  const resumable = !!prior?.cartoonCheckpoint && ['failed', 'cancelled'].includes(prior.hostedRender?.status ?? '');
  if (prior?.hostedRender && !resumable) return;
  if (resumable) actions.updateVideo(id, { hostedRender: undefined, status: 'running', error: undefined, detail: 'Resuming saved cartoon…' });
  removed.delete(id);
  actions.updateVideo(id, { removed: false });
  running.add(id);
  setVideoActive(id, true);
  keepAlive();
  const s = getState().settings;
  const up = (p: Parameters<typeof actions.updateVideo>[1]) => { if (removed.has(id)) throw new Error("Removed from queue"); actions.updateVideo(id, p); };
  const advanced = input.engine === 'advanced';
  try {
    const assembly = getState().videos.find(v => v.id === id)?.assemblyCheckpoint;
    const cartoon = getState().videos.find(v => v.id === id)?.cartoonCheckpoint;
    if (usesCartoonWorker(input.engine) && cartoon) {
      await flushVideo(id);
      const job = await submitCartoon({ data: cartoon });
      up({ hostedRender: job, stage: 'render', progress: 72, detail: advanced ? 'Advanced Video AI render · safe to close your browser' : 'Cartoon preview · safe to close your browser' });
      return;
    }
    if (assembly) {
      await handoffAssembly(id, assembly, getState().videos.find(v => v.id === id)?.assemblyClips ?? [], up);
      return;
    }
    const writeScript = async () => {
    up({ status: "running", stage: "script", progress: 3, detail: "Viral Brain is writing the script…", error: undefined });
    const archetype = ARCHETYPES.find((a) => a.id === input.archetype);
    if (input.format === 'short' && await withRetry(() => shortsWriterEnabled())) {
      // Shorts Writer v4 (owner's task): facts -> spine -> hooks -> narrator script -> critic, then scenes split word for word.
      const research = [input.reference ? `Inspiration video transcript (research only; never copy its lines): ${input.reference.transcript.slice(0, 4000)}` : '', input.topicSource ? `Research starting point: ${input.topicSource.fact} — ${input.topicSource.url}. Verify independently.` : ''].filter(Boolean).join('\n') || undefined;
      const calls = writerCalls((step, args) => withRetry(() => shortsWriterStep({ data: { step: step as never, args } }), 2, 16000, 8 * 60_000), { topic: input.topic, deployment: s.scriptDeployment, durationSec: input.durationSec, kid: advanced, research });
      const base = { topic: input.topic, format: input.format, durationSec: input.durationSec, archetype: archetype ? `${archetype.name} — ${archetype.formula}` : 'Best fit', style: input.style, deployment: s.scriptDeployment, ...(advanced ? { kid: true } : {}) };
      const v4 = await runShortsV4({ calls, durationSec: input.durationSec, base, plan: (data) => withRetry(() => generatePlan({ data }), 3, 16000, 8 * 60_000), progress: (detail) => up({ detail }) });
      const saved: ScriptCheckpoint = { plan: v4.plan, gate: v4.gate, report: v4.report, judgeOk: v4.judgeOk, hookType: v4.hookType, moneyShot: v4.moneyShot };
      up({ hooks: { best: v4.writer.hook, runnerUp: v4.writer.rounds[0]?.hooks[1]?.line ?? v4.writer.hook }, checks: v4.gate.blockers, scriptCheckpoint: saved }); await flushVideo(id);
      return saved;
    }
    // 1) fact check
    up({ detail: "Fact-checking the story…" });
    const facts = await withRetry(() => factCheck({ data: { topic: input.topic, deployment: s.scriptDeployment } }));
    const factText = [
      ...(input.reference ? [`Inspiration video (${input.reference.url}) transcript — use ONLY as research for the same true topic. Write a brand-new original story: never copy its lines, hook or wording, and verify every claim: "${input.reference.transcript.slice(0, input.format === "long" ? 12000 : 4000)}"`] : []),
      ...(input.topicSource ? [`Research starting point: ${input.topicSource.fact} — ${input.topicSource.url}. Verify this claim independently; do not treat the title as proof.`] : []),
      ...facts.claims.map((c) => `- ${c.claim} (${c.date}) [${c.confidence}; ${c.sources.join("; ")}]`),
      `Myth: ${facts.myth}`, `Reality: ${facts.reality}`, facts.hedge ? `Hedge line to include: ${facts.hedge}` : "",
    ].join("\n");
    const confidence = facts.claims.length ? facts.claims.filter((c) => c.confidence !== "low").length / facts.claims.length : 0;
    up({ progress: 4, facts: { myth: facts.myth, reality: facts.reality, claims: facts.claims.length, confidence }, detail: "Finding the hero, question and payoff…" });
    // 2) research: anchors, premise, impossible question, payoff, money shot
    const rs = await withRetry(() => researchStory({ data: { topic: input.topic, facts: factText, deployment: s.scriptDeployment, advanced } }));
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
    let hooks = await withRetry(() => generateHooks({ data: { topic: input.topic, facts: factText, research: researchText, prefer: prefer.join(", "), deployment: s.scriptDeployment, advanced, shape: input.format === 'short' } }));
    let valid = eligibleHooks(hooks.all, rs.anchors, factText, advanced, input.format === 'short');
    if (!valid.length) {
      hooks = await withRetry(() => generateHooks({ data: { topic: input.topic, facts: factText, research: `${researchText}\nPrevious hooks failed. Use the EXACT subject "${rs.anchors.subject}" in the first few words, ${advanced ? "with a concrete odd fact; no mandatory year/place" : "plus a checked place/year"}. Do not substitute dragon or jar for seismoscope unless that is the subject anchor.`, prefer: prefer.join(', '), deployment: s.scriptDeployment, advanced, shape: input.format === 'short' } }));
      valid = eligibleHooks(hooks.all, rs.anchors, factText, advanced, input.format === 'short');
    }
    const rate = (h: Hook) => h.curiosity * 1.4 + h.clarity + h.visualness * 1.2 + h.speakability
      - (advanced ? advancedOpeningIssues(h.line, rs.anchors.subject) : hookIssues(h.line, rs.anchors, factText)).length * 8 - hookTextIssues(h.text, h.line).length * 4 + (prefer[0] === h.type ? 3 : 0);
    const ranked = valid.sort((x, y) => rate(y) - rate(x));
    const hb = ranked[0];
    if (!hb) throw Error('No opening passed the story checks after a second hook draft. No voice or rendering was started.');
    const runner = ranked[1] ?? hb;
    up({ progress: 8, hooks: { best: hb.line, runnerUp: runner.line }, detail: "Writing the beat sheet and script…" });
    // 4) beat sheet + script -> blocking validators + blind judges -> up to 2 repair rewrites (before any images or voice)
    const base = {
      topic: input.topic, format: input.format, durationSec: input.durationSec,
      archetype: archetype ? `${archetype.name} — ${archetype.formula}` : "Best fit", style: input.style, deployment: s.scriptDeployment,
      facts: factText, research: researchText, hook: hb.line, ...(advanced ? { kid: true } : {}), shape: input.format === 'short',
    };
    // Advanced Video AI: the narration must fit the chosen length before any voice or pictures are paid for.
    const budget = wordBudget(input.durationSec), micro = input.format === "short" && input.durationSec < MICRO_SEC;
    const fitNote = advanced ? `\nLENGTH (hard limit): the whole narration must be ${Math.round(budget * 0.9)}-${Math.round(budget * 1.1)} words for ${input.durationSec} seconds.${micro ? " LOOP SHORT: ignore the word-20/26/38 opening rules, myth, analogy and escalation beats; hook, one clear curiosity and its plain answer, no forced questions or twists." : ""} Every word must be one an 8-year-old knows.` : "";
    const evaluate = async (p: Plan) => {
      const story = {
        scenes: p.scenes.map((x) => ({ beat: x.beat, narration: x.narration, characters: x.characters, shot: x.shot, money: x.money, loop_opened: x.loop_opened, loop_closed: x.loop_closed })),
        anchors: rs.anchors, question: p.question || rs.question, hero: p.hero?.name ? p.hero : rs.hero, cast: p.characters.map((c) => ({ name: c.name, role: c.role })), durationSec: input.durationSec, kid: advanced, shape: input.format === 'short',
      };
      const report = validateStory(story);
      const ht = hookTextIssues(p.hookText, p.scenes[0]?.narration ?? "");
      if (ht.length) report.checks.push({ id: "HOOKTEXT", pass: false, msg: ht.join("; ") }), report.failed.push(report.checks[report.checks.length - 1]!);
      const opening = splitSentences(p.scenes.map((x) => x.narration).join(" "))[0] ?? "";
      const hi = advanced ? advancedOpeningIssues(opening, rs.anchors.subject) : hookIssues(opening, rs.anchors, factText);
      report.checks.push({ id: "HOOK", pass: !hi.length, msg: hi.length ? `Hook: ${hi.join("; ")}` : "Hook rules met" });
      if (hi.length) report.failed.push(report.checks[report.checks.length - 1]!);
      const full = p.scenes.map((x) => x.narration).join(" ");
      const firstShots = (sec: number) => { const st = sceneStarts(story.scenes); return p.scenes.filter((_, i) => st[i]! < sec).map((x) => `[picture: ${x.image_prompt.slice(0, 200)}]`).join(" "); };
      const judge = await withRetry(() => judgeScript({ data: {
        first3: `${p.hookText ? `On-screen text: "${p.hookText}". ` : ""}Narration: "${spokenBy(story.scenes, 3.2)}" ${firstShots(3.2)}`,
        first15: `Narration: "${spokenBy(story.scenes, 15)}" ${firstShots(15)}`,
        full, truth: `${researchText}\nHook: ${hb.line}`,
        shots: p.scenes.map((x, i) => `${i}: ${x.narration} => ${x.image_prompt.slice(0, 220)}`).join("\n"),
        deployment: s.scriptDeployment, advanced, shape: input.format === 'short',
      } })).catch((e: unknown) => { console.warn("Judges unavailable:", e); return null; });
      if (judge?.filler.length && judge.filler.length > 2) report.failed.push({ id: "V8j", pass: false, msg: `V8 new info (judge): "${judge.filler.slice(0, 2).join('", "')}" add nothing new` });
      const gate = storyScore(report, judge, p.scenes.length, { strict: advanced });
      return { report, judge, gate };
    };
    const planWait = input.format === "short" ? STEP_TIMEOUT_MS : 8 * 60_000; // a 10-20 min script is a much longer answer
    let plan = autoFixPlan(await withRetry(() => generatePlan({ data: base }), 4, 16000, planWait), advanced);
    let ev = await evaluate(plan);
    let draft = plan, draftEv = ev;
    const tries = (usesCartoonWorker(input.engine) || input.format === "short") ? 3 : 2; // cartoon only renders a ready story, so give it one more rewrite
    for (let attempt = 1; attempt <= tries && !ev.gate.ready; attempt++) {
      up({ progress: 8 + attempt, detail: `Story score ${ev.gate.score}/100 — rewriting to fix ${ev.gate.blockers.length} issue${ev.gate.blockers.length === 1 ? "" : "s"} (try ${attempt}/${tries})…` });
      const repaired = await withRetry(() => generatePlan({ data: { ...base, repair: repairBrief(draft, draftEv.gate, rs.anchors, { loop: advanced && micro, advanced, shape: input.format === 'short' }) + fitNote } }), 4, 16000, planWait).then(p => autoFixPlan(p, advanced)).catch(() => null);
      if (!repaired) break;
      const ev2 = await evaluate(repaired);
      draft = repaired; draftEv = ev2;
      if ((advanced ? preferAdvancedRepair : preferRepair)(ev.gate, ev2.gate)) { plan = repaired; ev = ev2; }
    }
    if (advanced && !ev.gate.ready) {
      // Final kid-language editor: same scenes and pictures, simpler words and natural storytelling; kept only if it scores better.
      up({ detail: "Polishing the words so an 8-year-old understands every line…" });
      const names = [plan.hero?.name, ...plan.characters.map((c) => c.name), rs.anchors.place].filter((x): x is string => !!x);
      const polished = await withRetry(() => polishKidScript({ data: { scenes: plan.scenes.map((sc) => sc.narration), problems: ev.gate.blockers.slice(0, 30).map((b) => b.slice(0, 380)), words: Math.min(400, Math.max(10, budget)), names: names.slice(0, 20), deployment: s.scriptDeployment } })).catch((e: unknown) => { console.warn("Kid editor skipped:", e); return null; });
      if (polished) {
        const kidPlan: Plan = { ...plan, script: polished.scenes.join(" "), scenes: plan.scenes.map((sc, i) => ({ ...sc, narration: polished.scenes[i] ?? sc.narration })) };
        const kidEv = await evaluate(kidPlan);
        if (preferAdvancedRepair(ev.gate, kidEv.gate)) { plan = kidPlan; ev = kidEv; }
      }
    }
    if (advanced) {
      const count = (x: Plan) => x.scenes.map((sc) => sc.narration).join(" ").split(/\s+/).filter(Boolean).length;
      if (count(plan) > budget * 1.25) {
        up({ detail: `Script is ${count(plan)} words; cutting it to fit ${input.durationSec} seconds…` });
        const cut = await withRetry(() => generatePlan({ data: { ...base, repair: repairBrief(plan, ev.gate, rs.anchors, { loop: advanced && micro, advanced, shape: input.format === 'short' }) + fitNote + `\nThe last draft had ${count(plan)} words: CUT it to at most ${budget} words, keeping the hook, question and twist.` } }), 4, 16000, planWait).then(p => autoFixPlan(p, advanced)).catch(() => null);
        if (cut && count(cut) <= budget * 1.25) { const ce = await evaluate(cut); if (preferAdvancedRepair(ev.gate, ce.gate)) { plan = cut; ev = ce; } }
      }
      if (count(plan) > budget * 1.25) {
        // Second shortening path: the line-by-line editor keeps every scene and picture plan but trims the words.
        up({ detail: `Script is ${count(plan)} words; trimming each line to fit ${input.durationSec} seconds…` });
        const names = [plan.hero?.name, ...plan.characters.map((c) => c.name), rs.anchors.place].filter((x): x is string => !!x);
        const trimmed = await withRetry(() => polishKidScript({ data: { scenes: plan.scenes.map((sc) => sc.narration), problems: [`Too long: ${count(plan)} words. The whole script MUST be at most ${budget} words — shorten every line.`], words: Math.min(400, Math.max(10, Math.round(budget * 0.9))), names: names.slice(0, 20), deployment: s.scriptDeployment } })).catch(() => null);
        if (trimmed) {
          const tp: Plan = { ...plan, script: trimmed.scenes.join(" "), scenes: plan.scenes.map((sc, i) => ({ ...sc, narration: trimmed.scenes[i] ?? sc.narration })) };
          if (count(tp) < count(plan)) { const te = await evaluate(tp); if (preferAdvancedRepair(ev.gate, te.gate)) { plan = tp; ev = te; } }
        }
      }
      // Never fail the video for length: a slightly long script just makes a slightly longer Short.
      if (count(plan) > budget * 1.25) ev = { ...ev, gate: { ...ev.gate, blockers: [...ev.gate.blockers, `Length: ${count(plan)} words for ${input.durationSec}s (aim ${budget}) — the Short will run a little long`] } };
    }
    up({ checks: ev.gate.blockers, judges: ev.judge ? { passA: ev.judge.passA, passB: ev.judge.passB, passC: ev.judge.passC, payoff: ev.judge.payoff, weakest: ev.judge.weakest } : undefined });
    plan = { ...plan, scenes: splitLongScenes(plan.scenes) };
      const saved: ScriptCheckpoint = { plan, gate: ev.gate, report: { revealSec: ev.report.revealSec, shotMix: ev.report.shotMix }, judgeOk: !!ev.judge, hookType: hb.type, moneyShot: rs.moneyShot };
      // Persist the paid script at once so a closed page can resume without rewriting it.
      up({ scriptCheckpoint: saved }); await flushVideo(id);
      return saved;
    };
    const savedScript = getState().videos.find(v => v.id === id)?.scriptCheckpoint;
    if (savedScript) up({ status: 'running', stage: 'images', progress: 12, error: undefined, detail: 'Resuming from the saved script…' });
    const { plan: scriptPlan, gate, report, judgeOk, hookType, moneyShot } = savedScript ?? await writeScript();
    // Ink explainer cuts to a new literal picture every 1-2 seconds: one still per spoken phrase, no camera moves.
    const ink = input.format !== "short" && input.style === "Ink explainer" && (input.engine ?? "own") === "own";
    const plan = ink ? { ...scriptPlan, scenes: splitInkBeats(scriptPlan.scenes.map(sc => ({ ...sc, narration: spellNumbers(sc.narration) }))) } : scriptPlan;
    const n = plan.scenes.length;
    up({ title: plan.title, description: plan.description, sceneCount: n, stage: "voice", progress: 12, detail: `Script ready · story score ${gate.score}/100 · ${n} scenes` });

    if (usesCartoonWorker(input.engine)) {
      const long = input.format !== 'short';
      // Owner approves the preview before the full render, so the best draft continues; leftover script notes stay on the video as checks.
      if (!plan.scenes.length) throw Error('The script came back empty. No voice or rendering was started.');
      if (!gate.ready || !judgeOk) up({ checks: gate.blockers, detail: `Story score ${gate.score}/100 — continuing with the best draft${advanced ? '' : '; check the preview before approving'}` });
      const directed = await withRetry(() => directCartoon({ data: { scenes: plan.scenes.map(sc => `${sc.narration} Visual: ${sc.image_prompt}`), deployment: s.scriptDeployment, format: long ? 'long' : 'short', ...(advanced ? { advanced: true } : {}) } }));
      // Advanced Video AI: an animal the story names always acts on screen.
      const direction = advanced ? ensureAnimalCast(directed, plan.scenes.map(sc => sc.narration)) : directed;
      const narration = plan.scenes.map(sc => speakable(sc.narration.trim()));
      const script = narration.join(' ');
      if (/\d/.test(script)) throw Error('Cartoon narration must spell numbers as spoken words');
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw Error('Not signed in');
      const voicePath = `${user.user.id}/${id}/cartoon/original-voice.wav`;
      // Advanced Video AI: paint one character card per cast member while the voice records (saved, so Resume never repays).
      const cardsP = advanced ? paintAdvancedCards(direction, plan.scenes.map(sc => sc.narration), `${user.user.id}/${id}/media`, s, (detail) => up({ detail }), (fn) => withRetry(fn)) : Promise.resolve(undefined);
      cardsP.catch(() => {});
      // Resume: the locked take for this same saved script is already stored, so reuse it instead of paying again.
      const { data: existing } = await supabase.storage.from('videos').list(`${user.user.id}/${id}/cartoon`, { search: 'original-voice.wav' });
      if (existing?.some(f => f.name === 'original-voice.wav')) {
        up({ progress: 30, detail: 'Reusing the saved Atlas take…' });
      } else {
        up({ progress: 30, detail: 'Recording one locked Atlas take…' });
        let audio: ArrayBuffer;
        if (long) {
          // Long-form: calm documentary takes of whole sentences, joined into one locked narration track.
          const takes = groupTakes(narration, 140), parts: ArrayBuffer[] = [];
          for (const [k, text] of takes.entries()) {
            up({ detail: `Recording documentary narration · take ${k + 1}/${takes.length}` });
            parts.push(b64ToBuf((await withRetry(() => generateVoice({ data: { text, voice: 'onyx', deployment: s.ttsDeployment, style: 'long' } }))).audio));
          }
          audio = joinWavs(parts);
        } else audio = b64ToBuf((await withRetry(() => generateVoice({ data: { text: script, voice: 'onyx', deployment: s.ttsDeployment, style: 'short' } }))).audio);
        const { error } = await supabase.storage.from('videos').upload(voicePath, audio, { contentType: 'audio/wav', upsert: false });
        if (error && !/exists|duplicate/i.test(error.message)) throw Error(`Could not save locked Atlas narration: ${error.message}`);
      }
      const painted = await cardsP;
      const sanitized = sanitizeDirection(direction, narration);
      const placed = painted ? placeObjectCards({ ...sanitized, cast: sanitized.cast.map(c => ({ ...c, card: true })) }, painted) : null;
      const cards = placed?.cards;
      const safeDirection = placed ? placed.direction : sanitized;
      const cp = cartoonStart.parse({ ...(cards ? { advanced: true, cards } : {}), videoId: id, voicePath, narration, script, direction: safeDirection, gate: gate, hookType: hookType, report: { revealSec: report.revealSec, shotMix: report.shotMix }, captions: !long, sfx: s.soundEffects, format: long ? 'long' : 'short' });
      up({ cartoonCheckpoint: cp, progress: 70, detail: advanced ? 'Sending to Advanced Video AI render…' : 'Sending cartoon to hosted preview…' });
      await flushVideo(id);
      const job = await submitCartoon({ data: cp });
      up({ hostedRender: job, stage: 'render', progress: 72, detail: advanced ? 'Advanced Video AI render · safe to close your browser' : 'Cartoon preview · safe to close your browser' });
      return;
    }

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
      withRetry(() => generateImage({ data: { prompt, aspect: portrait ? "portrait" : "landscape", deployment: s.imageDeployment, quality: ink && s.imageQuality === "low" ? "medium" : s.imageQuality, style: input.style, palette: plan.palette, ...(ink ? { crisp: true } : {}), ...extra } }), 9, 30000);

    const media = await mediaCache(id);
    await Promise.all([
      pool(groups, 3, async (g, gi) => {
        const text = g.map((i) => plan.scenes[i]!.narration.trim()).join(" ");
        const key = `voice-${textKey(text)}.wav`;
        const kept = await media.get(key);
        if (kept) { voice[gi]!.audio = kept; tick("Recording narration"); return; }
        const r = await withRetry(() => generateVoice({ data: { text, voice: input.voice, deployment: s.ttsDeployment, style: portrait ? "short" : "long" } }));
        voice[gi]!.audio = b64ToBuf(r.audio);
        await media.put(key, voice[gi]!.audio.slice(0), "audio/wav");
        tick("Recording narration");
      }),
      (async () => {
        // 1) character sheet keeps the cast identical in every shot
        let sheet: string | undefined;
        if (plan.characters.length) {
          try {
            const kept = await media.get("sheet.jpg");
            if (kept) sheet = bufToB64(kept);
            else {
              const r = await img({ sheet: true }, ink ? `The Hero: ${INK_HERO}. Draw only him, front view and side view, thin black stick arms and legs.` : plan.characters.map((c) => `${c.name}: ${c.look}`).join("; "));
              sheet = r.image ?? undefined;
              if (sheet) await media.put("sheet.jpg", b64ToBuf(sheet), "image/jpeg");
            }
          } catch { /* continue without reference */ }
        }
        tick("Designing characters");
        // Ink explainer: about one sentence in five becomes a white idea card with exact hand-lettered text.
        let cards = new Map<number, InkCard>();
        const beatVisual = new Map<number, string>();
        if (ink) {
          const kept = await media.get("ink-cards.json");
          let picked: InkCard[] | null = kept ? JSON.parse(new TextDecoder().decode(kept)) as InkCard[] : null;
          if (!picked) {
            picked = await withRetry(() => planInkCards({ data: { scenes: plan.scenes.map((x) => x.narration), deployment: s.scriptDeployment } })).then((r) => pickInkCards(r, n)).catch(() => []);
            await media.put("ink-cards.json", new TextEncoder().encode(JSON.stringify(picked)).buffer as ArrayBuffer, "application/json");
          }
          cards = new Map(picked.map((c) => [c.index, c]));
          // one literal picture per phrase: what the narrator says is what the viewer sees
          const keptBeats = await media.get(`ink-beats-v2-${textKey(plan.scenes.map(sc => sc.narration).join(' '))}.json`);
          let shots: { i: number; visual: string }[] | null = keptBeats ? JSON.parse(new TextDecoder().decode(keptBeats)) as { i: number; visual: string }[] : null;
          if (!shots) {
            const items = plan.scenes.map((sc, i) => ({ i, text: sc.narration, scene: sc.image_prompt })).filter((b) => !cards.has(b.i));
            const batches: typeof items[] = [];
            for (let k = 0; k < items.length; k += 60) batches.push(items.slice(k, k + 60));
            const got: { i: number; visual: string }[][] = [];
            await pool(batches, 4, async (b, bi) => { got[bi] = await withRetry(() => planInkBeats({ data: { beats: b, topic: plan.title, deployment: s.scriptDeployment } })); });
            shots = got.flat().filter((x) => x && typeof x.visual === "string" && x.visual.trim());
            await media.put(`ink-beats-v2-${textKey(plan.scenes.map(sc => sc.narration).join(' '))}.json`, new TextEncoder().encode(JSON.stringify(shots)).buffer as ArrayBuffer, "application/json");
          }
          for (const sh of shots) if (plan.scenes[sh.i]) beatVisual.set(sh.i, sh.visual.trim());
        }
        await pool(plan.scenes, ink ? 10 : 2, async (sc0, i) => {
          const sc = ink ? { ...sc0, image_prompt: beatVisual.get(i) ?? `${sc0.image_prompt} The picture shows exactly: ${sc0.narration}` } : sc0;
          const card = cards.get(i);
          if (card) {
            const ckey = `card-${i}-${textKey(card.text + card.icon)}.jpg`;
            let buf = await media.get(ckey);
            if (!buf) {
              const icon = card.icon ? await img({}, `A single small simple hand-drawn ink doodle of ${card.icon}, centered on a pure white background, nothing else in the picture, lots of empty white space around it.`).catch(() => null) : null;
              const b64 = await composeInkCard(icon?.image ?? null, card.text, /\?$/.test(card.text) === false && /\d/.test(card.text));
              buf = b64ToBuf(b64);
              await media.put(ckey, buf.slice(0), "image/jpeg");
            }
            rawImg[i] = bufToB64(buf);
            scenes[i]!.image = await createImageBitmap(new Blob([buf], { type: "image/jpeg" }));
            tick("Drawing idea cards");
            return;
          }
          // Characters only lead action/face shots; wide, aerial and macro shots show the world, the process or the money shot,
          // and skip the sheet reference (it pulls every frame back to a posed line-up).
          const keptImg = await media.get(`scene-${i}-${textKey(sc.image_prompt)}.jpg`);
          if (keptImg) {
            rawImg[i] = bufToB64(keptImg);
            scenes[i]!.image = await createImageBitmap(new Blob([keptImg], { type: "image/jpeg" }));
            tick("Painting scenes");
            return;
          }
          const people = ink ? /\bhero\b/i.test(sc.image_prompt) : sc.shot === "action" || sc.shot === "face";
          if (ink) {
            // Ink explainer: one literal subject per picture, the stick-figure hero only when the phrase is about him
            const inkShot = `${sc.image_prompt} ${people ? `The hero is drawn exactly like the reference: ${INK_HERO}.` : "No hero in this picture."} Any other people are minimal stick figures (round heads, thin black stick limbs) in period clothing. Simple clean background, one clear subject.`;
            let r = await img(people && sheet ? { cast: "The Hero", reference: sheet } : {}, inkShot).catch((e: unknown) => { if (/\[429\]/.test(String(e))) throw e; return null; });
            if (!r) r = await img({}, inkShot);
            if (r.image) { rawImg[i] = r.image; await media.put(`scene-${i}-${textKey(sc.image_prompt)}.jpg`, b64ToBuf(r.image), "image/jpeg"); scenes[i]!.image = await createImageBitmap(new Blob([b64ToBuf(r.image)], { type: "image/jpeg" })); }
            tick("Painting scenes");
            return;
          }
          const castAll = sc.characters.map((nm) => looks.get(nm.toLowerCase())).filter(Boolean).map((c) => `${c!.name}: ${c!.look}`).join("; ");
          const cast = people ? castAll : "";
          const shot = [
            SHOT[sc.shot] ?? "", ANGLE[sc.angle] ?? "", sc.money && moneyShot ? `MONEY SHOT: ${moneyShot}.` : "", sc.image_prompt,
            people ? "The characters are mid-action, busy with the task, NOT posing side by side and NOT looking at the camera." : castAll ? `Any people are small in the frame (${castAll.slice(0, 200)}).` : "",
            COLOR[sc.color] ?? "", LIGHT,
          ].filter(Boolean).join(" ");
          let r = await img((cast && sheet ? { cast, reference: sheet } : { cast }), shot).catch((e: unknown) => { if (/\[429\]/.test(String(e))) throw e; return null; });
          if (!r) r = await img({ cast }, shot); // retry without the reference
          // continuity gate: compare the cast to the character sheet; redraw once if it drifted
          if (r.image && sheet && cast && !ink) {
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
          if (r.image) { rawImg[i] = r.image; await media.put(`scene-${i}-${textKey(sc.image_prompt)}.jpg`, b64ToBuf(r.image), "image/jpeg"); }
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

    const continuity = contScores.length ? contScores.filter((x) => x >= 6).length / contScores.length : 1;
    const cp = await saveAssemblyAssets(id, plan, full, voice, { gate: gate, report: { revealSec: report.revealSec, shotMix: report.shotMix }, hookType: hookType, continuity });
    const clipPaths: { path: string; scenes: number[] }[] = [];
    up({ assemblyCheckpoint: cp, assemblyClips: clipPaths, stage: "render", progress: 72, detail: "Sending to hosted assembly…", thumb: full[0] ? thumbnail(full[0].image) : undefined });
    await handoffAssembly(id, cp, clipPaths, up);
    for (const scene of full) scene.image.close();
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (/PROHIBITED_CONTENT/.test(msg)) msg = "The narrator voice refused part of this script (it reads as too violent). Try a gentler topic wording and generate again.";
    if (!removed.has(id)) up({ status: "failed", error: msg, detail: "Failed" });
  } finally {
    running.delete(id);
    setVideoActive(id, false);
    keepAlive();
  }
}

export interface ScriptCheckpoint {
  plan: Plan;
  gate: Parameters<typeof finalScore>[0];
  report: { revealSec: number; shotMix: Record<string, number> };
  judgeOk: boolean;
  hookType: string;
  moneyShot: string;
}

/** Each paid image/voice take is saved as soon as it is made; a resumed run downloads it instead of paying again. */
async function mediaCache(id: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Not signed in");
  const root = `${user.user.id}/${id}/media`, bucket = supabase.storage.from("videos");
  const { data: list } = await bucket.list(root, { limit: 1000 });
  const have = new Set((list ?? []).map((f) => f.name));
  return {
    async get(name: string): Promise<ArrayBuffer | null> {
      if (!have.has(name)) return null;
      const { data } = await bucket.download(`${root}/${name}`);
      return data ? await data.arrayBuffer() : null;
    },
    async put(name: string, body: ArrayBuffer, contentType: string) {
      const { error } = await bucket.upload(`${root}/${name}`, body, { upsert: true, contentType });
      if (error) throw Error('Paid media could not be saved. Do not regenerate; check your connection.');
      have.add(name);
    },
  };
}
const bufToB64 = (b: ArrayBuffer) => { const u = new Uint8Array(b); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const textKey = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };

export interface SeedanceCheckpoint {
  plan: Plan;
  gate: Parameters<typeof finalScore>[0];
  report: { revealSec: number; shotMix: Record<string, number> };
  hookType: string;
  continuity: number;
  images: string[];
  voice: { path: string; scenes: number[] }[];
}

async function saveAssemblyAssets(id: string, plan: Plan, scenes: RenderScene[], voice: VoiceChunk[], meta: Omit<SeedanceCheckpoint, "plan" | "images" | "voice">): Promise<SeedanceCheckpoint> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Not signed in");
  const root = `${user.user.id}/${id}/assets`, bucket = supabase.storage.from("videos");
  const images: string[] = [], takes: SeedanceCheckpoint["voice"] = [];
  await pool(scenes.map((_, i) => i), 8, async (i) => {
    const scene = scenes[i];
    if (!scene) throw new Error("Scene missing");
    const canvas = document.createElement("canvas");
    canvas.width = scene.image.width; canvas.height = scene.image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not save scene image");
    ctx.drawImage(scene.image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not save scene")), "image/jpeg", 0.96));
    const path = `${root}/render-image-${i}.jpg`;
    const { error } = await bucket.upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) throw new Error(`Could not save scene ${i + 1}`);
    images[i] = path;
  });
  for (let i = 0; i < voice.length; i++) {
    const take = voice[i];
    if (!take) continue;
    const path = `${root}/render-voice-${i}.wav`;
    const { error } = await bucket.upload(path, take.audio, { upsert: true, contentType: "audio/wav" });
    if (error) throw new Error("Could not save narration");
    takes.push({ path, scenes: take.scenes });
  }
  return { ...meta, plan, images, voice: takes };
}

async function handoffAssembly(id: string, cp: SeedanceCheckpoint, clips: { path: string; scenes: number[] }[], up: (p: Parameters<typeof actions.updateVideo>[1]) => void) {
  await flushVideo(id);
  const settings = getState().settings;
  // Single submission: never retry an ambiguous start and create a duplicate paid render.
  const job = await submitHostedRender({ data: { videoId: id, checkpoint: cp, clips, captions: settings.burnCaptions && getState().videos.find((v) => v.id === id)?.input.style !== "Ink explainer", sfx: settings.soundEffects } });
  up({ hostedRender: { id: job.id, status: job.status }, stage: "render", progress: 72, detail: "Hosted assembly · safe to close your browser" });
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
  assertVideoEngine(input.engine);
  const used = getState().videos.map((v) => ({ topic: v.input.topic, topicId: v.input.topicId, status: v.status }));
  if (topicUnavailable(input.topic, input.topicId, used)) throw new Error("This topic already has a video or is being made. Pick a new topic.");
  const id = actions.addVideo(input);
  void runVideo(id, input);
  return id;
}
