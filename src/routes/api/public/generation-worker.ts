import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/api/public/generation-worker')({
  server: { handlers: { POST: async ({ request }) => {
    const id = request.headers.get('x-generation-job'), token = request.headers.get('x-generation-token');
    if (!id || !z.string().uuid().safeParse(id).success || !token || token.length < 64 || token.length > 200) return new Response('Unauthorized', { status: 401 });
    if (Number(request.headers.get('content-length') ?? 0) > 1000) return new Response('Too large', { status: 413 });
    const { digest, advanceGeneration, GenerationCheckpointSaved } = await import('@/lib/generation-runner.server');
    const hash = await digest(token);
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { data: job } = await db.from('generation_jobs').select('*').eq('id', id).eq('token_hash', hash).maybeSingle();
    if (!job || Date.parse(job.expires_at) <= Date.now()) return new Response('Unauthorized', { status: 401 });
    const text = await request.text();
    if (text.length > 1000) return new Response('Too large', { status: 413 });
    let payload: unknown; try { payload = JSON.parse(text); } catch { return new Response('Invalid request', { status: 400 }); }
    const parsed = z.object({ action: z.enum(['claim', 'heartbeat', 'run']), owner: z.string().uuid(), fence: z.number().int().positive().optional() }).strict().safeParse(payload);
    if (!parsed.success) return new Response('Invalid request', { status: 400 });
    const { action, owner, fence } = parsed.data;
    if ((job.request as { automation?: unknown } | null)?.automation) {
      const { data: run, error: runError } = await db.from('video_automation_runs').select('private_test').eq('generation_job_id', job.id).single();
      if (runError || !run) return new Response('Automation tracking unavailable', { status: 503 });
      const { automationReadiness } = await import('@/lib/automation.server');
      if (!automationReadiness(run.private_test).ready) return Response.json({ status: 'paused', error: automationReadiness(run.private_test).reason });
    }
    if (action === 'claim') {
      const { data, error } = await db.rpc('claim_generation_job', { p_job: id, p_hash: hash, p_owner: owner });
      return error ? new Response('Claim unavailable', { status: 503 }) : Response.json({ fence: data, status: job.status });
    }
    if (!fence) return new Response('Fence required', { status: 400 });
    if (job.status === 'handoff' && (job.request as { automation?: unknown } | null)?.automation) {
      if (fence !== job.fence) return new Response('Ownership changed', { status: 409 });
      if (action === 'heartbeat') return Response.json({ accepted: true });
      const { advanceAutomationUpload } = await import('@/lib/automation.server');
      return Response.json(await advanceAutomationUpload(db, job.id, owner));
    }
    const auth = { p_job: id, p_hash: hash, p_owner: owner, p_fence: fence };
    const { data: active, error } = await db.rpc('heartbeat_generation_job', auth);
    if (error) return new Response('Tracking unavailable', { status: 503 });
    if (!active) return Response.json({ accepted: false, status: job.status });
    if (action === 'heartbeat') return Response.json({ accepted: true });
    try {
      const result = await advanceGeneration(db, job, owner, fence);
      return Response.json((job.request as { automation?: unknown } | null)?.automation && result.status === 'handoff' ? { status: 'waiting' } : result);
    }
    catch (e) {
      if (e instanceof GenerationCheckpointSaved) return Response.json({ status: 'continue' });
      const message = e instanceof Error ? e.message : 'Generation needs review';
      await db.rpc('pause_generation_job', { ...auth, p_error: message });
      if ((job.request as { automation?: unknown } | null)?.automation) {
        const { data: run } = await db.from('video_automation_runs').select('id,workspace_id').eq('generation_job_id', job.id).maybeSingle();
        if (run) {
          const { pauseAutomation } = await import('@/lib/automation.server');
          await pauseAutomation(db, run, message);
        }
      }
      return Response.json({ status: 'paused', error: message });
    }
  } } },
});