// Re-deploys the still/AI-motion assembly Actor from these source files (run `bun hosted-renderer/prepare.ts` first).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const key = process.env.LOVABLE_API_KEY, connection = process.env.APIFY_API_KEY;
if (!key || !connection) throw Error('Apify connection unavailable');
const ACTOR = 'osLa4h1pD9aFfZBhQ', base = 'https://connector-gateway.lovable.dev/apify';
const api = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const t = await r.text(); if (!r.ok) throw Error(`${r.status} ${t.slice(0, 300)}`); return JSON.parse(t).data; };
const sourceFiles = await Promise.all(['main.js', 'package.json', 'Dockerfile', 'renderer.js', 'align-ink.py', 'cartoon/acoustic.py', 'cartoon/acoustic_windows.py', 'cartoon/alignment.py', 'cartoon/acoustic-model.json'].map(async name => ({ name: name.startsWith('cartoon/') ? path.basename(name) : name, format: 'TEXT', content: await readFile(path.join(import.meta.dirname, name), 'utf8') })));
await api('PUT', `/acts/${ACTOR}/versions/0.1`, { versionNumber: '0.1', sourceType: 'SOURCE_FILES', buildTag: 'latest', sourceFiles });
let build = await api('POST', `/acts/${ACTOR}/builds?version=0.1&useCache=true&tag=latest`);
for (let i = 0; i < 60 && ['READY', 'RUNNING'].includes(build.status); i++) { await new Promise(r => setTimeout(r, 5000)); build = await api('GET', `/actor-builds/${build.id}`); }
console.log(JSON.stringify({ buildId: build.id, status: build.status }));
