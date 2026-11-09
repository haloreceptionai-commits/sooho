import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const deployment = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);

/** Picks which narration sentences become white idea cards (exact text is drawn later in the browser). */
export const planInkCards = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { scenes: string[]; deployment: string }) => z.object({ scenes: z.array(z.string().max(2000)).min(1).max(3000), deployment }).parse(d))
  .handler(async ({ data }) => { const { inkCardsOperation } = await import('./pipeline-operations.server'); return inkCardsOperation(data); });

export const generateInkThumbnail = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { subject: string; figure: string; deployment: string; variant: number }) =>
    z.object({ subject: z.string().trim().min(1).max(120), figure: z.string().trim().min(1).max(400), deployment, variant: z.number().int().min(0).max(5) }).parse(d))
  .handler(async ({ data }) => { const { inkThumbnailOperation } = await import('./pipeline-operations.server'); return inkThumbnailOperation(data); });

/** Writes one literal picture per spoken phrase so the video cuts every 1-2 seconds to what is being said. */
export const planInkBeats = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { beats: { i: number; text: string; scene: string }[]; topic: string; deployment: string }) =>
    z.object({ beats: z.array(z.object({ i: z.number().int().min(0).max(5000), text: z.string().max(400), scene: z.string().max(400) })).min(1).max(80), topic: z.string().max(300), deployment }).parse(d))
  .handler(async ({ data }) => { const { inkBeatsOperation } = await import('./pipeline-operations.server'); return inkBeatsOperation(data); });
