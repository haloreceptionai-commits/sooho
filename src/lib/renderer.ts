// Browser video assembler: animates still images (Ken Burns), lays narration + SFX,
// burns captions, and records to MP4 (or WebM fallback) with MediaRecorder.

export interface RenderScene {
  image: ImageBitmap;
  audio: ArrayBuffer;
  text: string;
  sfx: string;
}

export interface RenderOptions {
  width: number;
  height: number;
  captions: boolean;
  sfx: boolean;
  onProgress: (pct: number) => void;
}

export function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? "video/webm";
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Synthesized foley so videos have impacts without stock libraries. */
function playSfx(ctx: AudioContext, out: AudioNode, kind: string, at: number) {
  const g = ctx.createGain();
  g.connect(out);
  const env = (peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  };
  if (kind === "boom" || kind === "thunder") {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, at);
    o.frequency.exponentialRampToValueAtTime(30, at + 1.2);
    o.connect(g);
    env(0.7, 0.01, kind === "thunder" ? 2.2 : 1.3);
    o.start(at); o.stop(at + 2.5);
    if (kind === "thunder") {
      const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 2.5);
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 400;
      n.connect(f); f.connect(g); n.start(at); n.stop(at + 2.5);
    }
    return;
  }
  if (kind === "heartbeat") {
    [0, 0.28, 0.9, 1.18].forEach((t, i) => {
      const o = ctx.createOscillator(); const gg = ctx.createGain();
      o.frequency.value = 55; o.connect(gg); gg.connect(out);
      gg.gain.setValueAtTime(0.0001, at + t);
      gg.gain.exponentialRampToValueAtTime(i % 2 ? 0.35 : 0.5, at + t + 0.02);
      gg.gain.exponentialRampToValueAtTime(0.0001, at + t + 0.2);
      o.start(at + t); o.stop(at + t + 0.25);
    });
    return;
  }
  if (kind === "coin") {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 2200;
    o.connect(g); env(0.25, 0.005, 0.6); o.start(at); o.stop(at + 0.7);
    return;
  }
  // noise-based: whoosh, snap, splash, creak, fire, crowd
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 2);
  const f = ctx.createBiquadFilter();
  n.connect(f); f.connect(g);
  const presets: Record<string, [BiquadFilterType, number, number, number, number]> = {
    whoosh: ["bandpass", 900, 0.18, 0.25, 0.6],
    snap: ["highpass", 2500, 0.6, 0.003, 0.15],
    splash: ["lowpass", 1800, 0.4, 0.02, 0.9],
    creak: ["bandpass", 350, 0.3, 0.2, 0.7],
    fire: ["bandpass", 1200, 0.15, 0.3, 1.5],
    crowd: ["bandpass", 600, 0.12, 0.5, 1.6],
  };
  const [type, freq, peak, a, d] = presets[kind] ?? presets["whoosh"]!;
  f.type = type; f.frequency.value = freq;
  if (kind === "whoosh") { f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(3000, at + 0.5); }
  env(peak, a, d);
  n.start(at); n.stop(at + a + d + 0.1);
}

function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number, zoom: number, panX: number, panY: number, alpha: number) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale, dh = img.height * scale;
  const x = (w - dw) / 2 + panX * (dw - w) / 2;
  const y = (h - dh) / 2 + panY * (dh - h) / 2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, dw, dh);
  ctx.globalAlpha = 1;
}

