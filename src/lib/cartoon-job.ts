import { z } from 'zod';
import vocab from '../../hosted-renderer/cartoon/vocabulary.json';

export const CARTOON_LIFETIME_MS = 48 * 60 * 60_000;
// One vocabulary shared with the hosted worker, so the director can only ask for what the engine draws.
type Lists = Omit<typeof vocab, 'map'>;
export const VOCAB = vocab as unknown as { [K in keyof Lists]: [string, ...string[]] };
export const OUTFITS = VOCAB.outfits;
const id = z.string().regex(/^[a-z0-9_-]{1,30}$/);
export const CARD_POSES = ['reach', 'shock', 'happy'] as const;
const cardKey = z.string().regex(/^(obj-[a-z0-9_]{1,30}|[a-z0-9_-]{1,30}(-(reach|shock|happy|rig))?)$/);
const lonlat = z.tuple([z.number().min(-180).max(180), z.number().min(-65).max(85)]);
const mapLabel = z.string().max(24).regex(/^[\p{L}\p{N} .,'&()\-–]*$/u);
// Map world (long-form documentaries): ids come from the bundled Natural Earth region list; the worker re-checks them.
export const mapSpec = z.object({
  regions: z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(40), focus: z.tuple([z.number().min(-180).max(180), z.number().min(-65).max(85), z.number().min(.5).max(8)]),
  reveal: z.enum(['grow', 'hold', 'shrink']), label: mapLabel.optional(), years: mapLabel.optional(),
  cities: z.array(z.object({ name: z.string().min(1).max(22).regex(/^[\p{L}\p{N} .,'&()\-–]*$/u), at: lonlat })).max(6).optional(),
  armies: z.array(z.object({ from: lonlat, to: lonlat, side: z.enum(['red', 'blue', 'gold']) })).max(4).optional(),
});
const performer = z.object({ actor: id, action: z.enum(VOCAB.actions), expression: z.enum(VOCAB.expressions), slot: z.enum(VOCAB.slots), facing: z.number().int().min(-1).max(1) });
export const cartoonScene = z.object({
  world: z.enum(VOCAB.worlds), light: z.enum(VOCAB.lights), action: z.enum(VOCAB.actions), expression: z.enum(VOCAB.expressions), actor: id, wide: z.boolean(),
  // v2 Visual Director fields; optional so earlier saved jobs still parse unchanged.
  shot: z.enum(VOCAB.shots).optional(), move: z.enum(VOCAB.moves).optional(), mood: z.enum(VOCAB.moods).optional(),
  actors: z.array(performer).min(1).max(3).optional(), speaker: id.optional(),
  props: z.array(z.object({ kind: z.enum(VOCAB.props), place: z.enum(VOCAB.places), motion: z.enum(VOCAB.prop_motions),
    // kind 'asset' names one object from the bundled CC0 library; the worker rejects unknown ids.
    // 'card/<name>' is an Advanced Video AI painted story object (its PNG travels with the job).
    asset: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9_.-]{1,80}$/).optional(),
    // Advanced: the descriptive phrase that defines this object and its real-world size (decides card height and placement).
    phrase: z.string().max(160).optional(), size: z.enum(['small', 'medium', 'large', 'huge']).optional() })).max(4).optional(),
  // Advanced: free-text real place for the line ("Commercial Street, Boston's North End, 1919"); the 3D planner never forces a kit.
  location: z.string().max(160).optional(),
  fx: z.array(z.enum(VOCAB.fx)).max(3).optional(),
  cues: z.array(z.object({ word: z.number().int().min(0).max(200), kind: z.enum(VOCAB.sounds) })).max(4).optional(),
  keyword: z.string().max(40).optional(),
  map: mapSpec.optional(),
}).superRefine((s, ctx) => {
  if (s.world === 'map' && !s.map) ctx.addIssue({ code: 'custom', message: 'Map scenes need map data' });
  const ids = (s.actors ?? []).map(a => a.actor);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'An actor can appear once per scene' });
  if (new Set((s.actors ?? []).map(a => a.slot)).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Two actors cannot share a slot' });
  if (s.speaker && s.actors && !ids.includes(s.speaker)) ctx.addIssue({ code: 'custom', message: 'Speaker must be on screen' });
  if ((s.props ?? []).filter(p => p.place === 'hand').length > 1) ctx.addIssue({ code: 'custom', message: 'Only one hand prop per scene' });
  if ((s.props ?? []).some(p => (p.kind === 'asset') !== !!p.asset || (p.kind === 'asset' && p.place === 'hand'))) ctx.addIssue({ code: 'custom', message: 'Library objects need an id and cannot be held' });
});
export const cartoonDirection = z.object({
  cast: z.array(z.object({ id, seed: z.number().int().min(1).max(100000), outfit: z.enum(OUTFITS), card: z.boolean().optional() })).min(1).max(4),
  scenes: z.array(cartoonScene).min(1).max(600),
});
export const cartoonStart = z.object({
  videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), voicePath: z.string().min(1).max(500),
  script: z.string().min(1).max(60000), narration: z.array(z.string().min(1).max(4000)).min(1).max(600), direction: cartoonDirection,
  // 'long' renders a 16:9 1920x1080 documentary with map scenes; omitted means a 9:16 Short (older saved jobs).
  format: z.enum(['short', 'long']).optional(),
  gate: z.object({ score: z.number().min(0).max(100), ready: z.boolean(), parts: z.record(z.number()), blockers: z.array(z.string()).max(100) }),
  // Advanced Video AI: painted image-model character cards replace the drawn outfits for cast marked card=true.
  // Card files: '<castId>' (standing), '<castId>-<pose>' (reach/shock/happy) and 'obj-<name>' painted story objects.
  advanced: z.boolean().optional(), cards: z.array(z.object({ id: cardKey, path: z.string().min(1).max(500) })).max(24).optional(),
  hookType: z.string().max(100), report: z.object({ revealSec: z.number(), shotMix: z.record(z.number()) }), captions: z.boolean(), sfx: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.format !== 'long' && (d.script.length > 4000 || d.narration.length > 120)) ctx.addIssue({ code: 'custom', message: 'Shorts are limited to 120 scenes' });
  if (d.format !== 'long' && d.direction.scenes.some(s => s.world === 'map')) ctx.addIssue({ code: 'custom', message: 'Map scenes are for long-form videos' });
  if (d.narration.join(' ') !== d.script) ctx.addIssue({ code: 'custom', message: 'Scene text must match the locked narration' });
  if (d.narration.length !== d.direction.scenes.length) ctx.addIssue({ code: 'custom', message: 'Every scene needs supported cartoon direction' });
  const cast = new Set(d.direction.cast.map(c => c.id));
  const carded = d.direction.cast.filter(c => c.card).map(c => c.id);
  const keys = new Set((d.cards ?? []).map(c => c.id));
  const objectCards = new Set(d.direction.scenes.flatMap(s => (s.props ?? []).filter(p => p.asset?.startsWith('card/')).map(p => `obj-${p.asset!.slice(5)}`)));
  const allowed = new Set([...carded.flatMap(c => [c, `${c}-rig`, ...CARD_POSES.map(p => `${c}-${p}`)]), ...objectCards]);
  if (carded.some(c => !keys.has(c)) || [...objectCards].some(k => !keys.has(k)) || [...keys].some(k => !allowed.has(k)) || (keys.size && !d.advanced)) ctx.addIssue({ code: 'custom', message: 'Character cards must match the cast' });
  if (d.direction.scenes.some(s => !cast.has(s.actor) || (s.actors ?? []).some(a => !cast.has(a.actor)))) ctx.addIssue({ code: 'custom', message: 'Unknown cartoon actor' });
  if (d.direction.scenes.some((s, i) => (s.cues ?? []).some(c => c.word >= (d.narration[i] ?? '').split(/\s+/).filter(Boolean).length))) ctx.addIssue({ code: 'custom', message: 'Sound cue points past its sentence' });
});
export type CartoonStart = z.infer<typeof cartoonStart>;
export const reviewApproval = z.object({ videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), hash: z.string().regex(/^[a-f0-9]{64}$/) });
export const cartoonReviewEvent = z.object({
  type: z.literal('review'), hash: z.string().regex(/^[a-f0-9]{64}$/), storeId: z.string().regex(/^([a-zA-Z0-9]{1,100}|cartoon-[0-9a-f-]{36})$/),
  sheets: z.array(z.string().min(1).max(500)).min(1).max(200), alignmentPath: z.string().min(1).max(500), voicePath: z.string().min(1).max(500), duration: z.number().min(1).max(45 * 60),
});
export interface CartoonReview { hash: string; storeId: string; sheets: string[]; alignmentPath: string; voicePath: string; duration: number; approved?: boolean }
export function reviewMatches(review: CartoonReview | undefined, hash: string) { return Boolean(review && !review.approved && review.hash === hash); }
type Direction = z.infer<typeof cartoonDirection>;
/**
 * Repairs the small, mechanical slips the Visual Director makes (stray sound positions, duplicate actors or slots,
 * held library objects, scene count drift) so they never fail a paid job. Never adds new vocabulary.
 */
export function sanitizeDirection(direction: Direction, narration: string[]): Direction {
  if (!direction.scenes.length || !direction.cast.length) throw Error('Cartoon direction came back empty. No rendering was started.');
  // Self-healing: newer models may return ids like "Soldier 1", fractional seeds or unknown outfits; normalise them before strict validation.
  const remap = new Map<string, string>(), taken = new Set<string>();
  const cast0 = direction.cast.map((c, i) => {
    let nid = String(c.id ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || `cast${i + 1}`;
    while (taken.has(nid)) nid = `${nid.slice(0, 27)}_${i + 1}`;
    taken.add(nid); remap.set(String(c.id), nid);
    const seed = Math.min(100000, Math.max(1, Math.round(Number(c.seed) || (i + 1) * 97)));
    const outfit = (OUTFITS as readonly string[]).includes(c.outfit as string) ? c.outfit : OUTFITS[0];
    return { ...c, id: nid, seed, outfit };
  });
  const fix = (x?: string) => (x === undefined ? x : remap.get(x) ?? x);
  direction = { ...direction, cast: cast0 as Direction['cast'], scenes: direction.scenes.map((sc) => ({ ...sc, actor: fix(sc.actor)!, speaker: fix(sc.speaker), actors: sc.actors?.map((a) => ({ ...a, actor: fix(a.actor)! })) })) };
  const scenes = direction.scenes.slice(0, narration.length);
  while (scenes.length < narration.length) scenes.push({ ...scenes[scenes.length - 1]! });
  const castIds = new Set(direction.cast.map(c => c.id)), lead = direction.cast[0]!.id;
  return { ...direction, scenes: scenes.map((raw, i) => {
    const s = { ...raw };
    // Only the map director may place map scenes; a stray map world without data falls back to open landscape.
    if (s.world === 'map' && !s.map) s.world = 'landscape';
    if (s.world === 'map') { s.actors = undefined; s.speaker = undefined; s.props = []; s.fx = []; return s; }
    if (!castIds.has(s.actor)) s.actor = lead;
    if (s.actors) {
      const seen = new Set<string>(), used = new Set<string>();
      const free = () => VOCAB.slots.find(x => !used.has(x));
      const actors = s.actors.filter(a => castIds.has(a.actor) && !seen.has(a.actor) && seen.add(a.actor)).flatMap(a => {
        const slot = used.has(a.slot) ? free() : a.slot;
        if (!slot) return [];
        used.add(slot); return [{ ...a, slot: slot as typeof a.slot }];
      });
      s.actors = actors.length ? actors : undefined;
    }
    if (s.speaker && s.actors && !s.actors.some(a => a.actor === s.speaker)) s.speaker = undefined;
    if (s.props) {
      let hand = false;
      s.props = s.props.filter(p => p.kind !== 'asset' || !!p.asset).map(p => {
        const q = { ...p };
        if (q.kind !== 'asset') delete q.asset;
        if (q.place === 'hand' && (q.kind === 'asset' || hand)) q.place = 'ground_right';
        if (q.place === 'hand') hand = true;
        return q;
      });
    }
    // Object close-ups need a drawn object near the actors; otherwise the camera frames bare floor, so frame the actor instead.
    if ((s.shot === 'insert' || s.shot === 'extreme_close') && !(s.props ?? []).some(p => p.kind !== 'asset' && ['hand', 'ground_left', 'ground_right'].includes(p.place))) s.shot = 'close';
    const n = (narration[i] ?? '').split(/\s+/).filter(Boolean).length;
    if (s.cues) s.cues = s.cues.filter(c => n > 0 && c.word >= 0).map(c => ({ ...c, word: Math.min(c.word, n - 1) }));
    return s;
  }) };
}
