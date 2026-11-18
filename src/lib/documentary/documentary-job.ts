// The request the browser sends to start a documentary render, and the manifest saved with the render job.
import { z } from 'zod';
import type { DocManifest } from './types';

const assetPath = z.string().min(1).max(500);
export const DOC_LIFETIME_MS = 90 * 60_000;

export const documentaryRequest = z.object({
  videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  doc: z.object({
    kind: z.literal('documentary'), version: z.literal(1), width: z.number().int().min(320).max(3840), height: z.number().int().min(180).max(2160), title: z.string().max(300),
    images: z.array(assetPath).min(1).max(3000),
    voice: z.array(z.object({ path: assetPath, scenes: z.array(z.number().int().min(0).max(3000)).min(1).max(500) })).min(1).max(500),
    scenes: z.array(z.object({ text: z.string().min(1).max(4000), mood: z.string().max(20).optional(), ambience: z.string().max(20).optional() })).min(1).max(3000),
    beats: z.array(z.object({ scene: z.number().int().min(0).max(3000), w0: z.number().int().min(0).max(4000), w1: z.number().int().min(1).max(4000), visual: z.object({ type: z.enum(['image', 'card']) }).passthrough() }).passthrough()).min(1).max(6000),
    pauses: z.array(z.object({ scene: z.number().int(), after_word: z.number().int(), sec: z.number().min(.1).max(1.6), hush: z.boolean().optional() })).max(200),
    music: z.array(z.object({ scene: z.number().int(), mood: z.enum(['lofi', 'epic', 'suspense', 'sad']) })).max(60),
    captions: z.boolean(),
  }),
  checkpoint: z.object({
    gate: z.object({ score: z.number().min(0).max(100), ready: z.boolean(), parts: z.record(z.number()), blockers: z.array(z.string()).max(100) }),
    report: z.object({ revealSec: z.number(), shotMix: z.record(z.number()) }),
    hookType: z.string().max(100), continuity: z.number().min(0).max(1),
    plan: z.object({ characters: z.array(z.unknown()).max(10) }),
  }),
});

export interface DocumentaryRequest { videoId: string; doc: DocManifest; checkpoint: z.infer<typeof documentaryRequest>['checkpoint'] }

/** What the render job row keeps: the worker reads `doc`, the completion callback reads the rest (the same fields the picture assembler uses). */
export const documentaryManifest = (r: DocumentaryRequest) => ({ kind: 'documentary' as const, doc: r.doc, width: r.doc.width, height: r.doc.height, captions: r.doc.captions, clips: [], checkpoint: r.checkpoint });
