// Long-form writer: packaging first, then the outline-first script. Written with injected calls so the whole flow is testable without a model.
// Any step that cannot finish raises LongFormUnavailable; the pipeline then falls back to the single-call writer, so a video never stalls here.
import type { Plan } from '@/lib/pipeline.functions';
import { lockConcept, promiseBrief, type PackagingConcept, type ScoredConcept } from './packaging';
import { applyPatches, assembleLongScript, longScriptIssues, toPlan, weakLines, withColdOpen,
  type ChapterDraft, type Dossier, type LongIssue, type LongScript, type Outline } from './long-script';

export class LongFormUnavailable extends Error {}

export interface LongFormCalls {
  packaging(a: { topic: string; facts: string; research: string; past: string[] }): Promise<{ concepts: PackagingConcept[] }>;
  dossier(a: { topic: string; facts: string; research: string }): Promise<Dossier>;
  outline(a: { topic: string; promise: string; title: string; hook: string; durationSec: number; dossier: Dossier; archetype: string }): Promise<Outline>;
  chapter(a: { topic: string; title: string; index: number; outline: Outline; dossier: Dossier; style: string; priorLine: string; hook: string; first: boolean }): Promise<ChapterDraft>;
  sag(a: { lines: { scene: number; text: string }[]; problems: string[] }): Promise<{ patches: { scene: number; narration: string }[] }>;
  coldOpen(a: { topic: string; title: string; outline: Outline; style: string }): Promise<{ scenes: { narration: string; image_prompt: string; characters: string[] }[]; titleSubtitle: string }>;
}

export interface LongFormInput {
  topic: string; durationSec: number; archetype: string; style: string; facts: string; research: string; hook: string; hookText: string; description: string;
  hero: { name: string; role: string; want: string }; question: string; premise: string; palette: string; pastTitles: string[]; sources: string[];
}
export interface LongFormResult { plan: Plan; script: LongScript; issues: LongIssue[]; locked: ScoredConcept | null; outline: Outline; steps: string[] }

async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; await fn(items[i]!, i); } }));
}
async function twice<T>(fn: () => Promise<T>): Promise<T> { try { return await fn(); } catch { return await fn(); } }

export async function writeLongForm(inp: LongFormInput, calls: LongFormCalls, progress: (detail: string) => void = () => undefined): Promise<LongFormResult> {
  const steps: string[] = [];
  // 1) packaging first (ten title + thumbnail concepts, the best locked before the script exists) and 2) a real dossier, asked at the same time
  progress('Choosing the title promise and researching the dossier…');
  const packagingP = twice(() => calls.packaging({ topic: inp.topic, facts: inp.facts, research: inp.research, past: inp.pastTitles }))
    .then(r => { const c = lockConcept(r.concepts, inp.pastTitles); steps.push(c ? `packaging locked: ${c.title}` : 'packaging: no concept good enough'); return c; })
    .catch((e: unknown) => { steps.push(`packaging skipped: ${e instanceof Error ? e.message : 'failed'}`); return null; });
  const dossierP = twice(() => calls.dossier({ topic: inp.topic, facts: inp.facts, research: inp.research }));
  let dossier: Dossier;
  const [locked, dossierResult] = await Promise.all([packagingP, dossierP.then(d => ({ d }), (e: unknown) => ({ e }))]);
  if ('e' in dossierResult) throw new LongFormUnavailable(`dossier: ${dossierResult.e instanceof Error ? dossierResult.e.message : 'failed'}`);
  dossier = dossierResult.d;
  if (dossier.facts.length < 8) throw new LongFormUnavailable('dossier too thin');
  const title = locked?.title ?? inp.topic;
  const promise = locked ? promiseBrief(locked) : `The video must deliver what its title promises: ${inp.premise}`;
  // 3) outline: chapters with their own question, escalation, twist, cold open, final reframe
  progress('Outlining the chapters…');
  let outline: Outline;
  try { outline = await twice(() => calls.outline({ topic: inp.topic, promise, title, hook: inp.hook, durationSec: inp.durationSec, dossier, archetype: inp.archetype })); } catch (e) { throw new LongFormUnavailable(`outline: ${e instanceof Error ? e.message : 'failed'}`); }
  // 4) every chapter written side by side, each knowing the whole outline
  const drafts: ChapterDraft[] = new Array(outline.chapters.length);
  let done = 0;
  await pool(outline.chapters.map((_, i) => i), 4, async i => {
    const prior = i > 0 ? `${outline.chapters[i - 1]!.title}: ${outline.chapters[i - 1]!.escalation}` : '';
    try { drafts[i] = await twice(() => calls.chapter({ topic: inp.topic, title, index: i, outline, dossier, style: inp.style, priorLine: prior, hook: inp.hook, first: i === 0 })); }
    catch (e) { throw new LongFormUnavailable(`chapter ${i + 1}: ${e instanceof Error ? e.message : 'failed'}`); }
    progress(`Writing chapters · ${++done}/${outline.chapters.length}`);
  });
  // 5) one pass that rewrites the weakest lines
  let script = assembleLongScript({ chapters: drafts, outline });
  let issues = longScriptIssues(script.scenes, inp.durationSec);
  progress('Rewriting the weakest lines…');
  try {
    const weak = weakLines(script.scenes, issues);
    if (weak.length) {
      const { patches } = await calls.sag({ lines: weak, problems: issues.map(i => i.msg) });
      const applied = applyPatches(script.scenes, patches);
      if (applied.applied) {
        const patched = { ...script, scenes: applied.scenes };
        const after = longScriptIssues(patched.scenes, inp.durationSec);
        if (after.length <= issues.length) { script = patched; issues = after; steps.push(`sag pass rewrote ${applied.applied} lines`); }
      }
    }
  } catch (e) { steps.push(`sag pass skipped: ${e instanceof Error ? e.message : 'failed'}`); }
  // 6) the cold open: a trailer of the strongest moment, then the title
  let subtitle = '';
  progress('Writing the cold open…');
  try {
    const cold = await twice(() => calls.coldOpen({ topic: inp.topic, title, outline, style: inp.style }));
    script = withColdOpen(script, cold.scenes);
    subtitle = cold.titleSubtitle;
    steps.push(`cold open: ${cold.scenes.length} scenes`);
  } catch (e) { steps.push(`cold open skipped: ${e instanceof Error ? e.message : 'failed'}`); }
  issues = longScriptIssues(script.scenes.filter(s => !s.cold), inp.durationSec);
  const characters = outline.characters.length ? outline.characters : [{ name: inp.hero.name || 'The narrator', role: inp.hero.role || 'subject', look: 'a person of the period in plain clothing' }];
  const plan = toPlan({ script, title, description: inp.description, hero: inp.hero, question: inp.question, premise: inp.premise, characters, palette: inp.palette, hookText: inp.hookText });
  plan.documentary = { chapters: script.chapters, coldCount: script.coldCount, subtitle, sources: inp.sources, ...(locked ? { packaging: { title: locked.title, thumb_text: locked.thumb_text, focal_subject: locked.focal_subject, emotion: locked.emotion, layout: locked.layout, promise: locked.promise } } : {}) };
  return { plan, script, issues, locked, outline, steps };
}
