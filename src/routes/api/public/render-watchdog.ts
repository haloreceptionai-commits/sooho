import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

// Scheduled every few minutes: continues or completes cartoon renders whose Azure machines stopped,
// never started, or finished without reporting. Only the scheduler's secret may call it.
export const Route = createFileRoute('/api/public/render-watchdog')({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request); if (failure) return failure;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { superviseRenderJobs } = await import('@/lib/render-watchdog.server');
    try { return Response.json({ checked: await superviseRenderJobs(supabaseAdmin) }); }
    catch (e) { console.error('Render watchdog', e); return new Response('Render watchdog unavailable', { status: 503 }); }
  } } },
});
