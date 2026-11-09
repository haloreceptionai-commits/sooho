import { Actor } from 'apify';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

await Actor.init();
const input = await Actor.getInput();
if (!input?.jobId || !input.callbackToken || !input.manifest || !input.uploadUrl) throw new Error('Incomplete rendering input');
const allowed = new URL(input.callbackUrl);
if (allowed.protocol !== 'https:' || allowed.pathname !== '/api/public/render-callback' || !allowed.hostname.endsWith('.lovable.app')) throw new Error('Invalid completion address');
async function notify(event) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(input.callbackUrl, { method: 'POST', headers: { 'x-render-token': input.callbackToken, 'x-render-job': input.jobId, 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
    if (r.ok) return r.json();
    if (r.status < 500 && r.status !== 429) throw new Error(`Cloud save callback failed [${r.status}]`);
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Cloud save callback unavailable');
}
let browser, server;

/** Frame-exact still cut: original pictures, lanczos-scaled once, each held for its exact spoken span. */
async function encodeStills(input, r) {
  const m = input.manifest, W = m.width, H = m.height, FPS = 30;
  const files = [];
  const paths = m.checkpoint.images;
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < paths.length) {
      const i = next++;
      for (let attempt = 0; ; attempt++) {
        try { const res = await fetch(input.signed[paths[i]]); if (!res.ok) throw new Error(String(res.status)); files[i] = `/tmp/still-${i}.img`; await writeFile(files[i], Buffer.from(await res.arrayBuffer())); break; }
        catch (e) { if (attempt >= 4) throw new Error('Saved picture could not load'); await new Promise(z => setTimeout(z, 1500 * 2 ** attempt)); }
      }
    }
  }));
  // snap every cut to the frame grid so drift never accumulates
  const frames = r.cuts.map(c => Math.round(c.end * FPS) - Math.round(c.start * FPS));
  let list = 'ffconcat version 1.0\n';
  r.cuts.forEach((c, k) => { if (frames[k] > 0) list += `file '${files[c.scene]}'\nduration ${(frames[k] / FPS).toFixed(5)}\n`; });
  list += `file '${files[r.cuts[r.cuts.length - 1].scene]}'\n`;
  await writeFile('/tmp/cuts.txt', list);
  await notify({ type: 'progress', progress: 60 }).catch(() => {});
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', '/tmp/cuts.txt', '-i', '/tmp/mix.wav',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'faster', '-tune', 'stillimage', '-crf', '16', '-g', String(FPS * 2), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', r.duration.toFixed(3), '-movflags', '+faststart', '/tmp/out.mp4'];
  await new Promise((ok, bad) => { const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'pipe'] }); let err = ''; p.stderr.on('data', d => { err += d; }); p.on('close', code => code === 0 ? ok() : bad(new Error(`Video encoder failed: ${err.slice(-300)}`))); });
  const body = await readFile('/tmp/out.mp4');
  const upload = await fetch(input.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true' }, body });
  if (!upload.ok) throw new Error(`Cloud video upload failed [${upload.status}]`);
  return { type: 'done', mime: 'video/mp4', size: (await stat('/tmp/out.mp4')).size };
}
try {
  const initial = await notify({ type: 'progress', progress: 0 });
  if (!initial.accepted) throw new Error('Assembly cancelled');
  const bundle = await readFile(new URL('./renderer.js', import.meta.url));
  server = createServer((req, res) => {
    if (req.url === '/audio' && req.method === 'POST') { const f = createWriteStream('/tmp/mix.wav'); req.pipe(f); f.on('finish', () => res.end('ok')); return; }
    if (req.url === '/renderer.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@800;900&display=swap"></head><body></body></html>'); }
  });
  await new Promise(r => server.listen(3000, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
  let last = -1;
  await page.exposeFunction('reportProgress', async p => {
    const step = Math.floor(p / 10);
    if (step <= last) return;
    last = step;
    const state = await notify({ type: 'progress', progress: p });
    if (!state.accepted) throw new Error('Assembly cancelled');
  });
  await page.goto('http://127.0.0.1:3000');
  const result = await page.evaluate(async ({ manifest: m, signed, uploadUrl }) => {
    const { renderVideo, renderStillCuts, allHeld } = await import('/renderer.js');
    await document.fonts.ready;
    const media = async path => { const r = await fetch(signed[path]); if (!r.ok) throw new Error('Saved media could not load'); return r.blob(); };
    if (allHeld(m.checkpoint.plan.scenes, m.clips)) {
      // Hard-cut stills: mix the soundtrack offline; the encoder places the original pictures frame-exact.
      const voice = [];
      for (const chunk of m.checkpoint.voice) voice.push({ scenes: chunk.scenes, audio: await (await media(chunk.path)).arrayBuffer() });
      const plan = m.checkpoint.plan.scenes.map(sc => ({ text: sc.narration, sfx: sc.sfx, camera: sc.camera, mood: sc.mood, beat: sc.beat }));
      const out = await renderStillCuts(plan, voice, { width: m.width, height: m.height, captions: false, sfx: m.sfx });
      const posted = await fetch('/audio', { method: 'POST', body: out.wav });
      if (!posted.ok) throw new Error('Soundtrack could not be saved');
      return { offline: true, cuts: out.cuts, duration: out.duration, stats: out.stats };
    }
    const scenes = [];
    for (let i = 0; i < m.checkpoint.plan.scenes.length; i++) {
      const sc = m.checkpoint.plan.scenes[i];
      scenes.push({ image: await createImageBitmap(await media(m.checkpoint.images[i])), text: sc.narration, sfx: sc.sfx, camera: sc.camera, mood: sc.mood, beat: sc.beat });
    }
    const voice = [];
    for (const chunk of m.checkpoint.voice) voice.push({ scenes: chunk.scenes, audio: await (await media(chunk.path)).arrayBuffer() });
    const clips = [];
    for (const clip of m.clips) {
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
      video.src = URL.createObjectURL(await media(clip.path));
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('Motion clip could not load')); });
      clips.push({ scenes: clip.scenes, video });
    }
    const out = await renderVideo(scenes, voice, { width: m.width, height: m.height, captions: m.captions, sfx: m.sfx, hookText: m.checkpoint.plan.hookText, clips, onProgress: p => { void window.reportProgress(p).catch(() => {}); } });
    const upload = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': out.mime, 'x-upsert': 'true' }, body: out.blob });
    if (!upload.ok) throw new Error(`Cloud video upload failed [${upload.status}]`);
    return { type: 'done', duration: out.duration, mime: out.mime, size: out.blob.size, stats: out.stats };
  }, input);
  if (result.offline) Object.assign(result, await encodeStills(input, result));
  delete result.offline; delete result.cuts;
  await Actor.setValue('PENDING-COMPLETION', result);
  const saved = await notify(result);
  if (!saved.accepted) throw new Error('Video completion was not accepted');
  await Actor.setValue('OUTPUT', { status: 'done', duration: result.duration, size: result.size });
  await Actor.setValue('PENDING-COMPLETION', null);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Hosted assembly failed';
  await notify({ type: 'failed', error: message }).catch(() => {});
  throw new Error(message);
} finally {
  await browser?.close();
  server?.close();
}
await Actor.exit();