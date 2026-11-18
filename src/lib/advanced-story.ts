/** Advanced narration has its own contract rather than competing legacy beat quotas. */
export const ADVANCED_STORY_DIRECTION = `Write an original factual story that makes sense when heard ONCE, without looking at pictures.
OPENING: 4-12 words, no greeting or filler. In the first THREE words put the real subject or a concrete action; finish the sentence with a specific strange fact that creates a reason to listen. Not "This tiny screen", "But here's the", "You won't believe", "In this video", or a vague promise. Do not give away the hidden explanation. Dates and place names go later when needed, never cram them into the hook.
Learn the benchmark's causal storytelling, not its words: a concrete act -> why someone does it -> what changes -> why that change matters -> a satisfying answer. Every sentence follows from the previous one. Use short, natural complete sentences: aim for an average of about 8-9 words per sentence (the benchmark averages 8.4), most between 5 and 12; no sentence over 16 words. A picture cut is NOT a sentence boundary. Read the entire narration aloud before splitting it into scenes.
HISTORY: describe documented actions in order, with real motives and consequences. No invented quotations, rival, failed attempts, countdown or catastrophe. Introduce who/where/when naturally, not a stack of labels.
MECHANISM: the real object is the subject. Explain what physically happens in order and why each step causes the next. No mascot, imaginary danger, human feelings for signals or chips, or forced try/fail story. A person is optional, not a cast quota.
Use everyday English an eight-year-old understands, without baby talk. Explain a necessary technical term immediately using familiar words; never use a difficult word just to sound clever. Pronouns must have one obvious referent. Avoid metaphors that replace the actual mechanism ("weak sky", "space clocks", "lonely GPS", "one cross shouts").
Create curiosity through specific facts and consequences, not constant questions, forced drama or "uh-oh". One central curiosity is enough; it can be a clear spoken question or an obvious puzzle in the opening. The ending plainly resolves it, with a concrete result, not cheering or a repeated summary. Close with a short callback to the opening act or object (the benchmark ends "Four prisons couldn't hold him. One cigarette did."), in at most two sentences.
Write the WHOLE script first. Scene narration must concatenate to that exact script. Each image shows its literal object/action; no unrelated swords, posed crowds or reaction faces. Metadata may describe a real object as hero; do not invent a person to fill a field. Use neutral context/proof beats where no failure or myth exists. Mark the main loop where the real puzzle opens/closes, not at an arbitrary percentage. Facts and uncertainty override all story templates.`;

const FILLER = /^(?:this tiny|this little|but here(?:'s| is)|you won'?t|did you|have you|in this|here is|here'?s why|imagine|welcome)\b/i;
const ACTION = /\b(?:shoots?|fires?|hides?|turns?|points?|pulls?|pushes?|drops?|pours?|moves?|finds?|tracks?|tricks?|stops?|sends?|spins?|cuts?|loads?|throws?|fills?|plants?|steals?|sells?|buys?|carries?|carried|sprays?|sprayed|shot|hid|sold|bought)\b/i;
export function advancedOpeningIssues(line: string, subject: string): string[] {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const first = words.slice(0, 3).join(' ').toLowerCase().replace(/[^a-z ]/g, ' ');
  const subjects = subject.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const issues: string[] = [];
  if (words.length < 4 || words.length > 12) issues.push(`Opening is ${words.length} words; use 4-12 clear words`);
  if (FILLER.test(line.trim())) issues.push('Opening wastes its first three words on filler or a vague object');
  if (!subjects.some(w => new RegExp(`\\b${w}s?\\b`).test(first)) && !ACTION.test(first)) issues.push('First three words need the real subject or a concrete action');
  return issues;
}