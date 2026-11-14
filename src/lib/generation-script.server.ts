import { advancedOpeningIssues } from './advanced-story';
import { ARCHETYPES } from './viral-brain';
import { factCheckOperation as factCheck, researchStoryOperation as researchStory, generateHooksOperation as generateHooks, generatePlanOperation as generatePlan, judgeScriptOperation as judgeScript, type Plan, type Hook } from './pipeline-operations.server';
import { hookIssues, hookTextIssues, sceneStarts, splitSentences, spokenBy, storyScore, validateStory } from './story-v2';
import { autoFixPlan, eligibleHooks, preferRepair, repairBrief } from './script-repair';
import type { VideoInput, Settings } from './store';
import type { ScriptCheckpoint } from './pipeline';
export interface ScriptAPI { call<T>(fn: () => Promise<T>): Promise<T> }
const STEP_TIMEOUT_MS = 180000;
const ROTATE: Record<string,string> = { wide:'low_angle', aerial:'top_down', close:'over_shoulder', top_down:'wide', macro:'close', pov:'wide', low_angle:'close', over_shoulder:'close' };
export function splitLongScenes(scenes: Plan["scenes"], maxWords = 11): Plan["scenes"] {
  const out: Plan["scenes"] = [];
  for (const sc of scenes) {
    const parts = splitSentences(sc.narration);
    if (sc.narration.split(/\s+/).length <= maxWords || parts.length < 2) { out.push(sc); continue; }
    const total = sc.narration.split(/\s+/).length;
    let cut = 1, acc = (parts[0] ?? "").split(/\s+/).length;
    while (cut < parts.length - 1 && acc + (parts[cut] ?? "").split(/\s+/).length <= total / 2 + 3) { acc += (parts[cut] ?? "").split(/\s+/).length; cut++; }
    const a = parts.slice(0, cut).join(" "), b = parts.slice(cut).join(" ");
    out.push({ ...sc, narration: a, loop_closed: "" });
    out.push(...splitLongScenes([{ ...sc, narration: b, money: false, loop_opened: "", angle: ROTATE[sc.angle] ?? "close", camera: sc.camera === "push_in" ? "pan_right" : "push_in", image_prompt: `${sc.image_prompt} Next moment, from a different angle, showing: ${b.slice(0, 160)}` }], maxWords));
  }
  return out;
}

    export async function writeBackgroundScript(input: VideoInput, s: Settings, api: ScriptAPI, up: (patch: Record<string, unknown>) => Promise<void>, existing?: ScriptCheckpoint): Promise<ScriptCheckpoint> {
    if (existing) return existing;
    const advanced = input.engine === "advanced";
    await up({ status: "running", stage: "script", progress: 3, detail: "Viral Brain is writing the script…", error: undefined });
    const archetype = ARCHETYPES.find((a) => a.id === input.archetype);
    // 1) fact check
    await up({ detail: "Fact-checking the story…" });
    const facts = await api.call(() => factCheck({ data: { topic: input.topic, deployment: s.scriptDeployment } }));
    const factText = [
      ...(input.reference ? [`Inspiration video (${input.reference.url}) transcript — use ONLY as research for the same true topic. Write a brand-new original story: never copy its lines, hook or wording, and verify every claim: "${input.reference.transcript.slice(0, input.format === "long" ? 12000 : 4000)}"`] : []),
      ...(input.topicSource ? [`Research starting point: ${input.topicSource.fact} — ${input.topicSource.url}. Verify this claim independently; do not treat the title as proof.`] : []),
      ...facts.claims.map((c) => `- ${c.claim} (${c.date}) [${c.confidence}; ${c.sources.join("; ")}]`),
      `Myth: ${facts.myth}`, `Reality: ${facts.reality}`, facts.hedge ? `Hedge line to include: ${facts.hedge}` : "",
    ].join("\n");
    const confidence = facts.claims.length ? facts.claims.filter((c) => c.confidence !== "low").length / facts.claims.length : 0;
    await up({ progress: 4, facts: { myth: facts.myth, reality: facts.reality, claims: facts.claims.length, confidence }, detail: "Finding the hero, question and payoff…" });
    // 2) research: anchors, premise, impossible question, payoff, money shot
    const rs = await api.call(() => researchStory({ data: { topic: input.topic, facts: factText, deployment: s.scriptDeployment, advanced } }));
    if (!rs.oneImage.ok) throw new Error("Pick a more visual topic: the odd thing in this story can't be shown in one picture.");
    const researchText = [
      `Anchors: subject "${rs.anchors.subject}", year "${rs.anchors.year}", place "${rs.anchors.place}", org "${rs.anchors.org}", stakes "${rs.anchors.stakes}"`,
      `Premise: ${rs.premise}`, `Main question: ${rs.question}`,
      `Hero: ${rs.hero.name} (${rs.hero.role}) wants: ${rs.hero.want}`, `Skeptic: ${rs.skeptic.name} (${rs.skeptic.role})`, `Threat: ${rs.threat}`,
      `Tries: ${rs.tries.join(" -> ")}`, `Analogy: ${rs.analogy}`, `Proof shot: ${rs.proof}`, `Payoff: ${rs.payoff}`, `Money shot: ${rs.moneyShot}`,
    ].join("\n");
    await up({ progress: 6, story: { premise: rs.premise, question: rs.question, hero: `${rs.hero.name} — ${rs.hero.want}`, anchors: Object.values(rs.anchors).join(" · ") }, detail: "Writing 10 hooks…" });
    // 3) hooks: score, drop banned / unanchored ones, prefer types that performed best
    const prefer: string[] = [];
    let hooks = await api.call(() => generateHooks({ data: { topic: input.topic, facts: factText, research: researchText, prefer: prefer.join(", "), deployment: s.scriptDeployment, advanced } }));
    let valid = eligibleHooks(hooks.all, rs.anchors, factText, advanced);
    if (!valid.length) {
      hooks = await api.call(() => generateHooks({ data: { topic: input.topic, facts: factText, research: `${researchText}\nPrevious hooks failed. Use the EXACT subject "${rs.anchors.subject}" in the first few words, plus a checked place/year. Do not substitute dragon or jar for seismoscope unless that is the subject anchor.`, prefer: prefer.join(', '), deployment: s.scriptDeployment, advanced } }));
      valid = eligibleHooks(hooks.all, rs.anchors, factText, advanced);
    }
    const rate = (h: Hook) => h.curiosity * 1.4 + h.clarity + h.visualness * 1.2 + h.speakability
      - hookIssues(h.line, rs.anchors, factText).length * 8 - hookTextIssues(h.text, h.line).length * 4 + (prefer[0] === h.type ? 3 : 0);
    const ranked = valid.sort((x, y) => rate(y) - rate(x));
    const hb = ranked[0];
    if (!hb) throw Error('No opening passed the story checks after a second hook draft. No voice or rendering was started.');
    const runner = ranked[1] ?? hb;
    await up({ progress: 8, hooks: { best: hb.line, runnerUp: runner.line }, detail: "Writing the beat sheet and script…" });
    // 4) beat sheet + script -> blocking validators + blind judges -> up to 2 repair rewrites (before any images or voice)
    const base = {
      topic: input.topic, format: input.format, durationSec: input.durationSec,
      archetype: archetype ? `${archetype.name} — ${archetype.formula}` : "Best fit", style: input.style, deployment: s.scriptDeployment,
      facts: factText, research: researchText, hook: hb.line, kid: advanced,
    }
    const evaluate = async (p: Plan) => {
      const story = {
        scenes: p.scenes.map((x) => ({ beat: x.beat, narration: x.narration, characters: x.characters, shot: x.shot, money: x.money, loop_opened: x.loop_opened, loop_closed: x.loop_closed })),
        anchors: rs.anchors, question: p.question || rs.question, hero: p.hero?.name ? p.hero : rs.hero, cast: p.characters.map((c) => ({ name: c.name, role: c.role })), durationSec: input.durationSec, kid: advanced,
      };
      const report = validateStory(story);
      const ht = hookTextIssues(p.hookText, p.scenes[0]?.narration ?? "");
      if (ht.length) report.checks.push({ id: "HOOKTEXT", pass: false, msg: ht.join("; ") }), report.failed.push({ id: "HOOKTEXT", pass: false, msg: ht.join("; ") });
      const opening = splitSentences(p.scenes.map((x) => x.narration).join(" "))[0] ?? "";
      const hi = advanced ? advancedOpeningIssues(opening, rs.anchors.subject) : hookIssues(opening, rs.anchors, factText);
      report.checks.push({ id: "HOOK", pass: !hi.length, msg: hi.length ? `Hook: ${hi.join("; ")}` : "Hook rules met" });
      if (hi.length) report.failed.push({ id: "HOOK", pass: false, msg: hi.join("; ") });
      const full = p.scenes.map((x) => x.narration).join(" ");
      const firstShots = (sec: number) => { const st = sceneStarts(story.scenes); return p.scenes.filter((_, i) => (st[i] ?? 0) < sec).map((x) => `[picture: ${x.image_prompt.slice(0, 200)}]`).join(" "); };
      const judge = await judgeScript({ checkpoint: api.call, data: {
        first3: `${p.hookText ? `On-screen text: "${p.hookText}". ` : ""}Narration: "${spokenBy(story.scenes, 3.2)}" ${firstShots(3.2)}`,
        first15: `Narration: "${spokenBy(story.scenes, 15)}" ${firstShots(15)}`,
        full, truth: `${researchText}\nHook: ${hb.line}`,
        shots: p.scenes.map((x, i) => `${i}: ${x.narration} => ${x.image_prompt.slice(0, 220)}`).join("\n"),
        deployment: s.scriptDeployment, advanced,
      } });
      if (judge?.filler.length && judge.filler.length > 2) report.failed.push({ id: "V8j", pass: false, msg: `V8 new info (judge): "${judge.filler.slice(0, 2).join('", "')}" add nothing new` });
      const gate = storyScore(report, judge, p.scenes.length, { strict: advanced });
      return { report, judge, gate };
    };
    const planWait = input.format === "short" ? STEP_TIMEOUT_MS : 8 * 60_000; // a 10-20 min script is a much longer answer
    let plan = autoFixPlan(await api.call(() => generatePlan({ data: base })));
    let ev = await evaluate(plan);
    let draft = plan, draftEv = ev;
    const tries = (input.engine === "cartoon" || advanced) ? 3 : 2; // cartoon only renders a ready story, so give it one more rewrite
    for (let attempt = 1; attempt <= tries && !ev.gate.ready; attempt++) {
      await up({ progress: 8 + attempt, detail: `Story score ${ev.gate.score}/100 — rewriting to fix ${ev.gate.blockers.length} issue${ev.gate.blockers.length === 1 ? "" : "s"} (try ${attempt}/${tries})…` });
      const repairedRaw = await api.call(() => generatePlan({ data: { ...base, repair: repairBrief(draft, draftEv.gate, rs.anchors, { advanced }) } }));
      const repaired = repairedRaw ? autoFixPlan(repairedRaw) : repairedRaw;
      if (!repaired) break;
      const ev2 = await evaluate(repaired);
      draft = repaired; draftEv = ev2;
      if (preferRepair(ev.gate, ev2.gate)) { plan = repaired; ev = ev2; }
    }
    await up({ checks: ev.gate.blockers, judges: ev.judge ? { passA: ev.judge.passA, passB: ev.judge.passB, passC: ev.judge.passC, payoff: ev.judge.payoff, weakest: ev.judge.weakest } : undefined });
    plan = { ...plan, scenes: splitLongScenes(plan.scenes) };
      const saved: ScriptCheckpoint = { plan, gate: ev.gate, report: { revealSec: ev.report.revealSec, shotMix: ev.report.shotMix }, judgeOk: !!ev.judge, hookType: hb.type, moneyShot: rs.moneyShot };
      // Persist the paid script at once so a closed page can resume without rewriting it.
      await up({ scriptCheckpoint: saved });
      return saved;
    };
