// Starts on-demand Azure Container Apps Job executions for cartoon rendering.
// Jobs use the Consumption profile, so nothing runs (or bills compute) between videos.
const API = '2024-03-01';

function env(name: string) {
  const v = process.env[name];
  if (!v) throw Error('Azure rendering is not configured');
  return v;
}

async function armToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: env('AZURE_CLIENT_ID'), client_secret: env('AZURE_CLIENT_SECRET'), scope: 'https://management.azure.com/.default' });
  const r = await fetch(`https://login.microsoftonline.com/${env('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!r.ok) throw Error(`Azure sign-in failed [${r.status}]`);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function putInput(key: string, input: unknown) {
  const url = `${env('AZURE_BLOB_BASE')}/${key}?${env('AZURE_BLOB_SAS').replace(/^\?/, '')}`;
  const r = await fetch(url, { method: 'PUT', headers: { 'x-ms-version': '2021-08-06', 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!r.ok) throw Error(`Cartoon input could not be saved [${r.status}]`);
}

export async function readAzureCartoonLock(storeId: string) {
  if (!/^cartoon-[0-9a-f-]{36}$/.test(storeId)) throw Error('Invalid saved cartoon store');
  const r = await fetch(`${env('AZURE_BLOB_BASE')}/${storeId}/LOCK?${env('AZURE_BLOB_SAS').replace(/^\?/, '')}`);
  if (!r.ok) throw Error('Saved approved cartoon inputs are unavailable; no new render was started');
  return r.json() as Promise<{ jobId?: string; hash?: string; requestHash?: string }>;
}

// Finish fans out to `replicas` machines (set on the Azure job as parallelism); frames are split evenly.
// The subscription's Consumption quota is 100 vCPU: 23 x 4 render + 4 preview + the coordinator fit at once.
// Each 4-vCPU machine runs 2 browsers on the Mesa lavapipe Vulkan driver (about 3x SwiftShader).
export const AZURE_JOBS = { preflight: { name: 'cartoon-preflight', lanes: 2, replicas: 1 }, finish: { name: 'cartoon-render', lanes: 2, replicas: 23 } } as const;
// Advanced Video AI draws its frames with the Blender 3D engine on scale-to-zero T4 graphics machines
// (about 4 run at once in this subscription). Each frame batch falls back to the web engine on failure.
export const GPU_FINISH = { name: 'cartoon-render-gpu', lanes: 1, replicas: 4 } as const;
const RUN_ID = /^azure:(cartoon-preflight|cartoon-render-gpu|cartoon-render)-[a-z0-9]+$/;

/** Finishing an Advanced Video AI job (painted cards in the request) uses the Blender renderer unless switched off. */
export function usesBlender(mode: 'preflight' | 'finish', input: unknown) {
  if (mode !== 'finish' || process.env['ADVANCED_BLENDER'] === 'off') return false;
  const manifest = (input as { manifest?: { cards?: unknown[]; advanced?: boolean } })?.manifest;
  // People are 3D figures now, so an Advanced job may carry only object cards or none at all.
  return manifest?.advanced === true || (Array.isArray(manifest?.cards) && manifest.cards.length > 0);
}

export const cartoonInputKey = (jobId: string, mode: 'preflight' | 'finish') => `cartoon-${jobId}/INPUT-${mode}-${Date.now().toString(36)}`;

export async function startAzureCartoon(jobId: string, mode: 'preflight' | 'finish', input: unknown, key = cartoonInputKey(jobId, mode)) {
  await putInput(key, input);
  const blender = usesBlender(mode, input);
  const job = blender ? GPU_FINISH : AZURE_JOBS[mode];
  const url = `https://management.azure.com/subscriptions/${env('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${env('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs/${job.name}/start?api-version=${API}`;
  const template = {
    containers: [{
      name: job.name,
      // Drawing machines use the slim tag (no speech-alignment model) so 40 replicas start faster; Blender machines use :blender.
      image: blender ? env('AZURE_RENDER_IMAGE').replace(/:[^:/]+$/, ':blender') : mode === 'finish' ? env('AZURE_RENDER_IMAGE').replace(/:[^:/]+$/, ':slim') : env('AZURE_RENDER_IMAGE'),
      resources: blender ? { cpu: 8, memory: '56Gi' } : { cpu: 4, memory: '8Gi' },
      env: [
        { name: 'AZURE_BLOB_BASE', value: env('AZURE_BLOB_BASE') },
        { name: 'AZURE_BLOB_SAS', secretRef: 'blobsas' },
        { name: 'CARTOON_PARALLEL', value: String(job.lanes) },
        { name: 'CARTOON_REPLICAS', value: String(job.replicas) },
        { name: 'CARTOON_GL', value: 'auto' },
        { name: 'CARTOON_INPUT_KEY', value: key },
        ...(blender ? [{ name: 'CARTOON_RENDERER', value: 'blender' }] : []),
      ],
    }],
  };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await armToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(template) });
  if (!r.ok && r.status !== 202) {
    console.error('Azure start', job.name, r.status, await r.text());
    // A refused graphics-machine start is certain (nothing ran), so the web-engine machines take over safely.
    if (blender && r.status >= 400 && r.status < 500) return startWebFinish(jobId, input, key);
    throw Error(`Cartoon rendering could not start on Azure [${r.status}]`);
  }
  const result = await r.json().catch(() => ({})) as { name?: string; id?: string };
  const id = result.name || result.id?.split('/').pop();
  if (!id) throw Error('Azure start was not confirmed; do not resubmit');
  return `azure:${id}`;
}

