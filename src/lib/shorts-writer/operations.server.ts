/** Shorts Writer v4 AI steps: each is its own strict-JSON Azure call (owner's task, Nov 16 2026). Server-only. */
import { azureJson } from '@/lib/pipeline-operations.server';
import { CORE, GOLD_BLOCK, STYLE } from './prompts';
import { budget, type Critic, type Fact } from './checks';

const S = { type: 'string' } as const, B = { type: 'boolean' } as const, N = { type: 'number' } as const;
const obj = (props: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const arr = (items: unknown) => ({ type: 'array', items });

export interface Spine { premise: string; hook_contradiction: string; problem: string; attempts: string[]; twist: string; payoff: string; closing_line: string }
export interface HookCandidate { line: string; contradiction: string; reveals_answer: boolean; curiosity: number }

const factList = (facts: Fact[]) => facts.filter((f) => f.certain).map((f) => `${f.id}: ${f.text}`).join('\n');

export async function factSheetOp(d: { topic: string; deployment: string; research?: string }) {
  const r = await azureJson<{ facts: Fact[] }>(d.deployment,
    `You are a careful history and science fact checker. Produce 8-12 specific, checkable facts about the topic: who, what, when, where, numbers and the result. Each fact is one plain sentence. Prefer the STORY facts a narrator needs: the exact moment and place, who did what, the objects involved, the quantities, what people saw happen, what was at stake and how it ended. Always include, when reliable sources give them: the human MOTIVE (why someone did it, what they wanted or feared), the stakes, and concrete numbers (sales, sizes, counts, distances). Skip bibliographic details (journal titles, proceedings, publication records) unless they are the story. Mark certain=true only for facts that reliable sources agree on; anything disputed, legendary or approximate is certain=false. No invented names, dates or quotes. Ids f1, f2, ...`,
    `Topic: ${d.topic}${d.research ? `\nResearch notes (verify; do not copy blindly):\n${d.research}` : ''}`,
    'fact_sheet', obj({ facts: arr(obj({ id: S, text: S, certain: B })) }), 'Fact sheet', 'low');
  return r.facts;
}

export async function spineOp(d: { topic: string; facts: Fact[]; deployment: string; avoid?: Spine[] }) {
  return azureJson<Spine>(d.deployment,
    `You plan one true story for a YouTube Short. ${CORE}
Return one short story spine:
- premise: one sentence, plain words
- hook_contradiction: the surprising claim that creates a question, WITHOUT answering it
- problem: what's at stake / who is stuck
- attempts: 2-3 things tried, each leading to the next ("so", "but", "then")
- twist: the moment the viewer's assumption flips
- payoff: how it ended, with a concrete number or consequence
- closing_line: a reframing insight in under 15 words that does NOT repeat the hook's wording
Every step must logically cause the next. It must be a STORY, not a chronology: someone wants something or is stuck (say why), their plan or the event escalates, and the twist reveals the hidden reason, trick or consequence that flips what the viewer assumed. The payoff carries a concrete number or consequence. Pick ONE thread; leave out facts it doesn't need. Use only the certain facts.`,
    `Topic: ${d.topic}\nCERTAIN FACTS:\n${factList(d.facts)}${d.avoid?.length ? `\nWrite a DIFFERENT spine from these earlier ones, which did not produce a coherent script:\n${JSON.stringify(d.avoid)}` : ''}`,
    'story_spine', obj({ premise: S, hook_contradiction: S, problem: S, attempts: arr(S), twist: S, payoff: S, closing_line: S }), 'Story spine', 'medium');
}

export async function spineCheckOp(d: { spine: Spine; facts: Fact[]; deployment: string }) {
  return azureJson<{ ok: boolean; broken_links: string[]; unsupported: string[] }>(d.deployment,
    `You check a story spine for a Short. ok=true only if it is a story with a clear want or stakes (not a chronology of events), the twist genuinely flips an assumption, each step logically causes the next (problem -> attempts -> twist -> payoff -> closing), the hook contradiction does not answer itself, the closing line does not reuse the hook's wording, and every claim is supported by the certain facts. List each broken link and each unsupported claim.`,
    `CERTAIN FACTS:\n${factList(d.facts)}\nSPINE:\n${JSON.stringify(d.spine)}`,
    'spine_check', obj({ ok: B, broken_links: arr(S), unsupported: arr(S) }), 'Spine check', 'low');
}

export async function hooksOp(d: { topic: string; facts: Fact[]; spine: Spine; deployment: string; feedback?: string }) {
  const r = await azureJson<{ hooks: HookCandidate[] }>(d.deployment,
    `Write 10 different hooks for a YouTube Short. Each: 8-12 words, speakable in about 3 seconds, a surprising contradiction between two concrete things, and it must NOT reveal the answer or mechanism. Test: does it make the viewer need the next sentence? No questions. No "Did you know". No hooks that explain the trick (bad: "Rail engineers left gaps so trains stayed on straight rails" gives the reason away). Good: "Hannibal was trapped, so he strapped fire to two thousand oxen." / "A gift with no battery spied on America for seven years." Write it as one plain spoken sentence with a subject and verb (never two clipped halves joined by a semicolon). A stranger must understand it with zero context. BAD: "New York Sun found life; Edinburgh Journal had already died." (no context, clipped) / "Rails lengthen 360 millimeters; engineers welded kilometers without expansion joints." (jargon, clipped) / "A cook dumped greasy water; the leeward sea turned glassy." (who? where?). Use only certain facts. For each, name the contradiction, say honestly whether it reveals the answer, and score curiosity 1-10.`,
    `Topic: ${d.topic}\nCERTAIN FACTS:\n${factList(d.facts)}\nSPINE:\n${JSON.stringify(d.spine)}${d.feedback ? `\n${d.feedback}` : ''}`,
    'hooks', obj({ hooks: arr(obj({ line: S, contradiction: S, reveals_answer: B, curiosity: N })) }), 'Hook writer', 'medium');
  return r.hooks;
}

export async function pickHookOp(d: { hooks: string[]; spine: Spine; deployment: string }) {
  return azureJson<{ index: number; reason: string }>(d.deployment,
    `You are a YouTube Shorts editor. Pick the ONE hook that most makes a cold viewer need the next sentence, is clearest on first listen with zero context (plain full sentence, no jargon, no clipped semicolon halves), and does not give away the answer. Compare against the gold hooks "Hannibal was trapped, so he strapped fire to two thousand oxen." and "A gift with no battery spied on America for seven years." Return its 0-based index.`,
    `SPINE:\n${JSON.stringify(d.spine)}\nHOOKS:\n${d.hooks.map((h, i) => `${i}: ${h}`).join('\n')}`,
    'hook_pick', obj({ index: N, reason: S }), 'Hook picker', 'low');
}

export async function scriptOp(d: { topic: string; facts: Fact[]; spine: Spine; hook: string; durationSec: number; deployment: string; kid?: boolean }) {
  const b = budget(d.durationSec);
  return azureJson<{ lines: string[] }>(d.deployment,
    `You write the voice-over for a ${d.durationSec}-second YouTube Short. ${CORE}\n${STYLE}\nLENGTH: ${b.minWords}-${b.maxWords} words in ${b.minLines}-${b.maxLines} lines (a machine counts). One line = one spoken thought (it may hold two very short sentences like "Readers loved it. Sales exploded.").${d.kid ? '\nAUDIENCE: use only words an 8-year-old knows; explain any needed term in the same line.' : ''}\n\n${GOLD_BLOCK}`,
    `Topic: ${d.topic}\nCERTAIN FACTS (the only facts you may use):\n${factList(d.facts)}\nSTORY SPINE:\n${JSON.stringify(d.spine)}\nLOCKED HOOK (line 1, word for word): ${d.hook}\nReturn the script as lines.`,
    'script', obj({ lines: arr(S) }), 'Script writer', 'high');
}

export async function criticOp(d: { lines: string[]; facts: Fact[]; durationSec: number; deployment: string }) {
  return azureJson<Critic>(d.deployment,
    `You are a demanding viewer reading a YouTube Short script ONCE, as if hearing it. For EACH line (n = 1-based) answer: follows = does it follow logically from the previous line? clear = is it clear on first listen (no "what does that mean?")? narration = is it narration (facts/actions) rather than a description of a scene or camera? new_fact = does it add a new fact or story step (false for filler or a restatement)? Give a short reason for any false.
Then: hook_reveals_answer (does line 1 give away the answer/mechanism?), ending_makes_sense, ending_copies_hook (does the last line copy the hook's wording or structure?), real_twist (does the story have a real assumption flip?). boring_lines = line numbers where a cold viewer would lose interest or swipe (report-like, no stakes, no new turn). The LAST line is a reframe: judge it on clarity and meaning, not on new_fact. Score coherence, clarity and curiosity 1-10 against the gold examples below (they are 9-10). CALIBRATION: a script that reads like a report or lecture (publication details, "he reported that", "he attributed", abstract nouns, textbook phrasing) scores curiosity 6 or lower and coherence 7 or lower, and its report-style lines get new_fact=false (no story step). A compressed or abstract line a listener can't picture on first hearing ("Stacked credentials can camouflage fiction", "Exposure rested on two simple facts") gets clear=false. Any jargon or technical term a 12-year-old wouldn't know gets clear=false. A line that crams several facts, numbers or method names gets clear=false. The gold examples below score 9-10; a script that would hold a cold viewer less well than them scores curiosity 7 or lower. A hook that names a vague category instead of two concrete clashing things scores curiosity 6 or lower. Be strict but fair: intentional rhythm fragments with meaning ("No wires. No battery. Nothing.") are clear narration.\n\n${GOLD_BLOCK}`,
    `CERTAIN FACTS:\n${factList(d.facts)}\nSCRIPT:\n${d.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
    'critic', obj({ lines: arr(obj({ n: N, follows: B, clear: B, narration: B, new_fact: B, reason: S })), hook_reveals_answer: B, ending_makes_sense: B, ending_copies_hook: B, real_twist: B, boring_lines: arr(N), coherence: N, clarity: N, curiosity: N, summary: S }), 'Script critic', 'high');
}

export async function rewriteLinesOp(d: { lines: string[]; flagged: { n: number; reason: string }[]; problems: string[]; facts: Fact[]; spine: Spine; durationSec: number; deployment: string; kid?: boolean }) {
  const b = budget(d.durationSec);
  return azureJson<{ lines: { n: number; text: string }[] }>(d.deployment,
    `You fix a YouTube Short script. Rewrite ONLY the flagged lines; every other line and line 1 (the locked hook) stay exactly as they are. ${CORE}\n${STYLE}\nA flagged line may be returned as an empty string to delete it, if the story reads better without it. Keep the whole script within ${b.minWords}-${b.maxWords} words.${d.kid ? ' Use only words an 8-year-old knows.' : ''}\n\n${GOLD_BLOCK}`,
    `CERTAIN FACTS:\n${factList(d.facts)}\nSPINE:\n${JSON.stringify(d.spine)}\nSCRIPT:\n${d.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}\nFLAGGED LINES:\n${d.flagged.map((f) => `${f.n}: ${f.reason}`).join('\n')}${d.problems.length ? `\nOTHER PROBLEMS TO FIX THROUGH THE FLAGGED LINES:\n${d.problems.join('\n')}` : ''}\nReturn each flagged line number with its new text.`,
    'line_rewrite', obj({ lines: arr(obj({ n: N, text: S })) }), 'Line rewrite', 'medium');
}
