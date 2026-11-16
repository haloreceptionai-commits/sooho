// Builds the cartoon renderer images in Azure Container Registry (ACR Tasks), with no local Docker:
// uploads this folder as a tarball and schedules two Docker builds, the full image (:v1, with the
// speech-alignment model) and the slim render image (:slim). Usage: node tools/azure-build.mjs [tags] [dir] [image]
// e.g. node tools/azure-build.mjs gpu1 blender blender-renderer builds the Blender shot renderer image.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
const need = n => { const v = process.env[n]; if (!v) throw Error(`${n} missing`); return v; };
const root = path.resolve(import.meta.dirname, '..', process.argv[3] || '.');
const imageName = process.argv[4] || 'cartoon-renderer';
const registry = need('AZURE_REGISTRY_LOGIN_SERVER').split('.')[0];
const base = `https://management.azure.com/subscriptions/${need('AZURE_SUBSCRIPTION_ID')}/resourceGroups/${need('AZURE_RESOURCE_GROUP')}/providers/Microsoft.ContainerRegistry/registries/${registry}`;
const token = (await (await fetch(`https://login.microsoftonline.com/${need('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST',
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: need('AZURE_CLIENT_ID'), client_secret: need('AZURE_CLIENT_SECRET'), scope: 'https://management.azure.com/.default' }) })).json()).access_token;
const arm = async (method, url, body) => { const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw Error(`ACR ${r.status}: ${(await r.text()).slice(0, 600)}`); return r.status === 204 ? {} : r.json(); };
const tar = '/tmp/cartoon-src.tar.gz';
execFileSync('tar', ['-czf', tar, '--exclude=__pycache__', '--exclude=node_modules', '--exclude=test_*.py', '-C', root, '.']);
console.log('source', Math.round(statSync(tar).size / 1e6), 'MB');
const up = await arm('POST', `${base}/listBuildSourceUploadUrl?api-version=2019-06-01-preview`);
const put = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob' }, body: readFileSync(tar) });
if (!put.ok) throw Error(`Source upload failed ${put.status}`);
const tags = (process.argv[2] || 'v1,slim').split(',');
const runs = [];
for (const tag of tags) {
  const run = await arm('POST', `${base}/scheduleRun?api-version=2019-06-01-preview`, { type: 'DockerBuildRequest', isPushEnabled: true, sourceLocation: up.relativePath,
    dockerFilePath: 'Dockerfile', imageNames: [`${imageName}:${tag}`], platform: { os: 'Linux', architecture: 'amd64' }, timeout: 3600, agentConfiguration: { cpu: 2 },
    arguments: [{ name: 'ALIGN', value: tag === 'slim' || tag.startsWith('blender') ? '0' : '1', isSecret: false }, { name: 'BLENDER', value: tag.startsWith('blender') ? '1' : '0', isSecret: false }] });
  runs.push([tag, run.properties?.runId ?? run.name]); console.log('scheduled', tag, runs.at(-1)[1]);
}
for (const [tag, id] of runs) {
  for (;;) { const r = await arm('GET', `${base}/runs/${id}?api-version=2019-06-01-preview`); const st = r.properties.status;
    if (['Succeeded', 'Failed', 'Canceled', 'Error', 'Timeout'].includes(st)) { console.log(tag, st); if (st !== 'Succeeded') process.exitCode = 1; break; }
    await new Promise(res => setTimeout(res, 15000)); }
}
