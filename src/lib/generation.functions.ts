import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Settings } from './store';
const videoId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const startBackgroundGeneration = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { videoId: string; settings: Settings }) => ({ ...data, videoId: videoId.parse(data.videoId) }))
  .handler(async ({ data, context }) => {
    // Rollout remains disabled until deployed worker/endpoints and interruption tests pass.
    if (process.env['GENERATION_ROLLOUT_ENABLED'] !== 'true') throw Error('Background generation is not enabled yet');
    const { data: video, error } = await context.supabase.from('videos').select('data,user_id').eq('id', data.videoId).single();
    if (error || !video || video.user_id !== context.userId) throw Error('Video not found');
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