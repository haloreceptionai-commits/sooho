import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/generation-recovery')({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request); if (failure) return failure;
    if (process.env['GENERATION_ROLLOUT_ENABLED'] !== 'true') return Response.json({ resumed: 0 });
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { digest } = await import('@/lib/generation-runner.server');
    const { startGenerationWorker } = await import('@/lib/generation-dispatch.server');
    const { data: stale, error } = await db.from('generation_jobs').select('id').eq('status', 'running').lt('lease_until', new Date().toISOString()).limit(2);
    if (error) return new Response('Recovery tracking unavailable', { status: 503 });
    let resumed = 0;
    for (const job of stale ?? []) {
      const token = crypto.randomUUID() + crypto.randomUUID();
      const { data: claimed, error } = await db.rpc('recover_generation_job', { p_job: job.id, p_new_hash: await digest(token) });
      if (error || !claimed) continue;
      try {
        const id = await startGenerationWorker(job.id, token);
        await db.from('generation_jobs').update({ run_id: id }).eq('id', job.id).eq('status', 'queued');
        resumed++;
      } catch {
        // A dispatcher timeout may already have launched the worker. Never dispatch again blindly.
        await db.from('generation_jobs').update({ status: 'paused', error: 'Recovery launch unconfirmed; inspect Azure execution before retrying' }).eq('id', job.id).eq('status', 'queued');
      }
    }
    return Response.json({ resumed });
  } } },
});