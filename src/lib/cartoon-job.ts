import { z } from 'zod';

export const CARTOON_LIFETIME_MS = 48 * 60 * 60_000;
export const cartoonDirection = z.object({
  cast: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,30}$/), seed: z.number().int().min(1).max(100000), outfit: z.enum(['sailor', 'worker', 'scholar']) })).min(1).max(3),
  scenes: z.array(z.object({ world: z.enum(['ship', 'town', 'bridge', 'lab', 'landscape']), light: z.enum(['day', 'golden', 'night_bright']), action: z.enum(['idle', 'walk', 'point', 'lift', 'pour', 'react']), expression: z.enum(['neutral', 'grin', 'stern', 'nervous', 'shock']), actor: z.string().regex(/^[a-z0-9_-]{1,30}$/), wide: z.boolean() })).min(1).max(120),
});
export const cartoonStart = z.object({
  videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), voicePath: z.string().min(1).max(500),
  script: z.string().min(1).max(4000), narration: z.array(z.string().min(1).max(4000)).min(1).max(120), direction: cartoonDirection,
  gate: z.object({ score: z.number().min(85).max(100), ready: z.literal(true), parts: z.record(z.number()), blockers: z.array(z.string()).max(100) }),
  hookType: z.string().max(100), report: z.object({ revealSec: z.number(), shotMix: z.record(z.number()) }), captions: z.boolean(), sfx: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.narration.join(' ') !== d.script) ctx.addIssue({ code: 'custom', message: 'Scene text must match the locked narration' });
  if (d.narration.length !== d.direction.scenes.length) ctx.addIssue({ code: 'custom', message: 'Every scene needs supported cartoon direction' });
  if (d.direction.scenes.some(s => !d.direction.cast.some(c => c.id === s.actor))) ctx.addIssue({ code: 'custom', message: 'Unknown cartoon actor' });
});
export type CartoonStart = z.infer<typeof cartoonStart>;
export const reviewApproval = z.object({ videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), hash: z.string().regex(/^[a-f0-9]{64}$/) });
export const cartoonReviewEvent = z.object({
  type: z.literal('review'), hash: z.string().regex(/^[a-f0-9]{64}$/), storeId: z.string().regex(/^[a-zA-Z0-9]{1,100}$/),
  sheets: z.array(z.string().min(1).max(500)).min(1).max(40), alignmentPath: z.string().min(1).max(500), voicePath: z.string().min(1).max(500), duration: z.number().min(1).max(90),
});
export interface CartoonReview { hash: string; storeId: string; sheets: string[]; alignmentPath: string; voicePath: string; duration: number; approved?: boolean }
export function reviewMatches(review: CartoonReview | undefined, hash: string) { return Boolean(review && !review.approved && review.hash === hash); }