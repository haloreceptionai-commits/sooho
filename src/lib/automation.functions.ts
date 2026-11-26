import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { automationConfig, defaultAutomation, nextAutomationSlots } from './automation';

const ws = z.object({ workspaceId: z.string().uuid() });
export const getAutomation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ws.parse(input))
  .handler(async ({ data, context }) => {
    const { data: own, error } = await context.supabase.from('workspaces').select('id').eq('id', data.workspaceId).eq('user_id', context.userId).maybeSingle();
    if (error || !own) throw Error('Workspace not found');
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const [{ data: saved, error: settingsError }, { data: runs, error: runsError }, { data: connected }] = await Promise.all([
      db.from('video_automation').select('*').eq('workspace_id', data.workspaceId).eq('user_id', context.userId).maybeSingle(),
      context.supabase.from('video_automation_runs').select('id,format,publish_at,generate_at,video_id,status,error,youtube_id,created_at').eq('workspace_id', data.workspaceId).order('created_at', { ascending: false }).limit(8),
      db.from('youtube_connections').select('channel_title').eq('workspace_id', data.workspaceId).eq('user_id', context.userId).maybeSingle(),
    ]);
    if (settingsError || runsError) throw Error('Could not load automation settings');
    const config = automationConfig.parse({ workspaceId: data.workspaceId, ...defaultAutomation, ...(saved ? { enabled: saved.enabled, formats: saved.formats, shortTime: saved.short_time, longTime: saved.long_time, shortSeconds: saved.short_seconds, longSeconds: saved.long_seconds, focus: saved.focus } : {}) });
    const { automationReadiness } = await import('./automation.server');
    return { config, runs: runs ?? [], channel: connected?.channel_title ?? null, connected: !!connected, readiness: automationReadiness(), pausedReason: saved?.paused_reason ?? null, lastCheckedAt: saved?.last_checked_at ?? null, next: nextAutomationSlots(config, Date.now()) };
  });

const settingsSchema = z.object({
  channelName: z.string().max(150), azureEndpoint: z.string().url().max(300), scriptDeployment: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  ttsDeployment: z.string().max(64), imageDeployment: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/), videoDeployment: z.string().max(64),
  defaultVoice: z.string().max(64), defaultStyle: z.string().max(100), burnCaptions: z.boolean(), soundEffects: z.boolean(), imageQuality: z.enum(['low', 'medium', 'high']),
  styleV: z.number().int().optional(), modelV: z.number().int().optional(),
});
export const saveAutomation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ config: automationConfig, settings: settingsSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const c = data.config;
    const { data: own, error: ownershipError } = await context.supabase.from('workspaces').select('id').eq('id', c.workspaceId).eq('user_id', context.userId).maybeSingle();
    if (ownershipError || !own) throw Error('Workspace not found');
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    if (c.enabled) {
      const { automationReadiness } = await import('./automation.server');
      const ready = automationReadiness();
      if (!ready.ready) throw Error(ready.reason ?? 'Unattended generation is not ready');
      const { data: conn, error } = await db.from('youtube_connections').select('channel_id').eq('workspace_id', c.workspaceId).eq('user_id', context.userId).maybeSingle();
      if (error || !conn) throw Error("Connect this workspace's YouTube channel first");
      if (data.settings.defaultStyle === 'Ink explainer') throw Error('Daily long-form automation uses the documentary style; choose another default visual style first.');
    }
    if (!c.enabled) {
      const { stopScheduledAutomation } = await import('./automation.server');
      await stopScheduledAutomation(db, c.workspaceId, context.userId);
    }
    const { error } = await db.from('video_automation').upsert({ workspace_id: c.workspaceId, user_id: context.userId, enabled: c.enabled, timezone: 'Europe/London', formats: c.formats, short_time: c.shortTime, long_time: c.longTime, short_seconds: c.shortSeconds, long_seconds: c.longSeconds, focus: c.focus.trim(), settings: data.settings, paused_reason: null, updated_at: new Date().toISOString() });
    if (error) throw Error('Could not save automation');
    return { saved: true, enabled: c.enabled };
  });