async function startWebFinish(jobId: string, input: unknown, key: string) {
  const job = AZURE_JOBS.finish;
  const url = `https://management.azure.com/subscriptions/${env('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${env('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs/${job.name}/start?api-version=${API}`;
  const template = { containers: [{ name: job.name, image: env('AZURE_RENDER_IMAGE').replace(/:[^:/]+$/, ':slim'), resources: { cpu: 4, memory: '8Gi' }, env: [
    { name: 'AZURE_BLOB_BASE', value: env('AZURE_BLOB_BASE') }, { name: 'AZURE_BLOB_SAS', secretRef: 'blobsas' }, { name: 'CARTOON_PARALLEL', value: String(job.lanes) },
    { name: 'CARTOON_REPLICAS', value: String(job.replicas) }, { name: 'CARTOON_GL', value: 'auto' }, { name: 'CARTOON_INPUT_KEY', value: key }] }] };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await armToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(template) });
  if (!r.ok && r.status !== 202) throw Error(`Cartoon rendering could not start on Azure [${r.status}] (job ${jobId})`);
  const result = await r.json().catch(() => ({})) as { name?: string; id?: string };
  const id = result.name || result.id?.split('/').pop();
  if (!id) throw Error('Azure start was not confirmed; do not resubmit');
  return `azure:${id}`;
}

/** Azure's own view of one execution, plus whether the worker ever wrote anything for this job. */
export async function azureStartHealth(jobId: string, runId: string) {
  const m = RUN_ID.exec(runId);
  if (!m) return null;
  const exec = runId.slice('azure:'.length);
  const url = `https://management.azure.com/subscriptions/${env('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${env('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs/${m[1]}/executions/${exec}?api-version=${API}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${await armToken()}` } });
  if (!r.ok) return null;
  const status = ((await r.json()) as { properties?: { status?: string } }).properties?.status ?? '';
  const list = await fetch(`${env('AZURE_BLOB_BASE')}?restype=container&comp=list&prefix=cartoon-${jobId}/&${env('AZURE_BLOB_SAS').replace(/^\?/, '')}`);
  const names = [...(await list.text()).matchAll(/<Name>([^<]*)<\/Name>/g)].map(x => x[1]!);
  return { status, mode: m[1] === 'cartoon-preflight' ? 'preflight' as const : 'finish' as const, workerWrote: names.some(n => !/\/INPUT-[a-z]+-[a-z0-9]+$/.test(n)) };
}


const mgmt = () => `https://management.azure.com/subscriptions/${env('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${env('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs`;
export interface CartoonExecution { id: string; status: string; startMs: number; inputKey: string }

