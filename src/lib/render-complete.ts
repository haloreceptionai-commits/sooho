import type { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';
import { finalScore } from '@/lib/story-v2';
import type { renderCallback } from '@/lib/hosted-render';

export type DoneEvent = Extract<z.infer<typeof renderCallback>, { type: 'done' }>;

/** The video patch written when a hosted render finishes; shared by the worker callback and the render watchdog. */
export function donePatch(manifestJson: Json, event: DoneEvent): Record<string, Json> {
  const manifest = manifestJson as unknown as { kind?: string; checkpoint: { gate: Parameters<typeof finalScore>[0]; hookType: string; report: { revealSec: number; shotMix: Record<string, number> }; continuity: number; plan: { characters: unknown[] } }; width: number; height: number; captions: boolean };
  const fin = finalScore(manifest.checkpoint.gate, { ...event.stats, width: manifest.width, height: manifest.height, captions: manifest.kind === 'cartoon' ? true : manifest.captions });
  return { status: 'done', stage: 'done', progress: 100, detail: 'Ready', error: null, duration: event.duration, mime: event.mime, size: event.size, ready: fin.ready, qa: { score: fin.score, parts: fin.parts } as unknown as Json, analytics: { hookType: manifest.checkpoint.hookType, revealSec: manifest.checkpoint.report.revealSec, castSize: manifest.checkpoint.plan.characters.length, shotMix: manifest.checkpoint.report.shotMix, continuity: manifest.checkpoint.continuity } };
}

/** Every worker reports to one address the deployed workers accept; it forwards to the custom domain. */
export const RENDER_CALLBACK_URL = 'https://sooho.lovable.app/api/public/render-callback';
