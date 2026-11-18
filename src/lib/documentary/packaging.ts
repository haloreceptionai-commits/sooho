// Packaging first: ten title + thumbnail concepts are written and scored BEFORE the script, the best one is locked, and the script
// must deliver exactly that promise. A title that makes a curiosity gap and a thumbnail with one focal point decide the click; the video pays it off.
export interface PackagingConcept { title: string; thumb_text: string; focal_subject: string; emotion: string; layout: 'face' | 'object' | 'split' | 'map' | 'versus'; promise: string; gap: string }
export interface ScoredConcept extends PackagingConcept { score: number; notes: string[] }

const S = { type: 'string' } as const;
export const packagingSchema = {
  type: 'object', additionalProperties: false, required: ['concepts'],
  properties: { concepts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'thumb_text', 'focal_subject', 'emotion', 'layout', 'promise', 'gap'], properties: {
    title: S, thumb_text: S, focal_subject: S, emotion: S, layout: { type: 'string', enum: ['face', 'object', 'split', 'map', 'versus'] }, promise: S, gap: S } } } },
};

export const packagingPrompt = (topic: string, facts: string, research: string, past: string[]) => ({
  system: `You are a YouTube packaging strategist for fact and history channels. A video's title and thumbnail are written FIRST; the script then delivers them.
Title rules: 35-62 characters, a specific curiosity gap (a person, object or event plus an unresolved oddity), no clickbait lies, no "you won't believe", no ALL CAPS, nothing the video cannot prove.
Good: "The Man Who Sold the Eiffel Tower Twice", "Why Rome Never Conquered This One Valley", "The Bridge That Fell Because of a Wedding".
Thumbnail rules: ONE focal subject, ONE emotion, 1-3 words of text (not a repeat of the title), high contrast, readable on a phone.`,
  user: `Topic: ${topic}\nFacts:\n${facts.slice(0, 3000)}\nResearch:\n${research.slice(0, 2000)}\n${past.length ? `Avoid the style of these earlier titles: ${past.slice(0, 8).join(' | ')}\n` : ''}Write 10 different concepts. "promise" = one sentence on exactly what the video will show or prove (the script must deliver it). "gap" = the question in the viewer's head.`,
});

const BANNED = /(you won'?t believe|shocking|insane|mind[- ]?blowing|gone wrong|secret they|what happened next|\bomg\b)/i;
const GAP = /\b(who|why|how|never|nobody|only|first|last|secret|hidden|twice|really|true story|fell|lost|vanished|disappeared|forgot|wrong|mistake)\b/i;

/** Scores a concept 0-100 on the things that decide clicks and that can be checked without a model. */
export function scoreConcept(c: PackagingConcept): ScoredConcept {
  const notes: string[] = [];
  let score = 50;
  const len = c.title.trim().length;
  if (len >= 35 && len <= 62) score += 12; else { score -= 8; notes.push(`title is ${len} characters (aim 35-62)`); }
  if (GAP.test(c.title)) score += 10; else notes.push('no curiosity word in the title');
  if (/\d/.test(c.title)) score += 4;
  if (/[A-Z][a-z]+/.test(c.title.slice(1))) score += 4;   // a named person, place or object
  if (BANNED.test(c.title) || BANNED.test(c.thumb_text)) { score -= 25; notes.push('clickbait phrasing'); }
  if (c.title === c.title.toUpperCase() && len > 6) { score -= 12; notes.push('all capitals'); }
  const tw = c.thumb_text.trim().split(/\s+/).filter(Boolean).length;
  if (tw >= 1 && tw <= 3) score += 8; else { score -= 8; notes.push('thumbnail text should be 1-3 words'); }
  if (c.thumb_text.trim().toLowerCase() === c.title.trim().toLowerCase()) { score -= 8; notes.push('thumbnail repeats the title'); }
  if (c.promise.trim().split(/\s+/).length < 6) { score -= 10; notes.push('no clear promise'); }
  if (c.focal_subject.trim().split(/\s+/).length > 8) { score -= 4; notes.push('thumbnail has more than one focal point'); }
  return { ...c, score: Math.max(0, Math.min(100, score)), notes };
}

/** The winning concept: best score, with a model-free tie-break on shorter titles. Returns null when nothing is usable. */
export function lockConcept(concepts: PackagingConcept[], usedTitles: string[] = []): ScoredConcept | null {
  const used = new Set(usedTitles.map(t => t.toLowerCase()));
  const ranked = concepts.filter(c => c.title?.trim() && c.promise?.trim() && !used.has(c.title.trim().toLowerCase())).map(scoreConcept)
    .filter(c => c.score >= 45).sort((a, b) => b.score - a.score || a.title.length - b.title.length);
  return ranked[0] ?? null;
}

/** Words the script prompts receive so the video delivers what the title promised. */
export const promiseBrief = (c: ScoredConcept) => `LOCKED PACKAGING. Title: "${c.title}". The viewer clicked because: ${c.gap}. The video must show or prove exactly this: ${c.promise}. Do not change the title; every chapter must move toward paying this off.`;

export const THUMB_LAYOUTS: Record<ScoredConcept['layout'], string> = {
  face: 'one close face filling the right half showing the emotion, subject looking toward the text on the left',
  object: 'one large object centred on a plain high-contrast background, strong rim light',
  split: 'a vertical split: the ordinary thing on the left, the odd or extreme version on the right',
  map: 'a simple glowing region of a map with one marker and one arrow',
  versus: 'two subjects facing each other across the frame with a clear size difference',
};
