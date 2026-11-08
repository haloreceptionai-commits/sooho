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

// Finish fans out to `replicas` machines (set on the Azure job as parallelism); frames are split evenly.
// Each 4-vCPU machine runs 2 browsers on the Mesa lavapipe Vulkan driver (about 3x SwiftShader).
export const AZURE_JOBS = { preflight: { name: 'cartoon-preflight', lanes: 2, replicas: 1 }, finish: { name: 'cartoon-render', lanes: 2, replicas: 40 } } as const;

export async function startAzureCartoon(jobId: string, mode: 'preflight' | 'finish', input: unknown) {
  const key = `cartoon-${jobId}/INPUT-${mode}-${Date.now().toString(36)}`;
  await putInput(key, input);
  const job = AZURE_JOBS[mode];
  const url = `https://management.azure.com/subscriptions/${env('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${env('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs/${job.name}/start?api-version=${API}`;
  const template = {
    containers: [{
      name: job.name,
      // Drawing machines use the slim tag (no speech-alignment model) so 40 replicas start faster.
      image: mode === 'finish' ? env('AZURE_RENDER_IMAGE').replace(/:[^:/]+$/, ':slim') : env('AZURE_RENDER_IMAGE'),
      resources: { cpu: 4, memory: '8Gi' },
      env: [
        { name: 'AZURE_BLOB_BASE', value: env('AZURE_BLOB_BASE') },
        { name: 'AZURE_BLOB_SAS', secretRef: 'blobsas' },
        { name: 'CARTOON_PARALLEL', value: String(job.lanes) },
        { name: 'CARTOON_REPLICAS', value: String(job.replicas) },
        { name: 'CARTOON_GL', value: 'auto' },
        { name: 'CARTOON_INPUT_KEY', value: key },
      ],
    }],
  };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await armToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(template) });
  if (!r.ok && r.status !== 202) { console.error('Azure start', r.status, await r.text()); throw Error(`Cartoon rendering could not start on Azure [${r.status}]`); }
  const result = await r.json().catch(() => ({})) as { name?: string; id?: string };
  const id = result.name || result.id?.split('/').pop();
  if (!id) throw Error('Azure start was not confirmed; do not resubmit');
  return `azure:${id}`;
}
