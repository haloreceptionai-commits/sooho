// Browser video editor: turns stills into a fast-cut "animated" Short — 1.5–2.5s shots with
// camera moves, punch-ins, shake and whip transitions; flowing narration, synthesized music
// bed + foley, and kinetic one-word captions. Records with MediaRecorder.

export type Camera = "push_in" | "pull_out" | "pan_left" | "pan_right" | "tilt_up" | "tilt_down" | "punch_in";

export interface RenderScene {
  image: ImageBitmap;
  text: string;
  sfx: string;
  camera: Camera;
  mood: "tension" | "reveal";
}

/** One narration recording covering several consecutive scenes. */
export interface VoiceChunk { audio: ArrayBuffer; scenes: number[] }

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
  if (kind === "clang") {
    [523, 1187, 1873, 2711].forEach((fr) => {
      const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = fr; o.connect(g);
      o.start(at); o.stop(at + 1.2);
    });
    env(0.12, 0.003, 1.0);
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
    wind: ["bandpass", 700, 0.16, 0.6, 1.8],
    pour: ["lowpass", 500, 0.3, 0.05, 1.2],
  };
  const [type, freq, peak, a, d] = presets[kind] ?? presets["whoosh"]!;
  f.type = type; f.frequency.value = freq;
  if (kind === "wind") { f.Q.value = 3; f.frequency.setValueAtTime(400, at); f.frequency.linearRampToValueAtTime(1200, at + 1.2); f.frequency.linearRampToValueAtTime(500, at + 2.3); }
  if (kind === "pour") { const lfo = ctx.createOscillator(); const lg = ctx.createGain(); lfo.frequency.value = 9; lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency); lfo.start(at); lfo.stop(at + 1.4); }
  if (kind === "whoosh") { f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(3000, at + 0.5); }
  env(peak, a, d);
  n.start(at); n.stop(at + a + d + 0.1);
}


// ---------------- timing ----------------

