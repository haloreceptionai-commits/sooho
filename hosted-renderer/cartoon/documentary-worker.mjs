// Documentary render job (long-form videos made of still pictures): aligns the narration, estimates depth, renders the frames in
// shards across all replicas, then one replica joins the pieces with the soundtrack, uploads the MP4 and reports completion.
// Same callback protocol as the hosted assembler: {type:'progress'|'failed'|'done'}; the finished file goes to the signed upload URL.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { platform, netFetch } from './platform.mjs';
import { deflateSync } from 'node:zlib';

/** A fully transparent PNG of the given size (used for a cutout whose picture is not available). */
export function blankPng(w, h) {
  const crc = (buf) => { let c = ~0; for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (~c) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + w * 4);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const python = process.env.CARTOON_PYTHON || 'python3';
const root = path.dirname(new URL(import.meta.url).pathname);
const doc = path.join(root, 'documentary');
const SHARD = Number(process.env.DOC_SHARD) || 150;          // frames per piece (5 s)
const STALE = 4 * 60 * 1000;                                  // a claimed piece with no result after this is taken over
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = b => createHash('sha256').update(b).digest('hex');

export async function runDocumentary(input) {
  if (!input?.jobId || !input.callbackToken || !input.uploadUrl || input.manifest?.kind !== 'documentary') throw Error('Invalid documentary job');
  // DOC_TEST=1 exists only on throw-away smoke jobs: no cloud callbacks, and the finished file goes to the test's own upload address.
  const testMode = process.env.DOC_TEST === '1';
  if (!testMode) {
    const address = new URL(input.callbackUrl);
    if (address.protocol !== 'https:' || !['sooho.lovable.app', 'sooha.io'].includes(address.hostname) || address.pathname !== '/api/public/render-callback') throw Error('Invalid completion address');
  }
  const m = input.manifest.doc;
  const work = path.join(os.tmpdir(), 'doc-job');
  const dirs = { img: path.join(work, 'img'), depth: path.join(work, 'depth'), takes: path.join(work, 'takes'), aligned: path.join(work, 'aligned'), parts: path.join(work, 'parts') };
  for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });
  const store = await platform.open(`cartoon-${input.jobId}`);
  const fleet = Math.max(1, Number(process.env.CARTOON_REPLICAS) || 1);
  const lanes = Math.max(1, Number(process.env.CARTOON_PARALLEL) || 3);
  const env = { DOC_DEPTH_MODEL: process.env.DOC_DEPTH_MODEL || '/opt/cartoon/depth_small.onnx' };
  const timings = {};
  const lap = (name, since) => { timings[name] = Math.round((Date.now() - since) / 100) / 10; console.log(JSON.stringify({ timing: name, sec: timings[name] })); };

  async function notify(event) {
    if (testMode) { console.log('EVENT', JSON.stringify(event).slice(0, 200)); return { accepted: true }; }
    for (let i = 0; i < 6; i++) {
      const r = await netFetch(input.callbackUrl, { method: 'POST', headers: { 'x-render-job': input.jobId, 'x-render-token': input.callbackToken, 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) throw Error(`Cloud callback rejected [${r.status}]`);
      await sleep(2000 * 2 ** i);
    }
    throw Error('Cloud callback unavailable');
  }
  class Cancelled extends Error {}
  let lastProgress = 0;
  async function guard(progress) {
    lastProgress = Math.max(lastProgress, progress);
    const state = await notify({ type: 'progress', progress: Math.min(99, lastProgress) });
    if (!state.accepted) throw new Cancelled('Render cancelled or expired');
  }
  function run(command, args, extraEnv = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
      let err = '';
      child.stdout.on('data', v => process.stdout.write(v));
      child.stderr.on('data', v => { err = (err + v).slice(-2500); process.stderr.write(v); });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(Error(`Step failed: ${err.slice(-400)}`)));
    });
  }
  // A step that crashes is retried a couple of times (saved inputs make a repeat free); only a real cancel stops it at once.
  async function heal(command, args, extraEnv = {}, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await run(command, args, extraEnv); } catch (e) {
        last = e; if (e instanceof Cancelled) throw e;
        console.error(JSON.stringify({ step_retry: i + 1, of: tries, step: path.basename(String(args[0] || command)), error: String(e.message).slice(-300) }));
        if (i + 1 < tries) await sleep(3000 * (i + 1));
      }
    }
    throw last;
  }
  const cli = (...a) => heal(python, [path.join(doc, 'doc_cli.py'), ...a], env);
  async function pool(items, limit, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }
  async function fetchTo(url, file) {
    const r = await netFetch(url);
    if (!r.ok) throw Error(`Saved media could not load [${r.status}]`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
  }
  const signed = p => { const u = input.signed?.[p]; if (!u) throw Error('Missing media grant'); return u; };

  await guard(0);
  const mpath = path.join(work, 'doc.json');
  await writeFile(mpath, JSON.stringify(m));
  const total = (m.voice || []).length;

  // 1) pictures (every machine needs them to draw its pieces)
  let t0 = Date.now();
  await pool(m.images.map((p, i) => [p, i]), 8, async ([p, i]) => fetchTo(signed(p), path.join(dirs.img, `img-${i}.jpg`)));
  // cutouts of the people in the story (transparent pictures laid in front of the backgrounds)
  // cutouts are optional: a person whose cutout has no grant is drawn as a transparent placeholder, so the video still renders and the
  // cast indices stay the same (the failed render of this kind stopped on one missing cutout and sent every machine into a retry loop)
  await pool((m.cutouts || []).map((p, i) => [p, i]), 6, async ([p, i]) => {
    const file = path.join(dirs.img, `cast-${i}.png`);
    if (input.signed?.[p]) return fetchTo(input.signed[p], file);
    console.warn(JSON.stringify({ cutout_grant_missing: p }));
    await writeFile(file, blankPng(64, 96));
  });
  lap('pictures', t0);

  // 2) narration timing: each take is aligned once, by whichever machine claims it
  t0 = Date.now();
  for (let k = 0; k < total; k++) {
    if (await store.getValue(`aligned-${k}`)) continue;
    if (!(await store.claim(`align-${k}`, 10 * 60 * 1000))) continue;
    const raw = path.join(dirs.takes, `raw-${k}`), wav = path.join(dirs.takes, `take-${k}.wav`), out = path.join(dirs.aligned, `aligned-${k}.json`);
    await fetchTo(signed(m.voice[k].path), raw);
    await heal('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    await heal(python, [path.join(doc, 'doc_align.py'), '--manifest', mpath, '--take', String(k), '--audio', wav, '--out', out], env);
    await store.setValue(`aligned-${k}`, JSON.parse(await readFile(out, 'utf8')));
    await guard(2 + (k + 1) / total * 6);
  }
  for (let k = 0; k < total; k++) {
    for (let wait = 0; ; wait++) {
      const a = await store.getValue(`aligned-${k}`);
      if (a) { await writeFile(path.join(dirs.aligned, `aligned-${k}.json`), JSON.stringify(a)); break; }
      if (wait > 240) throw Error('Narration timing did not finish');
      // a take whose claimant died is claimed again after the stale period
      if (wait && wait % 60 === 0 && await store.claim(`align-${k}`, 10 * 60 * 1000)) { console.error('taking over a stalled alignment', k); break; }
      await sleep(3000);
    }
    if (!(await readFile(path.join(dirs.aligned, `aligned-${k}.json`)).catch(() => null))) {
      const raw = path.join(dirs.takes, `raw-${k}`), wav = path.join(dirs.takes, `take-${k}.wav`);
      await fetchTo(signed(m.voice[k].path), raw);
      await heal('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
      await heal(python, [path.join(doc, 'doc_align.py'), '--manifest', mpath, '--take', String(k), '--audio', wav, '--out', path.join(dirs.aligned, `aligned-${k}.json`)], env);
    }
  }
  lap('alignment', t0);
  const tlPath = path.join(work, 'timeline.json');
  await cli('timeline', '--manifest', mpath, '--aligned-dir', dirs.aligned, '--out', tlPath);
  const tl = JSON.parse(await readFile(tlPath, 'utf8'));
  const frames = tl.frames;

  // 3) depth for every picture (claimed one by one), shared through the private store
  t0 = Date.now();
  for (let i = 0; i < m.images.length; i++) {
    const have = await store.getValue(`depth-${i}`);
    if (Buffer.isBuffer(have) && have.length > 100 && have.readUInt32BE(0) === 0x89504e47) continue;
    if (!(await store.claim(`claim-depth-${i}`, STALE))) continue;
    const out = path.join(dirs.depth, `depth-${i}.png`);
    await cli('depth', '--image', path.join(dirs.img, `img-${i}.jpg`), '--out', out);
    await store.setValue(`depth-${i}`, await readFile(out), { contentType: 'image/png' });
    if (i % 8 === 0) await guard(8 + i / m.images.length * 12);
  }
  await pool(m.images.map((_, i) => i), 8, async i => {
    for (let wait = 0; ; wait++) {
      const b = await store.getValue(`depth-${i}`);
      if (Buffer.isBuffer(b) && b.length > 100 && b.readUInt32BE(0) === 0x89504e47) { await writeFile(path.join(dirs.depth, `depth-${i}.png`), b); return; }
      if (wait > 120) { console.error('depth missing, drawing without it', i); return; }   // a missing map only means a flatter camera for that picture
      if (wait && wait % 40 === 0 && await store.claim(`claim-depth-${i}`, STALE)) { return; }
      await sleep(3000);
    }
  });
  lap('depth', t0);

  // 4) the soundtrack is made by one machine while the others draw
  const audioFile = path.join(work, 'audio.m4a'), statsFile = path.join(work, 'audio-stats.json');
  const makeAudio = async () => {
    const at = Date.now();
    for (let k = 0; k < total; k++) {
      const wav = path.join(dirs.takes, `take-${k}.wav`);
      if (!(await readFile(wav).catch(() => null))) {
        const raw = path.join(dirs.takes, `raw-${k}`);
        await fetchTo(signed(m.voice[k].path), raw);
        await heal('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
      }
    }
    await cli('audio', '--manifest', mpath, '--timeline', tlPath, '--takes-dir', dirs.takes, '--out', audioFile, '--stats', statsFile, '--workers', String(Math.max(1, lanes - 1)));
    await store.setValue('audio-m4a', await readFile(audioFile), { contentType: 'audio/mp4' });
    await store.setValue('audio-stats', JSON.parse(await readFile(statsFile, 'utf8')));
    lap('audio', at);
  };
  let audioTask = null;
  if (await store.claim('audio', 30 * 60 * 1000)) { audioTask = makeAudio(); audioTask.catch(() => {}); }

  // 5) pieces of the picture, claimed one by one across the whole fleet
  t0 = Date.now();
  const pieces = [];
  for (let first = 0; first < frames; first += SHARD) pieces.push([first, Math.min(frames - 1, first + SHARD - 1)]);
  const attempt = hash(Buffer.from(input.callbackToken)).slice(0, 12);
  const partFile = n => path.join(dirs.parts, `part-${String(n).padStart(5, '0')}.mp4`);
  async function drawPiece(n) {
    const [first, last] = pieces[n];
    const out = partFile(n);
    await heal(python, [path.join(doc, 'doc_cli.py'), 'shard', '--manifest', mpath, '--timeline', tlPath, '--images', dirs.img, '--depth', dirs.depth, '--first', String(first), '--last', String(last), '--out', out, '--captions', input.manifest.captions === false ? '0' : '1'], env);
    await store.setValue(`part-${n}`, await readFile(out), { contentType: 'video/mp4' });
  }
  let cursor = 0, done = 0;
  async function lane() {
    while (cursor < pieces.length) {
      const n = cursor++;
      if (await store.getValue(`part-${n}`)) { done++; continue; }
      if (!(await store.claim(`piece-${attempt}-${n}`, STALE))) continue;
      // a piece this machine cannot draw is left for another one; only the assembler fails the job if nobody can
      try { await drawPiece(n); } catch (e) { if (e instanceof Cancelled) throw e; console.error('piece failed on this machine, leaving it for another:', n, String(e.message).slice(-200)); continue; }
      done++;
      if (done % 4 === 0) await guard(20 + done / pieces.length * 62);
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, pieces.length) }, lane));
  lap('draw-share', t0);
  if (audioTask) await audioTask;

  // 6) one machine assembles; the others wait in case it dies (its claim goes stale after 12 minutes and another machine takes over)
  const mine = hash(Buffer.from(input.callbackToken)).slice(0, 12);
  if (!(await store.claim(`assemble-${mine}`, 12 * 60 * 1000))) {
    const giveUp = Date.now() + 40 * 60 * 1000;
    while (Date.now() < giveUp) {
      await sleep(15000);
      if (await store.getValue('PENDING-COMPLETION')) return { role: 'share' };
      if (await store.claim(`assemble-${mine}`, 12 * 60 * 1000)) return assemble();
    }
    return { role: 'share' };
  }
  return assemble();

  async function assemble() {
  const deadline = Date.now() + Math.max(20, Math.ceil(tl.duration / 60) * 4) * 60 * 1000;
  for (;;) {
    const missing = [];
    for (let n = 0; n < pieces.length; n++) if (!(await store.getValue(`part-${n}`))) missing.push(n);
    if (!missing.length) break;
    if (Date.now() > deadline) throw Error('Picture pieces did not finish');
    for (const n of missing) if (await store.claim(`piece-${attempt}-${n}`, STALE)) { await guard(84); await drawPiece(n); }
    await guard(84); await sleep(4000);
  }
  await pool(pieces.map((_, n) => n), 8, async n => {
    if (await readFile(partFile(n)).catch(() => null)) return;
    const b = await store.getValue(`part-${n}`);
    if (!Buffer.isBuffer(b)) throw Error(`Piece ${n} missing`);
    await writeFile(partFile(n), b);
  });
  let stats = null;
  const waitUntil = Date.now() + 8 * 60 * 1000;
  for (;;) {
    const bytes = await store.getValue('audio-m4a');
    if (Buffer.isBuffer(bytes)) { await writeFile(audioFile, bytes); stats = await store.getValue('audio-stats'); break; }
    if (Date.now() > waitUntil) { console.error('soundtrack missing; making it on the assembler'); await makeAudio(); stats = JSON.parse(await readFile(statsFile, 'utf8')); break; }
    await guard(88); await sleep(5000);
  }
  await guard(92);
  const final = path.join(work, 'final.mp4');
  await cli('join', '--parts', ...pieces.map((_, n) => partFile(n)), '--audio', audioFile, '--out', final, '--duration', String(tl.duration));
  const bytes = await readFile(final);
  // The finished file can be hundreds of megabytes: a long window per try (netFetch gives two minutes), a few tries with a pause between them.
  let uploaded = false;
  for (let i = 0; i < 4 && !uploaded; i++) {
    try {
      const up = await fetch(input.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true', ...(testMode ? input.uploadHeaders || {} : {}) }, body: bytes, signal: AbortSignal.timeout(20 * 60 * 1000) });
      if (up.ok) uploaded = true; else if (up.status < 500 && up.status !== 429) throw Error(`Cloud video upload failed [${up.status}]`); else await sleep(4000 * (i + 1));
    } catch (e) { if (/\[\d+\]/.test(String(e.message))) throw e; if (i === 3) throw Error(`Cloud video upload failed: ${e?.cause?.code || e?.message}`); await sleep(4000 * (i + 1)); }
  }
  if (!uploaded) throw Error('Cloud video upload failed');
  const completion = { type: 'done', duration: tl.duration, mime: 'video/mp4', size: bytes.length, stats: { lufs: stats.lufs, lra: stats.lra, avgShotSec: tl.duration / tl.beats.length, wordsPerSec: tl.words.length / tl.duration } };
  await store.setValue('PENDING-COMPLETION', completion);
  const result = await notify(completion);
  if (!result.accepted) throw Error('Cloud completion was not accepted');
  if (testMode) await store.setValue('TEST-RESULT', { status: 'done', duration: tl.duration, size: bytes.length, timings, frames, beats: tl.beats.length, words: tl.words.length, audio: stats });
  console.log('OUTPUT', JSON.stringify({ status: 'done', duration: tl.duration, size: bytes.length, timings }));
  return { role: 'assembler' };
  }
}
