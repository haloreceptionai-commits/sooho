const env = (key: string) => { const value = process.env[key]; if (!value) throw Error('Generation worker is not configured'); return value; };
export async function startGenerationWorker(jobId: string, token: string) {
  const login = await fetch(`https://login.microsoftonline.com/${env('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env('AZURE_CLIENT_ID'), client_secret: env('AZURE_CLIENT_SECRET'), scope: 'https://management.azure.com/.default' }) });
  if (!login.ok) throw Error(`Worker sign-in failed [${login.status}]`);
  const auth = await login.json() as { access_token: string };
  const url = `https://management.azure.com/subscriptions/${env('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${env('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs/chronicle-generation/start?api-version=2024-03-01`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ containers: [{ name: 'chronicle-generation', image: env('AZURE_GENERATION_IMAGE'), resources: { cpu: 0.5, memory: '1Gi' }, env: [{ name: 'GENERATION_ENDPOINT', value: 'https://sooho.lovable.app/api/public/generation-worker' }, { name: 'GENERATION_JOB_ID', value: jobId }, { name: 'GENERATION_TOKEN', value: token }] }] }) });
  if (!response.ok) throw Error(`Worker submission is unconfirmed [${response.status}]; do not resubmit`);
  const result = await response.json() as { name?: string };
  if (!result.name) throw Error('Worker submission is unconfirmed; do not resubmit');
  return result.name;
}