const wordWeight = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.5 + (/[.!?]["']?$/.test(w) ? 4 : /[,;:—-]["']?$/.test(w) ? 2 : 0);

/** Find where speech actually starts/ends so chunks butt together with no dead air. */
function speechBounds(b: AudioBuffer) {
  const d = b.getChannelData(0);
  const th = 0.012;
  let s = 0, e = d.length - 1;
  while (s < d.length && Math.abs(d[s]!) < th) s++;
  while (e > s && Math.abs(d[e]!) < th) e--;
  const pad = b.sampleRate * 0.04;
  return { from: Math.max(0, s - pad) / b.sampleRate, to: Math.min(d.length, e + pad) / b.sampleRate };
}

export interface Word { text: string; t0: number; t1: number }
export interface SceneTiming { start: number; end: number; words: Word[] }

/** Splits each chunk's spoken time across its scenes and words by weighted length. */
export function timeline(chunks: { scenes: number[]; dur: number; start: number }[], texts: string[]): SceneTiming[] {
  const out: SceneTiming[] = texts.map(() => ({ start: 0, end: 0, words: [] }));
  for (const c of chunks) {
    const words = c.scenes.map((i) => texts[i]!.split(/\s+/).filter(Boolean));
    const total = words.flat().reduce((a, w) => a + wordWeight(w), 0) || 1;
    let t = c.start;
    c.scenes.forEach((si, k) => {
      const sc = out[si]!;
      sc.start = t;
      for (const w of words[k]!) {
        const d = (wordWeight(w) / total) * c.dur;
        sc.words.push({ text: w, t0: t, t1: t + d });
        t += d;
      }
      sc.end = t;
    });
  }
  return out;
}

// ---------------- drawing ----------------

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const easeOut = (x: number) => 1 - (1 - x) ** 3;

interface Shot { scene: number; start: number; end: number; z0: number; z1: number; x0: number; x1: number; y0: number; y1: number; punch: boolean }

function buildShots(scenes: RenderScene[], tl: SceneTiming[]): Shot[] {
  const shots: Shot[] = [];
  scenes.forEach((sc, i) => {
    const t = tl[i]!;
    const dur = Math.max(0.6, t.end - t.start);
    const n = Math.max(1, Math.round(dur / 2.1));
    for (let k = 0; k < n; k++) {
      const s = t.start + (dur * k) / n, e = t.start + (dur * (k + 1)) / n;
      const v = (i * 7 + k * 3) % 5;
      // first shot uses the planned move on a wide framing, later shots re-frame tighter
      const cam: Camera = k === 0 ? sc.camera : (["push_in", "pan_right", "tilt_up", "pan_left", "pull_out"] as Camera[])[v]!;
      const base = k === 0 ? 1.05 : 1.3 + (v % 3) * 0.15;
      const fx = k === 0 ? 0 : [-0.5, 0.45, 0, -0.3, 0.35][v]!;
      const fy = k === 0 ? 0 : [-0.35, -0.2, -0.5, 0.2, -0.1][v]!;
      const m = 0.09;
      const sh: Shot = { scene: i, start: s, end: e, z0: base, z1: base, x0: fx, x1: fx, y0: fy, y1: fy, punch: false };
      if (cam === "push_in") sh.z1 = base + 0.16;
      if (cam === "pull_out") { sh.z0 = base + 0.18; }
      if (cam === "pan_left") { sh.x0 = fx + 0.5; sh.x1 = fx - 0.5; sh.z0 = sh.z1 = base + m; }
      if (cam === "pan_right") { sh.x0 = fx - 0.5; sh.x1 = fx + 0.5; sh.z0 = sh.z1 = base + m; }
      if (cam === "tilt_up") { sh.y0 = fy + 0.6; sh.y1 = fy - 0.6; sh.z0 = sh.z1 = base + m; }
      if (cam === "tilt_down") { sh.y0 = fy - 0.6; sh.y1 = fy + 0.6; sh.z0 = sh.z1 = base + m; }
      if (cam === "punch_in") { sh.punch = true; sh.z1 = base + 0.35; }
      shots.push(sh);
    }
  });
  return shots;
}

function drawImage(ctx: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number, zoom: number, panX: number, panY: number, ox = 0, oy = 0) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale, dh = img.height * scale;
  const x = (w - dw) / 2 + Math.max(-1, Math.min(1, panX)) * (dw - w) / 2 + ox;
  const y = (h - dh) / 2 + Math.max(-1, Math.min(1, panY)) * (dh - h) / 2 + oy;
  ctx.drawImage(img, x, y, dw, dh);
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, vertical: boolean, pop: number) {
  const size = Math.round(w * (vertical ? 0.092 : 0.05));
  ctx.save();
  const y = vertical ? h * 0.6 : h * 0.8;
  const sc = 1 + 0.28 * (1 - easeOut(Math.min(1, pop)));
  ctx.translate(w / 2, y); ctx.scale(sc, sc);
  ctx.font = `900 ${size}px Manrope, "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.24;
  ctx.strokeStyle = "#000000";
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = size * 0.06;
  ctx.strokeText(text, 0, 0);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#FFD60A";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Caption groups: one word at a time, pairing tiny words with their neighbour. */
function captionWords(words: Word[]): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const clean = (x: string) => x.replace(/^["'“‘(]+|["'”’)]+$/g, "");
    const next = words[i + 1];
    if (next && clean(w.text).length <= 3 && clean(next.text).length <= 7) {
      out.push({ text: `${clean(w.text)} ${clean(next.text)}`, t0: w.t0, t1: next.t1 }); i++;
    } else out.push({ text: clean(w.text), t0: w.t0, t1: w.t1 });
  }
  return out;
}

// ---------------- music ----------------

const NOTE = (m: number) => 440 * 2 ** ((m - 69) / 12);
const TENSION = [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 44, 47]]; // Am F G E
const REVEAL = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]]; // C G Am F

function scheduleMusic(ctx: AudioContext, out: AudioNode, at: number, step: number, mood: "tension" | "reveal") {
  const bar = Math.floor(step / 8) % 4;
  const chord = (mood === "tension" ? TENSION : REVEAL)[bar]!;
  const dur = 60 / 128 / 2;
  // staccato strings / plucks
  const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
  o.type = mood === "tension" ? "sawtooth" : "triangle";
  o.frequency.value = NOTE(chord[step % 3]! + (mood === "tension" ? 12 : 24));
  f.type = "lowpass"; f.frequency.value = mood === "tension" ? 1400 : 3000;
  o.connect(f); f.connect(g); g.connect(out);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(mood === "tension" ? 0.22 : 0.16, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.9);
  o.start(at); o.stop(at + dur);
  // bass + kick on beats
  if (step % 2 === 0) {
    const b = ctx.createOscillator(); const bg = ctx.createGain();
    b.type = "sine"; b.frequency.value = NOTE(chord[0]! - 12); b.connect(bg); bg.connect(out);
    bg.gain.setValueAtTime(0.0001, at); bg.gain.exponentialRampToValueAtTime(0.35, at + 0.01); bg.gain.exponentialRampToValueAtTime(0.0001, at + dur * 1.8);
    b.start(at); b.stop(at + dur * 2);
  }
  if (step % 4 === 0) {
    const k = ctx.createOscillator(); const kg = ctx.createGain();
    k.frequency.setValueAtTime(120, at); k.frequency.exponentialRampToValueAtTime(40, at + 0.15);
    k.connect(kg); kg.connect(out);
    kg.gain.setValueAtTime(0.5, at); kg.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    k.start(at); k.stop(at + 0.25);
  }
}

// ---------------- render ----------------

export async function renderVideo(scenes: RenderScene[], voice: VoiceChunk[], o: RenderOptions): Promise<{ blob: Blob; mime: string; duration: number }> {
  const actx = new AudioContext();
  await actx.resume();
  const buffers = await Promise.all(voice.map((v) => actx.decodeAudioData(v.audio.slice(0))));
  const LEAD = 0.15, JOIN = 0.06;
  let t = LEAD;
  const chunks = buffers.map((b, i) => {
    const bd = speechBounds(b);
    const c = { scenes: voice[i]!.scenes, dur: bd.to - bd.from, start: t, from: bd.from, buf: b };
    t += c.dur + JOIN;
    return c;
  });
  const total = t + 0.5;
  const tl = timeline(chunks, scenes.map((s) => s.text));
  // stretch first/last scene to cover lead-in and tail
  tl[0]!.start = 0; tl[tl.length - 1]!.end = total;
  for (let i = 1; i < tl.length; i++) tl[i]!.start = tl[i - 1]!.end;
  const shots = buildShots(scenes, tl);
  const caps = tl.map((x) => captionWords(x.words)).flat();
  const revealAt = tl[scenes.findIndex((s) => s.mood === "reveal")]?.start ?? Infinity;

  const canvas = document.createElement("canvas");
  canvas.width = o.width; canvas.height = o.height;
  const ctx = canvas.getContext("2d")!;
  const dest = actx.createMediaStreamDestination();
  const voiceBus = actx.createGain(); voiceBus.gain.value = 1; voiceBus.connect(dest);
  const sfxBus = actx.createGain(); sfxBus.gain.value = 0.45; sfxBus.connect(dest);
  const musicBus = actx.createGain(); musicBus.gain.value = o.sfx ? 0.11 : 0; musicBus.connect(dest);

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.width > 1500 || o.height > 1500 ? 9_000_000 : 6_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  const vertical = o.height > o.width;

  rec.start(1000);
  const t0 = actx.currentTime + 0.15;
  chunks.forEach((c) => {
    const src = actx.createBufferSource(); src.buffer = c.buf; src.connect(voiceBus);
    src.start(t0 + c.start, c.from, c.dur);
  });
  if (o.sfx) {
    scenes.forEach((sc, i) => {
      const at = t0 + tl[i]!.start;
      if (i > 0 && i % 2 === 0) playSfx(actx, sfxBus, "whoosh", at - 0.12);
      if (sc.sfx && sc.sfx !== "none") playSfx(actx, sfxBus, sc.sfx, at + 0.05);
    });
    playSfx(actx, sfxBus, "boom", t0 + total - 1.2);
  }
  const stepLen = 60 / 128 / 2;
  let nextStep = 0;

  await new Promise<void>((resolve) => {
    let si = 0, ci = 0;
    const frame = () => {
      const el = actx.currentTime - t0;
      if (el >= total) { resolve(); return; }
      // music look-ahead scheduler
      while (o.sfx && nextStep * stepLen < Math.min(el + 0.5, total - 1)) {
        const at = nextStep * stepLen;
        scheduleMusic(actx, musicBus, t0 + at, nextStep, at >= revealAt ? "reveal" : "tension");
        nextStep++;
      }
      while (si < shots.length - 1 && el >= shots[si]!.end) si++;
      const sh = shots[Math.min(si, shots.length - 1)]!;
      const sc = scenes[sh.scene]!;
      const local = Math.max(0, el - sh.start);
      const p = Math.min(1, local / Math.max(0.1, sh.end - sh.start));
      const pe = sh.punch ? (local < 0.28 ? easeOut(local / 0.28) * 0.8 : 0.8 + 0.2 * p) : ease(p);
      // cut energy: overshoot zoom right after each cut
      const cutKick = Math.max(0, 1 - local / 0.22);
      let zoom = sh.z0 + (sh.z1 - sh.z0) * pe + cutKick * 0.06;
      // handheld sway + impact shake
      let ox = Math.sin(el * 1.7) * o.width * 0.004, oy = Math.cos(el * 1.3) * o.height * 0.003;
      const sceneLocal = el - tl[sh.scene]!.start;
      if (["boom", "thunder", "clang", "snap", "splash"].includes(sc.sfx) && sceneLocal < 0.5) {
        const a = (1 - sceneLocal / 0.5) * o.width * 0.018;
        ox += (Math.random() - 0.5) * a; oy += (Math.random() - 0.5) * a; zoom += 0.02;
      }
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, o.width, o.height);
      const px = sh.x0 + (sh.x1 - sh.x0) * pe, py = sh.y0 + (sh.y1 - sh.y0) * pe;
      if (cutKick > 0) {
        // whip motion blur on the cut
        ctx.globalAlpha = 0.35;
        drawImage(ctx, sc.image, o.width, o.height, zoom, px, py, ox - o.width * 0.03 * cutKick, oy);
        drawImage(ctx, sc.image, o.width, o.height, zoom, px, py, ox + o.width * 0.03 * cutKick, oy);
        ctx.globalAlpha = 1 - cutKick * 0.35;
      }
      drawImage(ctx, sc.image, o.width, o.height, zoom, px, py, ox, oy);
      ctx.globalAlpha = 1;
      if (sh.punch && local < 0.08) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(0, 0, o.width, o.height); }
      // light vignette
      const g = ctx.createRadialGradient(o.width / 2, o.height / 2, Math.min(o.width, o.height) * 0.4, o.width / 2, o.height / 2, Math.max(o.width, o.height) * 0.8);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, o.width, o.height);
      if (o.captions) {
        while (ci < caps.length - 1 && el >= caps[ci]!.t1) ci++;
        const c = caps[ci];
        if (c && el >= c.t0 - 0.02 && el <= c.t1 + 0.05) drawCaption(ctx, c.text, o.width, o.height, vertical, (el - c.t0) / 0.1);
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
