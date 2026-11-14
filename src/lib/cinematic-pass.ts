// Deterministic editor pass over the Visual Director's scenes, applied before strict validation.
// It only re-uses vocabulary the engine already draws: no new nouns are ever invented.
type Prop = { kind: string; place: string; motion: string; asset?: string };
export type DirectedScene = {
  world: string; shot?: string; move?: string; mood?: string; props?: Prop[]; fx?: string[];
  cues?: { word: number; kind: string }[]; [k: string]: unknown;
};

const CLOSE = new Set(['insert', 'close', 'extreme_close']);
const WET = new Set(['ship', 'storm_sea']);

export function cinematicPass<T extends DirectedScene>(scenes: T[], narration?: string[], options: { literal?: boolean } = {}): T[] {
  let lastHero: Prop | undefined;
  const edited: T[] = [];
  return scenes.map((input, i) => {
    const s = { ...input, props: [...(input.props ?? [])], fx: [...(input.fx ?? [])] } as T & { props: Prop[]; fx: string[] };
    const prev = edited[i - 1];
    if (options.literal) {
      const spoken = narration?.[i] ?? '';
      const celebration = /\b(cheer|celebrat|laugh|smil|happy|joy|dance|won|wins|victory)/i.test(spoken);
      const surprise = /\b(shock|surpris|scare|fear|panic|afraid|danger|sudden)/i.test(spoken);
      s.fx = s.fx.filter(f => !['sparkle', 'burst'].includes(f) || celebration);
      const calm = (a: Record<string, unknown>) => ({ ...a,
        action: !celebration && ['cheer', 'thumbs_up', 'wave'].includes(String(a['action'])) ? 'idle' : a['action'],
        expression: (!celebration && ['grin', 'laugh', 'relief', 'smile', 'whistle'].includes(String(a['expression']))) || (!surprise && ['shock', 'nervous', 'dazed', 'pained'].includes(String(a['expression']))) ? 'neutral' : a['expression'] });
      const main = calm(s);
      if (s['action'] !== undefined) Object.assign(s, { action: main['action'] });
      if (s['expression'] !== undefined) Object.assign(s, { expression: main['expression'] });
      if (Array.isArray(s['actors'])) Object.assign(s, { actors: s['actors'].map(a => calm(a)) });
    }
    // 1. Every scene has a main prop: carry the story's last hero object forward when the director left the frame empty.
    const sameSubject = !narration || /\b(it|its|this|that|they|their)\b/i.test(narration[i] ?? '');
    if (!s.props.length && lastHero && lastHero.place !== 'hand' && (!prev || prev.world === s.world) && sameSubject) s.props.push({ ...lastHero, motion: 'none' });
    if (prev && prev.world !== s.world) lastHero = undefined;
    if (s.props.length) lastHero = s.props[0];
    // 2. Camera like an editor: never the same shot+move twice, never two static cuts in a row.
    if (!options.literal && prev && prev.shot === s.shot && prev.move === s.move) s.move = s.move === 'push_in' ? 'pull_back' : 'push_in';
    if (!options.literal && prev && prev.move === 'static' && s.move === 'static') s.move = 'push_in';
    // 3. Explainer cutaway: after three non-close shots, show the main object up close.
    const recent = edited.slice(Math.max(0, i - 3), i);
    if (!options.literal && recent.length === 3 && recent.every(r => !CLOSE.has(String(r.shot))) && s.props.length && !CLOSE.has(String(s.shot)) && s.mood !== 'reveal') s.shot = 'insert';
    // 4. Effects that sell the moment, within the engine's limit of 3.
    const add = (fx: string) => { if (s.fx.length < 3 && !s.fx.includes(fx)) s.fx.push(fx); };
    if (!options.literal && s.mood === 'reveal' && !s.fx.some(f => f === 'sparkle' || f === 'burst')) add('burst');
    if (s.world === 'storm_sea') add('rain');
    if (s.mood === 'tense' && WET.has(s.world)) add('splash');
    if ((s.cues ?? []).some(c => c.kind === 'impact')) add('dust');
    if (s.move === undefined) delete s.move;
    edited.push(s);
    return s;
  });
}
