import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { discoverFacts } from './topic-discovery.server';
import { discoveredTopicSchema, type DiscoveredTopic, type DiscoveryLibrary } from './topic-discovery';
import type { TopicUse } from './topics';
import type { Video } from './store';

export const getDiscoveries = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<DiscoveryLibrary> => {
  const { data, error } = await context.supabase.from('topic_discoveries').select('batch_id,data,saved').eq('user_id', context.userId).order('created_at', { ascending: false });
  if (error) throw new Error('Could not load saved topics.');
  const batch = data?.[0]?.batch_id;
  const rows = (data ?? []).flatMap(row => { const t = discoveredTopicSchema.safeParse(row.data); return t.success ? [{ ...row, topic: t.data }] : []; });
  return { latest: rows.filter(r => r.batch_id === batch).map(r => r.topic), saved: rows.filter(r => r.saved).map(r => r.topic) };
});

export const findTopics = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ focus: z.string().max(200), format: z.enum(['short', 'long']), deployment: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/) }).parse(input))
  .handler(async ({ data, context }): Promise<DiscoveredTopic[]> => {
    const seen: DiscoveredTopic[] = [], used: TopicUse[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await context.supabase.from('topic_discoveries').select('data').eq('user_id', context.userId).order('id').range(offset, offset + 499);
      if (result.error) throw new Error('Could not check previous suggestions.');
      for (const row of result.data ?? []) { const t = discoveredTopicSchema.safeParse(row.data); if (t.success) seen.push(t.data); }
      if ((result.data?.length ?? 0) < 500) break;
    }
    for (let offset = 0; ; offset += 500) {
      const result = await context.supabase.from('videos').select('data').eq('user_id', context.userId).order('id').range(offset, offset + 499);
      if (result.error) throw new Error('Could not check generated topics.');
      for (const row of result.data ?? []) { const v = row.data as unknown as Video; if (v.input?.topic) used.push({ topic: v.input.topic, topicId: v.input.topicId, status: v.status }); }
      if ((result.data?.length ?? 0) < 500) break;
    }
    const topics = await discoverFacts(data, seen, used), batch = crypto.randomUUID();
    const { error } = await context.supabase.from('topic_discoveries').insert(topics.map(t => ({ user_id: context.userId, batch_id: batch, fact_key: t.factKey, data: JSON.parse(JSON.stringify(t)) })));
    if (error) throw new Error('Could not save this batch safely. Please try again.');
    return topics;
  });

export const saveTopicForLater = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ factKey: z.string().min(8).max(300), saved: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from('topic_discoveries').update({ saved: data.saved }).eq('user_id', context.userId).eq('fact_key', data.factKey).select('id');
    if (result.error || !result.data?.length) throw new Error('Could not update your saved topic.');
    return { saved: data.saved };
  });