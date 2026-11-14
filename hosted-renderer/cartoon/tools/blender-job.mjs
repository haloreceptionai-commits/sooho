// Creates/updates the scale-to-zero Blender shot job and optionally runs one test execution.
// Usage: node tools/blender-job.mjs <tag> <profile gpu-t4|Consumption> [run <outPrefix> <engines> [shot]]
// The job copies the registry and Blob credentials from the existing cartoon-render job; nothing idles.
const need = k => { const v = process.env[k]; if (!v) throw Error(`${k} missing`); return v; };
const [tag = 'gpu1', profile = 'gpu-t4', cmd, outPrefix, engines = 'eevee cycles', shot = 'mine-push-in'] = process.argv.slice(2);
const token = (await (await fetch(`https://login.microsoftonline.com/${need('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: need('AZURE_CLIENT_ID'), client_secret: need('AZURE_CLIENT_SECRET'), scope: 'https://management.azure.com/.default' }) })).json()).access_token;
const rg = `https://management.azure.com/subscriptions/${need('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${need('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App`;
const V = 'api-version=2024-03-01';
const arm = async (method, url, body) => { const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); if (!r.ok) throw Error(`${method} ${r.status}: ${t.slice(0, 800)}`); return t ? JSON.parse(t) : {}; };
const ref = await arm('GET', `${rg}/jobs/cartoon-render?${V}`);
const secrets = (await arm('POST', `${rg}/jobs/cartoon-render/listSecrets?${V}`)).value;
const gpu = profile !== 'Consumption';
const name = gpu ? 'blender-shot-gpu' : 'blender-shot-cpu';
const job = { location: ref.location, properties: { environmentId: ref.properties.environmentId, workloadProfileName: profile,
  configuration: { triggerType: 'Manual', replicaTimeout: 3600, replicaRetryLimit: 0, manualTriggerConfig: { replicaCompletionCount: 1, parallelism: 1 },
    secrets, registries: ref.properties.configuration.registries },
  template: { containers: [{ name: 'shot', image: `${need('AZURE_REGISTRY_LOGIN_SERVER')}/blender-renderer:${tag}`,
    resources: gpu ? { cpu: 8, memory: '56Gi' } : { cpu: 4, memory: '8Gi' },
    env: [{ name: 'AZURE_BLOB_BASE', value: need('AZURE_BLOB_BASE') }, { name: 'AZURE_BLOB_SAS', secretRef: 'blobsas' }] }] } } };
let res = await arm('PUT', `${rg}/jobs/${name}?${V}`, job);
for (let i = 0; i < 60 && !['Succeeded', 'Failed'].includes(res.properties?.provisioningState); i++) { await new Promise(r => setTimeout(r, 5000)); res = await arm('GET', `${rg}/jobs/${name}?${V}`); }
console.log('job', name, res.properties.provisioningState);
if (cmd === 'run') {
  const c = job.properties.template.containers[0];
  const exec = await arm('POST', `${rg}/jobs/${name}/start?${V}`, { containers: [{ ...c, env: [...c.env, { name: 'OUT_PREFIX', value: outPrefix }, { name: 'ENGINES', value: engines }, { name: 'SHOT', value: shot }] }] });
  console.log('execution', exec.name ?? exec.id);
  for (;;) { await new Promise(r => setTimeout(r, 20000)); const e = await arm('GET', `${rg}/jobs/${name}/executions/${exec.name}?${V}`); const st = e.properties.status;
    if (!['Running', 'Processing'].includes(st)) { console.log('status', st); break; } }
}