/** Azure's executions for one cartoon job and stage, newest first, matched by the private input each one was given. */
export async function cartoonExecutions(jobId: string, mode: 'preflight' | 'finish'): Promise<CartoonExecution[]> {
  type Exec = { name: string; properties: { status?: string; startTime?: string; template?: { containers?: { env?: { name: string; value?: string }[] }[] } } };
  const jobs = mode === 'finish' ? [AZURE_JOBS.finish.name, GPU_FINISH.name] : [AZURE_JOBS[mode].name];
  const list: Exec[] = [];
  for (const job of jobs) {
    const r = await fetch(`${mgmt()}/${job}/executions?api-version=${API}`, { headers: { Authorization: `Bearer ${await armToken()}` } });
    if (r.status === 404 && job === GPU_FINISH.name) continue;
    if (!r.ok) throw Error(`Azure executions unavailable [${r.status}]`);
    list.push(...(((await r.json()) as { value?: Exec[] }).value ?? []));
  }
  const prefix = `cartoon-${jobId}/INPUT-${mode}-`;
  return list.map(e => ({ id: `azure:${e.name}`, status: e.properties.status ?? 'Unknown', startMs: Date.parse(e.properties.startTime ?? '') || 0, inputKey: e.properties.template?.containers?.[0]?.env?.find(v => v.name === 'CARTOON_INPUT_KEY')?.value ?? '' }))
    .filter(e => e.inputKey.startsWith(prefix)).sort((a, b) => b.startMs - a.startMs);
}

export async function stopAzureExecution(runId: string) {
  const m = RUN_ID.exec(runId);
  if (!m) return false;
  const r = await fetch(`${mgmt()}/${m[1]}/executions/${runId.slice(6)}/stop?api-version=${API}`, { method: 'POST', headers: { Authorization: `Bearer ${await armToken()}` } });
  return r.ok || r.status === 202;
}

/** What the worker saved for a job: names with write times, frame batches finished, and any checkpointed completion. */
export async function cartoonStoreState(jobId: string) {
  const items: { name: string; ms: number }[] = [];
  let marker = '';
  do {
    const t = await (await fetch(`${env('AZURE_BLOB_BASE')}?restype=container&comp=list&prefix=cartoon-${jobId}/${marker ? `&marker=${encodeURIComponent(marker)}` : ''}&${env('AZURE_BLOB_SAS').replace(/^\?/, '')}`)).text();
    for (const b of t.matchAll(/<Blob><Name>([^<]*)<\/Name>.*?<Last-Modified>([^<]*)<\/Last-Modified>/gs)) items.push({ name: b[1]!.slice(`cartoon-${jobId}/`.length), ms: Date.parse(b[2]!) });
    marker = /<NextMarker>([^<]+)<\/NextMarker>/.exec(t)?.[1] ?? '';
  } while (marker);
  const parts = items.filter(i => /^part-\d+$/.test(i.name)).length;
  const pending = items.some(i => i.name === 'PENDING-COMPLETION');
  return { items, parts, pending, wroteSince: (ms: number) => items.some(i => i.ms >= ms - 2000 && !i.name.startsWith('INPUT-')) };
}

export async function readCartoonPending(jobId: string) {
  const r = await fetch(`${env('AZURE_BLOB_BASE')}/cartoon-${jobId}/PENDING-COMPLETION?${env('AZURE_BLOB_SAS').replace(/^\?/, '')}`);
  return r.ok ? r.json() as Promise<unknown> : null;
}

/** One execution by its tracked run id; null when Azure no longer knows it. */
export async function cartoonExecution(runId: string) {
  const m = RUN_ID.exec(runId);
  if (!m) return null;
  const r = await fetch(`${mgmt()}/${m[1]}/executions/${runId.slice(6)}?api-version=${API}`, { headers: { Authorization: `Bearer ${await armToken()}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw Error(`Azure execution unavailable [${r.status}]`);
  const p = ((await r.json()) as { properties?: { status?: string; startTime?: string } }).properties;
  return { status: p?.status ?? 'Unknown', startMs: Date.parse(p?.startTime ?? '') || 0 };
}
