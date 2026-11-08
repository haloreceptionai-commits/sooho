import { z } from 'zod';
import vocab from '../../hosted-renderer/cartoon/vocabulary.json';

export const CARTOON_LIFETIME_MS = 48 * 60 * 60_000;
// One vocabulary shared with the hosted worker, so the director can only ask for what the engine draws.
export const VOCAB = vocab as { [K in keyof typeof vocab]: [string, ...string[]] };
export const OUTFITS = VOCAB.outfits;
const id = z.string().regex(/^[a-z0-9_-]{1,30}$/);
const performer = z.object({ actor: id, action: z.enum(VOCAB.actions), expression: z.enum(VOCAB.expressions), slot: z.enum(VOCAB.slots), facing: z.number().int().min(-1).max(1) });
export const cartoonScene = z.object({
  world: z.enum(VOCAB.worlds), light: z.enum(VOCAB.lights), action: z.enum(VOCAB.actions), expression: z.enum(VOCAB.expressions), actor: id, wide: z.boolean(),
  // v2 Visual Director fields; optional so earlier saved jobs still parse unchanged.
  shot: z.enum(VOCAB.shots).optional(), move: z.enum(VOCAB.moves).optional(), mood: z.enum(VOCAB.moods).optional(),
  actors: z.array(performer).min(1).max(3).optional(), speaker: id.optional(),
  props: z.array(z.object({ kind: z.enum(VOCAB.props), place: z.enum(VOCAB.places), motion: z.enum(VOCAB.prop_motions),
    // kind 'asset' names one object from the bundled CC0 library; the worker rejects unknown ids.
    asset: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9_.-]{1,80}$/).optional() })).max(4).optional(),
  fx: z.array(z.enum(VOCAB.fx)).max(3).optional(),
  cues: z.array(z.object({ word: z.number().int().min(0).max(200), kind: z.enum(VOCAB.sounds) })).max(4).optional(),
  keyword: z.string().max(40).optional(),
}).superRefine((s, ctx) => {
  const ids = (s.actors ?? []).map(a => a.actor);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'An actor can appear once per scene' });
  if (new Set((s.actors ?? []).map(a => a.slot)).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Two actors cannot share a slot' });
  if (s.speaker && s.actors && !ids.includes(s.speaker)) ctx.addIssue({ code: 'custom', message: 'Speaker must be on screen' });
  if ((s.props ?? []).filter(p => p.place === 'hand').length > 1) ctx.addIssue({ code: 'custom', message: 'Only one hand prop per scene' });
  if ((s.props ?? []).some(p => (p.kind === 'asset') !== !!p.asset || (p.kind === 'asset' && p.place === 'hand'))) ctx.addIssue({ code: 'custom', message: 'Library objects need an id and cannot be held' });
});
export const cartoonDirection = z.object({
  cast: z.array(z.object({ id, seed: z.number().int().min(1).max(100000), outfit: z.enum(OUTFITS) })).min(1).max(3),
  scenes: z.array(cartoonScene).min(1).max(120),
});
export const cartoonStart = z.object({
  videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), voicePath: z.string().min(1).max(500),
  script: z.string().min(1).max(4000), narration: z.array(z.string().min(1).max(4000)).min(1).max(120), direction: cartoonDirection,
  gate: z.object({ score: z.number().min(85).max(100), ready: z.literal(true), parts: z.record(z.number()), blockers: z.array(z.string()).max(100) }),
  hookType: z.string().max(100), report: z.object({ revealSec: z.number(), shotMix: z.record(z.number()) }), captions: z.boolean(), sfx: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.narration.join(' ') !== d.script) ctx.addIssue({ code: 'custom', message: 'Scene text must match the locked narration' });
  if (d.narration.length !== d.direction.scenes.length) ctx.addIssue({ code: 'custom', message: 'Every scene needs supported cartoon direction' });
  const cast = new Set(d.direction.cast.map(c => c.id));
  if (d.direction.scenes.some(s => !cast.has(s.actor) || (s.actors ?? []).some(a => !cast.has(a.actor)))) ctx.addIssue({ code: 'custom', message: 'Unknown cartoon actor' });
  if (d.direction.scenes.some((s, i) => (s.cues ?? []).some(c => c.word >= (d.narration[i] ?? '').split(/\s+/).filter(Boolean).length))) ctx.addIssue({ code: 'custom', message: 'Sound cue points past its sentence' });
});
export type CartoonStart = z.infer<typeof cartoonStart>;
export const reviewApproval = z.object({ videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), hash: z.string().regex(/^[a-f0-9]{64}$/) });
export const cartoonReviewEvent = z.object({
  type: z.literal('review'), hash: z.string().regex(/^[a-f0-9]{64}$/), storeId: z.string().regex(/^([a-zA-Z0-9]{1,100}|cartoon-[0-9a-f-]{36})$/),
  sheets: z.array(z.string().min(1).max(500)).min(1).max(40), alignmentPath: z.string().min(1).max(500), voicePath: z.string().min(1).max(500), duration: z.number().min(1).max(90),
});
export interface CartoonReview { hash: string; storeId: string; sheets: string[]; alignmentPath: string; voicePath: string; duration: number; approved?: boolean }
export function reviewMatches(review: CartoonReview | undefined, hash: string) { return Boolean(review && !review.approved && review.hash === hash); }