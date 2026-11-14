import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Settings } from './store';
import { assertVideoEngine } from './video-engines';
const videoId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const startBackgroundGeneration = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string; settings: Settings }) => ({ ...data, videoId: videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    // Rollout remains disabled until deployed worker/endpoints and interruption tests pass.
    if (process.env['GENERATION_ROLLOUT_ENABLED'] !== 'true') throw Error('Background generation is not enabled yet');
    const { data: video, error } = await context.supabase.from('videos').select('data,user_id').eq('id', data.videoId).single();
    if (error || !video || video.user_id !== context.userId) throw Error('Video not found');
    assertVideoEngine((video.data as unknown as { input?: { engine?: unknown } }).input?.engine);
    const { digest } = await import('./generation-runner.server');
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID();
    const { data: claimed, error: claimError } = await db.rpc('start_generation_job', { p_video: data.videoId, p_user: context.userId, p_settings: data.settings as never, p_hash: await digest(token) });
    if (claimError || !claimed) throw Error('Could not save background generation');
    const result = claimed as unknown as { id: string; existing: boolean };
    if (result.existing) return result;
    const { startGenerationWorker } = await import('./generation-dispatch.server');
    // Exactly one dispatch attempt; uncertainty never causes an automatic duplicate start.
    const run = await startGenerationWorker(result.id, token);
    const { error: trackError } = await db.from('generation_jobs').update({ run_id: run }).eq('id', result.id);
    if (trackError) throw Error('Worker started but tracking is uncertain; do not restart');
    return result;
  });

export const backgroundGenerationEnabled = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(() => ({ enabled: process.env['GENERATION_ROLLOUT_ENABLED'] === 'true' }));

export const cancelBackgroundGeneration = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string }) => ({ videoId: videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from('generation_jobs').select('id').eq('video_id', data.videoId).in('status', ['queued','running','paused','handoff']).maybeSingle();
    if (!job) return { cancelled: false };
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { data: cancelled, error } = await db.rpc('cancel_generation_job', { p_job: job.id, p_user: context.userId });
    if (error) throw Error('Cancellation could not be saved');
    return { cancelled };
  });