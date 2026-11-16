import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Copy, Download, FilePenLine, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Page, input, label } from '@/components/page';
import { Button } from '@/components/ui/button';
import { TopicLibrary } from '@/components/topic-library';
import { useStore, STYLES } from '@/lib/store';
import { FACT_TOPICS } from '@/lib/topic-catalog';
import { topicHistoryQuery } from '@/lib/topics-query';
import { ARCHETYPES } from '@/lib/viral-brain';
import { factCheck, researchStory, generateHooks, generatePlan, judgeScript, type Plan, type FactSheet } from '@/lib/pipeline.functions';
import { hookIssues, hookTextIssues, splitSentences, spokenBy, validateStory, storyScore, wc, type GateResult } from '@/lib/story-v2';
import { motionPrompt, scriptExport, scriptTimeline } from '@/lib/script-writer';
import { autoFixPlan, eligibleHooks, preferRepair, repairBrief } from '@/lib/script-repair';

export const Route = createFileRoute('/_authenticated/script-writer')({
  head: () => ({ meta: [
    { title: 'Script Writer — Chronicle Studio' },
    { name: 'description', content: 'Write original fact and history scripts with scene prompts, narration, camera direction and sound cues.' },
    { property: 'og:title', content: 'Script Writer — Chronicle Studio' },
    { property: 'og:description', content: 'Detailed story scripts and production plans for your next history video.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(topicHistoryQuery),
  component: ScriptWriter,
});

function ScriptWriter() {
  const settings = useStore(s => s.settings);
  const videos = useStore(s => s.videos);
  const { data: history } = useSuspenseQuery(topicHistoryQuery);
  const [topic, setTopic] = useState('');
  const [topicId, setTopicId] = useState<string>();
  const [format, setFormat] = useState<'short' | 'long'>('short');
  const [duration, setDuration] = useState(60);
  const [style, setStyle] = useState(settings.defaultStyle);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ plan: Plan; facts: FactSheet; gate: GateResult; style: string; format: 'short' | 'long' }>();
  const checkFacts = useServerFn(factCheck), research = useServerFn(researchStory), hooks = useServerFn(generateHooks), write = useServerFn(generatePlan), judge = useServerFn(judgeScript);
  const generate = async () => {
    if (stage || !topic.trim()) return;
    setError('');
    try {
      const deployment = settings.scriptDeployment;
      setStage('Checking facts…');
      const facts = await checkFacts({ data: { topic: topic.trim(), deployment } });
      const source = FACT_TOPICS.find(t => t.id === topicId);
      const factText = `${source ? `Research starting point: ${source.fact} — ${source.source}. Verify independently.\n` : ''}${JSON.stringify(facts)}`;
      setStage('Finding the hero and payoff…');
      const rs = await research({ data: { topic, facts: factText, deployment } });
      setStage('Writing 10 hooks…');
      const candidates = await hooks({ data: { topic, facts: factText, research: JSON.stringify(rs), deployment, shape: format === 'short' } });
      const ranked = eligibleHooks(candidates.all, rs.anchors, factText).sort((a, b) => (b.curiosity + b.clarity + b.visualness + b.speakability) - (a.curiosity + a.clarity + a.visualness + a.speakability));
      const hook = ranked[0];
      if (!hook) throw Error('No opening passed the hook checks. Choose a clearer topic and try again.');
      const arch = ARCHETYPES.find(a => a.id === source?.archetype);
      const base = { topic, format, durationSec: duration, style, deployment, facts: factText, research: JSON.stringify(rs), hook: hook.line, shape: format === 'short', archetype: arch ? `${arch.name} — ${arch.formula}` : 'Best fit' };
      setStage('Writing narration and scenes…');
      let plan = autoFixPlan(await write({ data: base }));
      const evaluate = async (p: Plan) => {
        const full = p.scenes.map(s => s.narration).join(' ');
        const report = validateStory({ scenes: p.scenes, anchors: rs.anchors, question: p.question, hero: p.hero, cast: p.characters, durationSec: duration, shape: format === 'short' });
        const issues = [...hookIssues(splitSentences(full)[0] ?? '', rs.anchors, factText), ...hookTextIssues(p.hookText, p.scenes[0]?.narration ?? '')];
        for (const msg of issues) { const check = { id: 'HOOK', pass: false, msg }; report.checks.push(check); report.failed.push(check); }
        setStage('Reviewing story clarity and visual direction…');
        const j = await judge({ data: { first3: `${p.hookText} ${spokenBy(p.scenes, 3.2)} ${p.scenes[0]?.image_prompt ?? ''}`, first15: spokenBy(p.scenes, 15), full, truth: JSON.stringify(rs), shots: p.scenes.map((s, i) => `${i}: ${s.narration} => ${s.image_prompt}`).join('\n'), deployment, shape: format === 'short' } });
        return storyScore(report, j, p.scenes.length);
      };
      let gate = await evaluate(plan);
      let draft = plan, draftGate = gate;
      for (let attempt = 1; attempt <= 2 && !gate.ready; attempt++) {
        setStage(`Improving the draft (${attempt}/2)…`);
        const revised = autoFixPlan(await write({ data: { ...base, repair: repairBrief(draft, draftGate, rs.anchors, { shape: format === 'short' }) } }));
        const next = await evaluate(revised);
        draft = revised; draftGate = next;
        if (preferRepair(gate, next)) { plan = revised; gate = next; }
      }
      setResult({ plan, facts, gate, style, format });
    } catch (e) { setError(e instanceof Error ? e.message : 'Script generation failed'); }
    finally { setStage(''); }
  };
  const exportText = result ? scriptExport(result.plan, result.facts, result.style, result.format, result.gate.score, result.gate.blockers) : '';
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Clipboard unavailable; download the script instead.'); } };
  const download = () => { const url = URL.createObjectURL(new Blob([exportText], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${result?.plan.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 80) || 'script'}.md`; a.click(); URL.revokeObjectURL(url); };
  return <Page eyebrow="Studio" title="Script Writer" actions={result && <><Button variant="outline" onClick={() => void copy(exportText)}><Copy />Copy full script</Button><Button variant="outline" onClick={download}><Download />Download</Button></>}>
    <div className="space-y-6">
      <section className="border-b pb-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="script-format" className={label}>Format</label><select id="script-format" className={`${input} mt-2`} disabled={!!stage} value={format} onChange={e => { const f = e.target.value === 'long' ? 'long' : 'short'; setFormat(f); setDuration(f === 'short' ? 60 : 480); }}><option value="short">Short / Reel · 9:16</option><option value="long">Long-form · 16:9</option></select></div>
          <div><label htmlFor="script-duration" className={label}>Length</label><select id="script-duration" className={`${input} mt-2`} disabled={!!stage} value={duration} onChange={e => setDuration(Number(e.target.value))}>{(format === 'short' ? [30, 45, 60, 90] : [180, 300, 480, 600, 900]).map(d => <option key={d} value={d}>{format === 'short' ? `${d} seconds` : `${d / 60} minutes`}</option>)}</select></div>
          <div><label htmlFor="script-style" className={label}>Visual style</label><select id="script-style" className={`${input} mt-2`} disabled={!!stage} value={style} onChange={e => setStyle(e.target.value)}>{STYLES.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <TopicLibrary library={FACT_TOPICS} used={[...history, ...videos.map(v => ({ topic: v.input.topic, topicId: v.input.topicId, status: v.status }))]} selected={topic} onSelect={t => { if (!stage) { setTopic(t.title); setTopicId(t.id); } }} />
        <label htmlFor="script-topic" className={`${label} mt-5 block`}>Selected topic / custom topic</label>
        <input id="script-topic" maxLength={300} disabled={!!stage} className={`${input} mt-2`} value={topic} onChange={e => { setTopic(e.target.value); setTopicId(undefined); }} placeholder="Your history or science topic" />
        <Button className="mt-4" disabled={!!stage || !topic.trim()} onClick={() => void generate()}>{stage ? <Loader2 className="animate-spin" /> : <Sparkles />}{stage || 'Write detailed script'}</Button>
        {error && <p role="alert" className="mt-3 break-words text-sm text-destructive">{error}</p>}
      </section>
      {!result ? <div className="flex items-center gap-3 py-8 text-muted-foreground"><FilePenLine /><span>No script yet</span></div> : <article className="min-w-0 space-y-6" aria-label="Generated script">
        <header><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-bold">{result.plan.title}</h2><span className={result.gate.ready ? 'text-success' : 'text-warning'}>{result.gate.score}/100 · {result.gate.ready ? 'Ready' : 'Not ready'}</span></div><p className="mt-2 text-sm text-muted-foreground">{result.plan.description}</p></header>
        {!!result.gate.blockers.length && <details className="border-b pb-4"><summary className="cursor-pointer text-sm font-semibold">Review notes ({result.gate.blockers.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{result.gate.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></details>}
        <section><div className="flex items-center justify-between"><h3 className="font-bold">Full narration</h3><Button variant="ghost" size="sm" onClick={() => void copy(result.plan.scenes.map(s => s.narration).join(' '))}><Copy />Copy narration</Button></div><p className="mt-2 text-xs text-muted-foreground">{wc(result.plan.scenes.map(s => s.narration).join(' '))} words · Atlas · 153 words/min</p><p className="mt-3 whitespace-pre-wrap leading-relaxed">{result.plan.scenes.map(s => s.narration).join(' ')}</p></section>
        <section><h3 className="font-bold">Story & cast</h3><p className="mt-2">{result.plan.premise}</p><p className="mt-1 text-sm text-muted-foreground">{result.plan.question}</p><div className="mt-3 space-y-2">{result.plan.characters.map(c => <p key={c.name} className="text-sm"><b>{c.name} · {c.role}</b> — {c.look}</p>)}</div></section>
        <section><h3 className="font-bold">Scene direction</h3><p className="mt-1 text-xs text-muted-foreground">Estimated narration timings · {result.plan.palette}</p><div className="mt-3 divide-y">{scriptTimeline(result.plan).map(s => <details key={s.index} className="py-4" open={s.index === 1}><summary className="cursor-pointer text-sm font-semibold">Scene {s.index} · {s.start.toFixed(1)}–{s.end.toFixed(1)}s · {s.beat}</summary><div className="mt-3 space-y-3 text-sm"><p><b>Narration:</b> {s.narration}</p><p><b>Image:</b> {s.image_prompt}</p><p><b>Motion:</b> {motionPrompt(result.plan, s, result.style, result.format)}</p><p><b>Sound:</b> {s.sfx} · <b>Music:</b> {s.mood}</p><Button variant="outline" size="sm" onClick={() => void copy(motionPrompt(result.plan, s, result.style, result.format))}><Copy />Copy motion prompt</Button></div></details>)}</div></section>
        <section className="border-t pt-4"><h3 className="font-bold">Research references</h3><p className="mt-1 text-xs text-muted-foreground">AI-suggested references; verify claims before publishing.</p>{result.facts.claims.map((c, i) => <div key={i} className="mt-3 text-sm"><p>{c.claim} <span className="text-muted-foreground">· {c.confidence} confidence</span></p><p className="mt-1 break-words text-xs text-muted-foreground">{c.sources.join(' · ')}</p></div>)}</section>
      </article>}
    </div>
  </Page>;
}