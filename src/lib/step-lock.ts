/**
 * One paid browser run per video at a time (owner rule, Nov 16 2026): a second window or a second Resume click
 * cannot start the same step while the first window is alive. The lock lapses ~3 minutes after its window stops renewing it.
 */
import { supabase } from '@/integrations/supabase/client';

const TTL_SECONDS = 180, RENEW_MS = 60_000;
let holderId: string | null = null;
const holder = () => (holderId ??= crypto.randomUUID());

export interface RunningStep { videoId: string; step: string; stage: string; startedAt: string; mine: boolean }
export type StepClaim = { ok: true; setStage: (stage: string) => void; release: () => Promise<void> } | { ok: false; stage: string; startedAt: string };

/** Claims `step` for this window; a refusal says what the other window is doing and since when. */
export async function claimStep(videoId: string, step: string, stage: string): Promise<StepClaim> {
  let current = stage;
  const claim = () => supabase.rpc('claim_video_step', { _video_id: videoId, _step: step, _holder: holder(), _stage: current, _ttl_seconds: TTL_SECONDS });
  const { data, error } = await claim();
  if (error) throw Error(`Could not check for another run of this video: ${error.message}`);
  if (!data?.length) {
    const { data: held } = await supabase.from('video_step_locks').select('stage, started_at').eq('video_id', videoId).eq('step', step).maybeSingle();
    return { ok: false, stage: held?.stage || step, startedAt: held?.started_at ?? new Date().toISOString() };
  }
  let lost = false;
  const timer = setInterval(() => { void claim().then(({ data: d }) => { if (!d?.length) lost = true; }); }, RENEW_MS);
  return {
    ok: true,
    setStage: (s: string) => { current = s.slice(0, 200); if (!lost) void claim(); },
    release: async () => {
      clearInterval(timer);
      await supabase.from('video_step_locks').update({ expires_at: new Date().toISOString() }).eq('video_id', videoId).eq('step', step).eq('holder', holder());
    },
  };
}

/** Paid steps currently running for this owner, in any window (shown before starting anything new). */
export async function listRunningSteps(): Promise<RunningStep[]> {
  const { data } = await supabase.from('video_step_locks').select('video_id, step, stage, started_at, holder').gt('expires_at', new Date().toISOString()).order('started_at');
  return (data ?? []).map(r => ({ videoId: r.video_id, step: r.step, stage: r.stage, startedAt: r.started_at, mine: r.holder === holderId }));
}
