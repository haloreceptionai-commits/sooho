// Creates/updates the scale-to-zero GPU finish job (cartoon-render-gpu) used by Advanced Video AI's
// Blender drawing. Copies registry/Blob secrets from cartoon-render; nothing idles between videos.
// Usage: node tools/gpu-render-job.mjs [replicas=4]
const need = k => { const v = process.env[k]; if (!v) throw Error(`${k} missing`); return v; };
const replicas = Number(process.argv[2] || 4);
const token = (await (await fetch(`https://login.microsoftonline.com/${need('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: need('AZURE_CLIENT_ID'), client_secret: need('AZURE_CLIENT_SECRET'), scope: 'https://management.azure.com/.default' }) })).json()).access_token;
const rg = `https://management.azure.com/subscriptions/${need('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${need('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App`;
const V = 'api-version=2024-03-01';
const arm = async (method, url, body) => { const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); if (!r.ok) throw Error(`${method} ${r.status}: ${t.slice(0, 800)}`); return t ? JSON.parse(t) : {}; };
const ref = await arm('GET', `${rg}/jobs/cartoon-render?${V}`);
const secrets = (await arm('POST', `${rg}/jobs/cartoon-render/listSecrets?${V}`)).value;
const c = ref.properties.template.containers[0];
const job = { location: ref.location, properties: { environmentId: ref.properties.environmentId, workloadProfileName: 'gpu-t4',
  configuration: { ...ref.properties.configuration, secrets, replicaTimeout: 7200, replicaRetryLimit: 0, manualTriggerConfig: { replicaCompletionCount: replicas, parallelism: replicas } },
  template: { containers: [{ ...c, name: 'cartoon-render-gpu', image: c.image.replace(/:[^:/]+$/, ':blender'), resources: { cpu: 8, memory: '56Gi' } }] } } };
let res = await arm('PUT', `${rg}/jobs/cartoon-render-gpu?${V}`, job);
for (let i = 0; i < 60 && !['Succeeded', 'Failed'].includes(res.properties?.provisioningState); i++) { await new Promise(r => setTimeout(r, 5000)); res = await arm('GET', `${rg}/jobs/cartoon-render-gpu?${V}`); }
console.log('cartoon-render-gpu', res.properties.provisioningState, res.properties.template.containers[0].image);
