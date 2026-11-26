import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { automationTick, advanceAutomationUpload } from '@/lib/automation.server';

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(async () => 'execution-1') }));
vi.mock('@/lib/generation-dispatch.server', () => ({ startGenerationWorker: mocks.dispatch }));
vi.mock('@/lib/generation-runner.server', () => ({ digest: async () => 'a'.repeat(64) }));

const settings = { workspace_id: 'workspace-1', enabled: true, paused_reason: null, formats: ['short', 'long'], short_time: '18:00', long_time: '18:00' };
function fakeDb(opts: { busy?: boolean; reserved?: boolean; paused?: boolean; off?: boolean; upload?: boolean } = {}) {
  const claims = new Set<string>();
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'claim_video_automation_tick') return { data: !opts.busy, error: null };
    if (name === 'reserve_video_automation_run') {
      const key = `${args['p_workspace']}/${args['p_format']}/${args['p_date']}`;
      if (opts.reserved === false || claims.has(key)) return { data: null, error: null };
      claims.add(key); return { data: { id: key, generationJobId: key }, error: null };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    let write = false;
    const chain = {
      select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain, in: () => chain,
      update: () => { write = true; return chain; },
      maybeSingle: async () => ({ data: table === 'video_automation_runs' ? { id: 'run', workspace_id: 'workspace-1', status: 'generating', publish_at: '2099-11-26T18:00:00Z' } : null, error: null }),
      single: async () => ({ data: { enabled: !opts.off, paused_reason: opts.paused ? 'AI credits paused' : null }, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: write ? null : table === 'video_automation' ? opts.off || opts.paused ? [] : [settings] : [], error: null }).then(resolve),
    };
    return chain;
  });
  return { db: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from };
}
beforeEach(() => {
  vi.stubEnv('AUTOMATION_ROLLOUT_ENABLED', 'true');
  vi.stubEnv('LONGFORM_DOCUMENTARY', 'on');
  for (const key of ['AZURE_GENERATION_IMAGE', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']) vi.stubEnv(key, 'test-only');
  mocks.dispatch.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
describe('daily automation service boundaries', () => {
  it('dispatches both selected formats once and deduplicates the next tick', async () => {
    const { db } = fakeDb();
    const now = Date.parse('2026-11-26T17:00:00Z');
    expect(await automationTick(db, now)).toEqual({ started: 2 });
    expect(await automationTick(db, now + 60000)).toEqual({ started: 0 });
    expect(mocks.dispatch).toHaveBeenCalledTimes(2);
  });
  it('does not dispatch a second scheduler invocation while another owns the lease', async () => {
    expect(await automationTick(fakeDb({ busy: true }).db)).toEqual({ busy: true, started: 0 });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('does not spend for disabled automation', async () => {
    expect(await automationTick(fakeDb({ off: true }).db, Date.parse('2026-11-26T17:00:00Z'))).toEqual({ started: 0 });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('does not spend for paused automation', async () => {
    expect(await automationTick(fakeDb({ paused: true }).db, Date.parse('2026-11-26T17:00:00Z'))).toEqual({ started: 0 });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('does not bypass the production verification gate', async () => {
    vi.stubEnv('AUTOMATION_ROLLOUT_ENABLED', 'false');
    expect(await automationTick(fakeDb().db)).toMatchObject({ started: 0, blocked: expect.stringContaining('not activated') });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('does not upload when the owner turns automation off', async () => {
    const { db, rpc } = fakeDb({ off: true });
    expect(await advanceAutomationUpload(db, 'generation', 'owner')).toEqual({ status: 'paused', error: 'Daily automation is off' });
    expect(rpc).not.toHaveBeenCalled();
  });
});