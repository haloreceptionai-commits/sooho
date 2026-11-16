// Runs a shell script on one scale-to-zero GPU machine using the :blender worker image (diagnostics only).
// Usage: node tools/gpu-probe.mjs <script.sh> <tag> [image-tag=blender] [profile=gpu-t4]
import { readFileSync } from 'node:fs';
const need = k => { const v = process.env[k]; if (!v) throw Error(`${k} missing`); return v; };
const [file, tag, imageTag = 'blender', profile = 'gpu-t4'] = process.argv.slice(2);
const token = (await (await fetch(`https://login.microsoftonline.com/${need('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: need('AZURE_CLIENT_ID'), client_secret: need('AZURE_CLIENT_SECRET'), scope: 'https://management.azure.com/.default' }) })).json()).access_token;
const rg = `https://management.azure.com/subscriptions/${need('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${need('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App`;
const V = 'api-version=2024-03-01';
const arm = async (method, url, body) => { const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); if (!r.ok) throw Error(`${method} ${r.status}: ${t.slice(0, 800)}`); return t ? JSON.parse(t) : {}; };
const ref = await arm('GET', `${rg}/jobs/cartoon-render?${V}`);
const secrets = (await arm('POST', `${rg}/jobs/cartoon-render/listSecrets?${V}`)).value;
const c = ref.properties.template.containers[0];
const name = 'gpu-probe';
const container = { name: 'probe', image: c.image.replace(/:[^:/]+$/, ':' + imageTag), resources: profile === 'Consumption' ? { cpu: 4, memory: '8Gi' } : { cpu: 8, memory: '56Gi' },
  env: [{ name: 'AZURE_BLOB_BASE', value: need('AZURE_BLOB_BASE') }, { name: 'AZURE_BLOB_SAS', secretRef: 'blobsas' }] };
const job = { location: ref.location, properties: { environmentId: ref.properties.environmentId, workloadProfileName: profile,
  configuration: { triggerType: 'Manual', replicaTimeout: 3600, replicaRetryLimit: 0, manualTriggerConfig: { replicaCompletionCount: 1, parallelism: 1 }, secrets, registries: ref.properties.configuration.registries },
  template: { containers: [container] } } };
let res = await arm('PUT', `${rg}/jobs/${name}?${V}`, job);
for (let i = 0; i < 60 && !['Succeeded', 'Failed'].includes(res.properties?.provisioningState); i++) { await new Promise(r => setTimeout(r, 5000)); res = await arm('GET', `${rg}/jobs/${name}?${V}`); }
const script = Buffer.from(readFileSync(file)).toString('base64');
const exec = await arm('POST', `${rg}/jobs/${name}/start?${V}`, { containers: [{ ...container, command: ['/bin/sh', '-c'], args: ['echo "$PROBE" | base64 -d > /tmp/probe.sh && sh /tmp/probe.sh'],
  env: [...container.env, { name: 'PROBE', value: script }, { name: 'TAG', value: tag }] }] });
console.log('execution', exec.name);
