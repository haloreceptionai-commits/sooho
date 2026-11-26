import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { z } from 'zod';
import { discoveryTarget } from '@/lib/topic-discovery';

export const Route = createFileRoute('/api/public/automation')({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    const text = await request.text();
    if (text.length > 1000) return new Response('Request too large', { status: 413 });
    let body: unknown; try { body = JSON.parse(text); } catch { return new Response('Invalid request', { status: 400 }); }
    if (!z.object({}).strict().safeParse(body).success) return new Response('Invalid request', { status: 400 });
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { automationTick } = await import('@/lib/automation.server');
    return Response.json({ ...await automationTick(supabaseAdmin), topicTarget: discoveryTarget('automation') });
  } } },
});