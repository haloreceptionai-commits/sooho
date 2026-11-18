// Quality bench: draws every frame of a test manifest with the production Blender bridge on a GPU machine, without the app.
// Inputs are read from Blob under BENCH_PREFIX (manifest.json, cards.json listing card file names, cards/<name>), the frames go back
// as one frames.tar. Runs inside the worker image; uses the job's own AZURE_BLOB_BASE / AZURE_BLOB_SAS settings (never printed).
// Usage (in the container): BENCH_PREFIX=bench/<run> node tools/bench-frames.mjs
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const base = process.env.AZURE_BLOB_BASE, sas = (process.env.AZURE_BLOB_SAS || '').replace(/^\?/, ''), prefix = process.env.BENCH_PREFIX;
if (!base || !sas || !prefix || !/^bench\/[a-z0-9-]{4,60}$/.test(prefix)) throw Error('bench settings missing');
const url = name => `${base}/${prefix}/${name}?${sas}`;
const get = async name => { const r = await fetch(url(name)); if (!r.ok) throw Error(`missing ${name} ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const put = async (name, body, type) => { const r = await fetch(url(name), { method: 'PUT', headers: { 'x-ms-version': '2021-08-06', 'x-ms-blob-type': 'BlockBlob', 'Content-Type': type }, body });
  if (!r.ok) throw Error(`upload ${name} ${r.status}`); };
const work = '/tmp/bench'; await mkdir(`${work}/cards`, { recursive: true }); await mkdir(`${work}/web`, { recursive: true }); await mkdir(`${work}/frames`, { recursive: true });
await writeFile(`${work}/manifest.json`, await get('manifest.json'));
for (const n of JSON.parse((await get('cards.json')).toString())) { if (!/^[a-z0-9_-]{1,40}\.png$/.test(n)) throw Error('bad card name'); await writeFile(`${work}/cards/${n}`, await get(`cards/${n}`)); }
const m = JSON.parse(await readFile(`${work}/manifest.json`, 'utf8'));
const total = Math.round(m.narration.samples / 48000 * 30);
const t0 = Date.now();
try {
  execFileSync(process.env.CARTOON_PYTHON || 'python3', [path.join(process.cwd(), 'blender_bridge.py'), '--manifest', `${work}/manifest.json`, '--web', `${work}/web`, '--out', `${work}/frames`,
    '--first', '0', '--last', String(total - 1), '--cards', `${work}/cards`], { stdio: 'inherit', env: { ...process.env, CYCLES_DEVICE: 'GPU' } });
} catch (e) { await put('ERROR.txt', String(e.message || e).slice(-4000), 'text/plain'); throw e; }
execFileSync('tar', ['-cf', `${work}/frames.tar`, '-C', `${work}/frames`, '.']);
await put('frames.tar', await readFile(`${work}/frames.tar`), 'application/x-tar');
await put('DONE.json', JSON.stringify({ frames: total, seconds: Math.round((Date.now() - t0) / 1000) }), 'application/json');
console.log('bench frames done', total, 'in', Math.round((Date.now() - t0) / 1000), 's');
