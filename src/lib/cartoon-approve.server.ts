import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { reviewMatches, type CartoonReview } from '@/lib/cartoon-job';
import { startAzureCartoon, cartoonInputKey } from '@/lib/azure-render';
import { RENDER_CALLBACK_URL } from '@/lib/render-complete';

const CARTOON_ACTOR = 'nifty_remnant~chronicle-cartoon-renderer';
/** Starts the full render for a matching preview. Owner click, or automatic for Advanced Video AI (no preview gate). */
export async function approveCartoonOperation(data: { videoId: string; hash: string }, ownerId: string, db: SupabaseClient<Database>) {
    const { data: row } = await db.from('videos').select('data').eq('id', data.videoId).single();
    const { data: job } = await db.from('render_jobs').select('*').eq('video_id', data.videoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!row || !job || job.user_id !== ownerId) throw Error('Video not found');
    const review = (row.data as Record<string, Json>)['cartoonReview'] as unknown as CartoonReview | undefined;
    if (!reviewMatches(review, data.hash) || !review || job.status !== 'review') throw Error('This preview changed or was already approved');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await digest(token);
    const { data: claimed, error } = await supabaseAdmin.rpc('approve_cartoon_render', { job_id: job.id, owner_id: ownerId, review_hash: data.hash, next_token_hash: tokenHash });
    if (error || !claimed) throw Error('Preview was already approved or expired');
    try {
      // Saved previews from the older Apify worker keep finishing there; new previews finish on Azure.
      const legacy = !/^cartoon-[0-9a-f-]{36}$/.test(review.storeId);
      const finishInput = { jobId: job.id, callbackToken: token, callbackUrl: callbackAddress(), manifest: job.manifest, mode: 'finish', storeId: review.storeId, approvedHash: data.hash };
      if (!legacy) {
        const key = cartoonInputKey(job.id, 'finish');
        await supabaseAdmin.from('render_jobs').update({ recovery: { claimedAt: Date.now(), inputKey: key } }).eq('id', job.id);
        try {
          const run = await startAzureCartoon(job.id, 'finish', finishInput, key);
          await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).not('status', 'in', '(done,failed,cancelled)');
        } catch (e) {
          // Uncertain starts are reconciled by the render watchdog against Azure, never resubmitted blindly.
          console.error('Cartoon finish start unconfirmed', e instanceof Error ? e.message : e);
        }
        await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { detail: 'Full cartoon render · safe to close your browser', hostedRender: { id: job.id, status: 'running' } }, saved_path: '' });
        return { accepted: true };
      }
      const run = await startActor(...apifyKeys(), finishInput);
      const { error: trackError } = await supabaseAdmin.from('render_jobs').update({ run_id: run }).eq('id', job.id).not('status', 'in', '(done,failed,cancelled)');
      if (trackError) throw Error('Cartoon started but tracking could not be saved; do not resubmit');
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'running', video_patch: { detail: 'Full cartoon render · safe to close your browser', hostedRender: { id: job.id, status: 'running' } }, saved_path: '' });
      return { accepted: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Cartoon submission could not be confirmed';
      await supabaseAdmin.rpc('apply_render_event', { job_id: job.id, job_token: tokenHash, next_status: 'failed', video_patch: { status: 'failed', error: message, detail: 'Submission unconfirmed · saved preview is safe', hostedRender: { id: job.id, status: 'failed' } }, saved_path: '' });
      throw Error(message);
    }
  }
function apifyKeys(): [string, string] {
  const key = process.env['LOVABLE_API_KEY'], connection = process.env['APIFY_API_KEY'];
  if (!key || !connection) throw Error('Apify is not connected');
  return [key, connection];
}
async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join(''); }
function callbackAddress() { return RENDER_CALLBACK_URL; }
async function startActor(key: string, connection: string, input: unknown) {
  const response = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${CARTOON_ACTOR}/runs?memory=32768&timeout=21600`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) throw Error(`Cartoon rendering could not start [${response.status}]`);
  const result = await response.json() as { data?: { id?: string } };
  if (!result.data?.id) throw Error('Cartoon start was not confirmed; do not resubmit');
  return result.data.id;
}
