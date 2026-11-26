import { packagingOperation, dossierOperation, outlineOperation, chapterOperation, sagOperation, coldOpenOperation } from './documentary/documentary.server';
import { lockConcept, promiseBrief } from './documentary/packaging';
import { assembleLongScript, applyPatches, longScriptIssues, toPlan, weakLines, withColdOpen, type ChapterDraft } from './documentary/long-script';
import type { ScriptAPI } from './generation-script.server';
import type { LongFormInput } from './documentary/long-form';

/** Same documentary steps and pure assembly as the browser, serialized for fenced checkpoints. */
export async function backgroundDocumentaryScript(input: LongFormInput, deployment: string, api: ScriptAPI) {
  const concepts = await api.call(() => packagingOperation({ data: { topic: input.topic, facts: input.facts, research: input.research, past: input.pastTitles, deployment } }));
  const locked = lockConcept(concepts.concepts, input.pastTitles);
  const title = locked?.title ?? input.topic;
  const dossier = await api.call(() => dossierOperation({ data: { topic: input.topic, facts: input.facts, research: input.research, deployment } }));
  if (dossier.facts.length < 8) throw Error('The documentary dossier is too thin for automatic publication');
  const outline = await api.call(() => outlineOperation({ data: { topic: input.topic, title, promise: locked ? promiseBrief(locked) : input.premise, hook: input.hook, durationSec: input.durationSec, dossier, archetype: input.archetype, deployment } }));
  const drafts: ChapterDraft[] = [];
  for (let index = 0; index < outline.chapters.length; index++) {
    const prev = outline.chapters[index - 1];
    drafts.push(await api.call(() => chapterOperation({ data: { topic: input.topic, title, index, outline, dossier, style: input.style, priorLine: prev ? `${prev.title}: ${prev.escalation}` : '', hook: input.hook, first: index === 0, deployment } })));
  }
  let script = assembleLongScript({ chapters: drafts, outline });
  const issues = longScriptIssues(script.scenes, input.durationSec), weak = weakLines(script.scenes, issues);
  if (weak.length) {
    const patches = await api.call(() => sagOperation({ data: { lines: weak, problems: issues.map(i => i.msg), deployment } }));
    const applied = applyPatches(script.scenes, patches.patches);
    if (applied.applied && longScriptIssues(applied.scenes, input.durationSec).length <= issues.length) script = { ...script, scenes: applied.scenes };
  }
  const cold = await api.call(() => coldOpenOperation({ data: { topic: input.topic, title, outline, style: input.style, deployment } }));
  script = withColdOpen(script, cold.scenes);
  const plan = toPlan({ script, title, description: input.description, hero: input.hero, question: input.question, premise: input.premise, characters: outline.characters, palette: input.palette, hookText: input.hookText });
  plan.documentary = { chapters: script.chapters, coldCount: script.coldCount, subtitle: cold.titleSubtitle, sources: input.sources, ...(locked ? { packaging: { title: locked.title, thumb_text: locked.thumb_text, focal_subject: locked.focal_subject, emotion: locked.emotion, layout: locked.layout, promise: locked.promise } } : {}) };
  return { plan, issues: longScriptIssues(script.scenes.filter(s => !s.cold), input.durationSec) };
}