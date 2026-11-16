// Advanced Video AI staging (owner's Stage 1.5 rules, Nov 16 2026), applied after the Visual Director:
// - casting per shot from the script's facts: a character never appears before they enter the story, with a logged reason;
// - one canonical card per physical object, state variants (leaking, failing, burst) painted from it;
// - the key event shown as a sequence of object states (intact -> failing -> burst), never skipped.
// The AI proposes; these pure rules decide, so a model slip cannot put the auditor at the 1919 flood.
import type { z } from 'zod';
import type { cartoonDirection } from './cartoon-job';
import { VOCAB } from './cartoon-job';

type Direction = z.infer<typeof cartoonDirection>;
type Scene = Direction['scenes'][number];
export interface StagingAnswer {
  cast: { id: string; who: string; enters: number }[];
  scenes: { actors: { actor: string; reason: string }[] }[];
  families: { canonical: string; variants: { id: string; state: string }[] }[];
  climax: { scene: number; sequence: string[] };
}

const stem = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '').replace(/(es|s)$/, '');
/** First narration line that names this cast id (plural/possessive allowed), or -1 when the id is a role word not in the text. */
export function firstMention(castId: string, narration: string[]): number {
  const parts = castId.split(/[_-]+/).filter(p => p.length >= 3).map(stem);
  if (!parts.length) return -1;
  return narration.findIndex(line => line.split(/\s+/).map(stem).some(w => parts.includes(w)));
}
const cardId = (p: { kind: string; asset?: string | undefined }) => (p.kind === 'asset' && p.asset?.startsWith('card/') ? p.asset.slice(5) : null);

export function applyStaging(direction: Direction, narration: string[], answer: StagingAnswer): Direction {
  const n = direction.scenes.length, log: string[] = [];
  const castIds = direction.cast.map(c => c.id);
  // When does each character enter? A name in the narration is a fact and overrides the AI's guess.
  const enters = new Map<string, number>();
  for (const id of castIds) {
    const said = firstMention(id, narration);
    const ai = answer.cast.find(c => c.id === id)?.enters;
    const e = said >= 0 ? said : Number.isInteger(ai) ? Math.max(0, Math.min(n - 1, ai!)) : 0;
    enters.set(id, e);
    log.push(`${id} enters at line ${e + 1}${said >= 0 ? ' (first named there)' : ' (AI reading of the facts)'}: ${answer.cast.find(c => c.id === id)?.who ?? ''}`.slice(0, 240));
  }
  const objects = new Map<string, { phrase?: string | undefined; size?: string | undefined }>();
  direction.scenes.forEach(s => (s.props ?? []).forEach(p => { const k = cardId(p); if (k && !objects.has(k)) objects.set(k, { phrase: p.phrase, size: p.size }); }));
  // Families: only real painted objects, each object in at most one family, never its own variant.
  const used = new Set<string>(); const families: NonNullable<Direction['families']> = [];
  for (const f of answer.families ?? []) {
    if (!objects.has(f.canonical) || used.has(f.canonical)) continue;
    const variants = (f.variants ?? []).filter(v => objects.has(v.id) && v.id !== f.canonical && !used.has(v.id)).slice(0, 4).map(v => ({ id: v.id, state: String(v.state ?? '').slice(0, 60) }));
    if (!variants.length) continue;
    used.add(f.canonical); variants.forEach(v => used.add(v.id));
    families.push({ canonical: f.canonical, variants });
    log.push(`object ${f.canonical}: variants ${variants.map(v => `${v.id} (${v.state})`).join(', ')} painted from it`.slice(0, 240));
  }
  const slots = VOCAB.slots as readonly string[];
  const scenes: Scene[] = direction.scenes.map((sc, i) => {
    const before = sc.actors?.length ? sc.actors : [{ actor: sc.actor, action: sc.action, expression: sc.expression, slot: 'center' as const, facing: 0 }];
    const picked = (answer.scenes[i]?.actors ?? []).filter((a, k, all) => castIds.includes(a.actor) && all.findIndex(b => b.actor === a.actor) === k);
    const want = picked.length || answer.scenes[i] ? picked : before.map(b => ({ actor: b.actor, reason: 'kept from the shot plan' }));
    const actors: NonNullable<Scene['actors']> = [];
    for (const a of want.slice(0, 3)) {
      const e = enters.get(a.actor) ?? 0;
      if (i < e) { log.push(`line ${i + 1}: removed ${a.actor}, not part of the story until line ${e + 1}`); continue; }
      const prev = before.find(b => b.actor === a.actor);
      const slot = (prev && !actors.some(x => x.slot === prev.slot) ? prev.slot : slots.find(s => !actors.some(x => x.slot === s))) as NonNullable<Scene['actors']>[number]['slot'] | undefined;
      if (!slot) continue;
      actors.push({ ...(prev ?? { action: 'idle', expression: 'neutral', facing: 0 }), actor: a.actor, slot, reason: String(a.reason || 'named in this line').slice(0, 160) } as NonNullable<Scene['actors']>[number]);
      log.push(`line ${i + 1}: ${a.actor} — ${String(a.reason || 'named in this line').slice(0, 150)}`);
    }
    if (!actors.length) {
      log.push(`line ${i + 1}: nobody from the cast yet — place and objects only`);
      return { ...sc, empty: true, actors: undefined, speaker: undefined };
    }
    const lead = actors[0]!;
    return { ...sc, empty: undefined, actors, actor: lead.actor, action: lead.action, expression: lead.expression, speaker: sc.speaker && actors.some(a => a.actor === sc.speaker) ? sc.speaker : undefined };
  });
  // Climax: 2-4 distinct painted objects in story order, shown one per setup in the line that states the event.
  const cx = answer.climax;
  const seq = [...new Set((cx?.sequence ?? []).filter(id => objects.has(id)))].slice(0, 4);
  if (cx && Number.isInteger(cx.scene) && cx.scene >= 0 && cx.scene < n && seq.length >= 2) {
    const sc = scenes[cx.scene]!;
    const props = [...(sc.props ?? [])];
    for (const id of seq) if (!props.some(p => cardId(p) === id)) {
      const o = objects.get(id)!;
      props.push({ kind: 'asset', asset: `card/${id}`, place: o.size === 'huge' || o.size === 'large' ? 'background' : 'ground_right', motion: 'none', phrase: o.phrase, size: o.size as never });
    }
    // Sequence cards come first; other props are dropped only if the four-prop limit needs the room.
    const ordered = [...seq.map(id => props.find(p => cardId(p) === id)!), ...props.filter(p => !seq.includes(cardId(p) ?? ''))].slice(0, 4);
    scenes[cx.scene] = { ...sc, props: ordered, sequence: seq };
    log.push(`climax at line ${cx.scene + 1}: ${seq.join(' -> ')}`);
  } else log.push('no physical climax sequence proposed');
  return { ...direction, scenes, staged: true, families, stagingLog: log.slice(0, 300) };
}
