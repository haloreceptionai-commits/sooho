// Runs a short command inside a freshly built worker image on one of the Container Apps jobs and reports Succeeded/Failed,
// so a broken image is found before a paid video uses it. Needs the same AZURE_* settings as azure-build.mjs.
// Usage: node tools/smoke-test.mjs <job> <tag> "<shell command>"
//   node tools/smoke-test.mjs cartoon-preflight v1 "cd /usr/src/app && node prepare.mjs /tmp/proof"
const need = n => { const v = process.env[n]; if (!v) throw Error(`${n} missing`); return v; };
const [job, tag, cmd] = process.argv.slice(2);
if (!job || !tag || !cmd) throw Error('usage: smoke-test.mjs <job> <tag> "<shell command>"');
const token = (await (await fetch(`https://login.microsoftonline.com/${need('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: need('AZURE_CLIENT_ID'), client_secret: need('AZURE_CLIENT_SECRET'), scope: 'https://management.azure.com/.default' }) })).json()).access_token;
const base = `https://management.azure.com/subscriptions/${need('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${need('AZURE_RESOURCE_GROUP')}/providers/Microsoft.App/jobs/${job}`;
const V = 'api-version=2024-03-01';
const arm = async (method, url, body) => { const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); if (!r.ok) throw Error(`${method} ${r.status}: ${t.slice(0, 500)}`); return t ? JSON.parse(t) : {}; };
const def = await arm('GET', `${base}?${V}`);
const c = def.properties.template.containers[0];
const image = c.image.replace(/:[^:/]+$/, `:${tag}`);
const started = await arm('POST', `${base}/start?${V}`, { template: { containers: [{ ...c, image, command: ['sh', '-c', cmd], args: [] }] } });
const name = started.name || started.id?.split('/').pop();
console.log('started', job, image, name);
const stop = Date.now() + 25 * 60_000;
for (;;) {
  await new Promise(r => setTimeout(r, 15000));
  const e = await arm('GET', `${base}/executions/${name}?${V}`).catch(() => null);
  const st = e?.properties?.status;
  if (['Succeeded', 'Failed', 'Stopped', 'Degraded'].includes(st)) { console.log('smoke test', st); process.exit(st === 'Succeeded' ? 0 : 1); }
  if (Date.now() > stop) { console.log('smoke test timed out'); process.exit(1); }
}