function chunks(text: string, size: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  return out.length ? out : [""];
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, vertical: boolean) {
  const size = Math.round(w * (vertical ? 0.075 : 0.042));
  ctx.font = `800 ${size}px Manrope, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.18;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.fillStyle = "#ffffff";
  const y = vertical ? h * 0.7 : h * 0.86;
  // wrap to max width
  const maxW = w * 0.86;
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    const ly = y + (i - (lines.length - 1) / 2) * size * 1.15;
    ctx.strokeText(l, w / 2, ly);
    ctx.fillText(l, w / 2, ly);
  });
}

export async function renderVideo(scenes: RenderScene[], o: RenderOptions): Promise<{ blob: Blob; mime: string; duration: number }> {
  const actx = new AudioContext();
  await actx.resume();
  const buffers = await Promise.all(scenes.map((s) => actx.decodeAudioData(s.audio.slice(0))));
  const GAP = 0.35;
  const starts: number[] = [];
  let t = 0.3;
  buffers.forEach((b) => { starts.push(t); t += b.duration + GAP; });
  const total = t + 0.6;

  const canvas = document.createElement("canvas");
  canvas.width = o.width; canvas.height = o.height;
  const ctx = canvas.getContext("2d")!;
  const dest = actx.createMediaStreamDestination();
  const voiceBus = actx.createGain(); voiceBus.gain.value = 1; voiceBus.connect(dest);
  const sfxBus = actx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(dest);
  // low drone bed for tension
  const drone = actx.createOscillator(); const droneG = actx.createGain();
  drone.type = "sawtooth"; drone.frequency.value = 55;
  const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160;
  drone.connect(lp); lp.connect(droneG); droneG.connect(dest); droneG.gain.value = o.sfx ? 0.035 : 0;

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.width > 1500 || o.height > 1500 ? 8_000_000 : 5_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

  const vertical = o.height > o.width;
  const captionChunks = scenes.map((s) => chunks(s.text, vertical ? 3 : 6));

  rec.start(1000);
  const t0 = actx.currentTime + 0.15;
  buffers.forEach((b, i) => {
    const src = actx.createBufferSource(); src.buffer = b; src.connect(voiceBus); src.start(t0 + starts[i]!);
    if (o.sfx) {
      if (i > 0) playSfx(actx, sfxBus, "whoosh", t0 + starts[i]! - 0.3);
      const k = scenes[i]!.sfx;
      if (k && k !== "none" && k !== "whoosh") playSfx(actx, sfxBus, k, t0 + starts[i]! + Math.min(0.8, b.duration * 0.3));
    }
  });
  drone.start(t0); drone.stop(t0 + total);

  await new Promise<void>((resolve) => {
    const frame = () => {
      const el = actx.currentTime - t0;
      if (el >= total) { resolve(); return; }
      let i = starts.findIndex((s, k) => el < (starts[k + 1] ?? Infinity) - GAP / 2);
      if (i < 0) i = scenes.length - 1;
      const sceneStart = (starts[i] ?? 0) - (i === 0 ? 0.3 : GAP / 2);
      const sceneLen = (buffers[i]?.duration ?? 1) + GAP;
      const p = Math.max(0, Math.min(1, (el - sceneStart) / sceneLen));
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, o.width, o.height);
      const dir = i % 2 ? -1 : 1;
      // previous scene crossfade
      const fade = Math.min(1, (el - sceneStart) / 0.45);
      if (i > 0 && fade < 1) drawCover(ctx, scenes[i - 1]!.image, o.width, o.height, 1.15, -dir * 0.5, 0, 1);
      drawCover(ctx, scenes[i]!.image, o.width, o.height, 1.04 + p * 0.12, dir * (p - 0.5) * 0.8, (i % 3 === 0 ? -1 : 1) * (p - 0.5) * 0.4, fade);
      // vignette
      const g = ctx.createRadialGradient(o.width / 2, o.height / 2, Math.min(o.width, o.height) * 0.3, o.width / 2, o.height / 2, Math.max(o.width, o.height) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, o.width, o.height);
      if (o.captions) {
        const local = el - (starts[i] ?? 0);
        const dur = buffers[i]?.duration ?? 1;
        if (local >= 0 && local <= dur) {
          const cc = captionChunks[i]!;
          drawCaption(ctx, cc[Math.min(cc.length - 1, Math.floor((local / dur) * cc.length))]!, o.width, o.height, vertical);
        }
      }
      o.onProgress(Math.min(100, (el / total) * 100));
      setTimeout(frame, 1000 / 30);
    };
    frame();
  });

  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  await actx.close();
  const base = mime.split(";")[0] ?? "video/webm";
  return { blob: new Blob(parts, { type: base }), mime: base, duration: total };
}
