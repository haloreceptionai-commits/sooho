// Deterministic editor pass over the Visual Director's scenes, applied before strict validation.
// It only re-uses vocabulary the engine already draws: no new nouns are ever invented.
type Prop = { kind: string; place: string; motion: string; asset?: string };
export type DirectedScene = {
  world: string; shot?: string; move?: string; mood?: string; props?: Prop[]; fx?: string[];
  cues?: { word: number; kind: string }[]; [k: string]: unknown;
};

const CLOSE = new Set(['insert', 'close', 'extreme_close']);
const WET = new Set(['ship', 'storm_sea']);

export function cinematicPass<T extends DirectedScene>(scenes: T[], narration?: string[]): T[] {
  let lastHero: Prop | undefined;
  const edited: T[] = [];
  return scenes.map((input, i) => {
    const s = { ...input, props: [...(input.props ?? [])], fx: [...(input.fx ?? [])] } as T & { props: Prop[]; fx: string[] };
    const prev = edited[i - 1];
    // 1. Every scene has a main prop: carry the story's last hero object forward when the director left the frame empty.
    const sameSubject = !narration || /\b(it|its|this|that|they|their)\b/i.test(narration[i] ?? '');
    if (!s.props.length && lastHero && lastHero.place !== 'hand' && (!prev || prev.world === s.world) && sameSubject) s.props.push({ ...lastHero, motion: 'none' });
    if (prev && prev.world !== s.world) lastHero = undefined;
    if (s.props.length) lastHero = s.props[0];
    // 2. Camera like an editor: never the same shot+move twice, never two static cuts in a row.
    if (prev && prev.shot === s.shot && prev.move === s.move) s.move = s.move === 'push_in' ? 'pull_back' : 'push_in';
    if (prev && prev.move === 'static' && s.move === 'static') s.move = 'push_in';
    // 3. Explainer cutaway: after three non-close shots, show the main object up close.
    const recent = edited.slice(Math.max(0, i - 3), i);
    if (recent.length === 3 && recent.every(r => !CLOSE.has(String(r.shot))) && s.props.length && !CLOSE.has(String(s.shot)) && s.mood !== 'reveal') s.shot = 'insert';
    // 4. Effects that sell the moment, within the engine's limit of 3.
    const add = (fx: string) => { if (s.fx.length < 3 && !s.fx.includes(fx)) s.fx.push(fx); };
    if (s.mood === 'reveal' && !s.fx.some(f => f === 'sparkle' || f === 'burst')) add('burst');
    if (s.world === 'storm_sea') add('rain');
    if (s.mood === 'tense' && WET.has(s.world)) add('splash');
    if ((s.cues ?? []).some(c => c.kind === 'impact')) add('dust');
    if (s.move === undefined) delete s.move;
    edited.push(s);
    return s;
  });
}
