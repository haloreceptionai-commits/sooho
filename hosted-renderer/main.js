import { Actor } from 'apify';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

await Actor.init();
const input = await Actor.getInput();
if (!input?.jobId || !input.callbackToken || !input.manifest || !input.uploadUrl) throw new Error('Incomplete rendering input');
const allowed = new URL(input.callbackUrl);
if (allowed.protocol !== 'https:' || allowed.pathname !== '/api/public/render-callback' || !allowed.hostname.endsWith('.lovable.app')) throw new Error('Invalid completion address');
async function notify(event) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(input.callbackUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${input.callbackToken}`, 'x-render-job': input.jobId, 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
    if (r.ok) return r.json();
    if (r.status < 500 && r.status !== 429) throw new Error(`Cloud save callback failed [${r.status}]`);
    await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error('Cloud save callback unavailable');
}
let browser, server;
try {
  const initial = await notify({ type: 'progress', progress: 0 });
  if (!initial.accepted) throw new Error('Assembly cancelled');
  const bundle = await readFile(new URL('./renderer.js', import.meta.url));
  server = createServer((req, res) => {
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
    const { renderVideo } = await import('/renderer.js');
    await document.fonts.ready;
    const media = async path => { const r = await fetch(signed[path]); if (!r.ok) throw new Error('Saved media could not load'); return r.blob(); };
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
  const saved = await notify(result);
  if (!saved.accepted) throw new Error('Video completion was not accepted');
  await Actor.setValue('OUTPUT', { status: 'done', duration: result.duration, size: result.size });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Hosted assembly failed';
  await notify({ type: 'failed', error: message }).catch(() => {});
  throw new Error(message);
} finally {
  await browser?.close();
  server?.close();
}
await Actor.exit();