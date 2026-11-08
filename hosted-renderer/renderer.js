// src/lib/sound-words.ts
var SOUND_WORDS = [
  [/^(spray|sprays|sprayed|spraying|spritz|squirt|squirts|hiss|hisses|fizz|fizzes)$/, "spray"],
  [/^(splash|splashes|splashed|splashing|dunk|dunks)$/, "splash"],
  [/^(pour|pours|poured|pouring|drip|drips|dripping)$/, "pour"],
  [/^(wave|waves|surf)$/, "wave"],
  [/^(crash|crashes|crashed|smash|smashes|smashed|slam|slams|slammed|shatter|shatters)$/, "crash"],
  [/^(boom|booms|bang|bangs|blast|blasts|explodes|explosion|cannon|cannons)$/, "boom"],
  [/^(thunder|thunders|lightning)$/, "thunder"],
  [/^(crack|cracks|cracked|snap|snaps|snapped|click|clicks|pop|pops)$/, "snap"],
  [/^(creak|creaks|creaking|groan|groans)$/, "creak"],
  [/^(fire|fires|flame|flames|burn|burns|burning|blaze)$/, "fire"],
  [/^(wind|winds|gust|gusts|storm|storms)$/, "wind"],
  [/^(clang|clangs|bell|bells|hammer|hammers|sword|swords|chain|chains)$/, "clang"],
  [/^(coin|coins|gold|money|treasure)$/, "coin"],
  [/^(heart|heartbeat|heartbeats)$/, "heartbeat"],
  [/^(crowd|crowds|cheer|cheers|laugh|laughs|laughing|shout|shouts|screams?)$/, "crowd"],
  [/^(knock|knocks|knocked|knocking|tap|taps)$/, "knock"],
  [/^(rustle|rustles|rustling|flap|flaps|flutter|flutters|nets?)$/, "rustle"],
  [/^(plane|planes|bomber|bombers|engine|engines|jet|jets|propeller|propellers)$/, "plane"],
  [/^(siren|sirens|alarm|alarms|wail|wails)$/, "siren"],
  [/^(hit|hits|slap|slaps|thud|thuds|punch|punches|impact|smack|smacks)$/, "impact"],
  [/^(whoosh|zoom|zooms|swoosh|flies|rushes)$/, "whoosh"]
];
var clean = (w) => w.toLowerCase().replace(/[^a-z]/g, "");
function soundForWord(word) {
  const w = clean(word);
  if (!w)
    return null;
  for (const [re, kind] of SOUND_WORDS)
    if (re.test(w))
      return kind;
  return null;
}
function wordSoundCues(words, gap = 1.2) {
  const out = [];
  let last = -Infinity;
  for (const w of words) {
    const kind = soundForWord(w.text);
    if (kind && w.t0 - last >= gap) {
      out.push({ at: w.t0, kind });
      last = w.t0;
    }
  }
  return out;
}
var FANCY = new Set("thus hence whereby albeit amid notion vast mere sheer devise deploy vessel endeavor endeavour subsequent ensure utilize utilise obtain commence conceal ingenious crucial enormous strategy tactic illusion massive genuine renowned ancient tactics mission objective scheme disguise peculiar bizarre".split(" "));

// src/lib/quality.ts
var STOP = new Set("the a an and but so then with into onto from that this they them their there his her him he she it its was were is are be been for of to in on at by as or not just even very really what when where which while who whom why how your you our out up down over".split(" "));
var TWIST = new Set(["wrong", "secret", "fake", "real", "never", "nobody", "trick", "lie", "actually", "hidden", "worked", "impossible"]);
function emphasisIndex(words) {
  const clean = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""));
  const num = clean.findIndex((w) => /\d/.test(w) || /^(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|fifty|twenty|thirty|forty)$/i.test(w));
  if (num >= 0)
    return num;
  const twist = clean.findIndex((w) => TWIST.has(w.toLowerCase()));
  if (twist >= 0)
    return twist;
  let best = -1, len = 4;
  clean.forEach((w, i) => {
    const l = w.toLowerCase();
    if (!STOP.has(l) && !/(ing|ed|ly)$/.test(l) && w.length > len) {
      best = i;
      len = w.length;
    }
  });
  return best;
}

// src/lib/renderer.ts
function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? "video/webm";
}
function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0;i < d.length; i++)
    d[i] = Math.random() * 2 - 1;
  return b;
}
function playSfx(ctx, out, kind, at) {
  const g = ctx.createGain();
  g.connect(out);
  const env = (peak, attack, decay) => {
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
    o.start(at);
    o.stop(at + 2.5);
    if (kind === "thunder") {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 2.5);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 400;
      n.connect(f);
      f.connect(g);
      n.start(at);
      n.stop(at + 2.5);
    }
    return;
  }
  if (kind === "heartbeat") {
    [0, 0.28, 0.9, 1.18].forEach((t, i) => {
      const o = ctx.createOscillator();
      const gg = ctx.createGain();
      o.frequency.value = 55;
      o.connect(gg);
      gg.connect(out);
      gg.gain.setValueAtTime(0.0001, at + t);
      gg.gain.exponentialRampToValueAtTime(i % 2 ? 0.35 : 0.5, at + t + 0.02);
      gg.gain.exponentialRampToValueAtTime(0.0001, at + t + 0.2);
      o.start(at + t);
      o.stop(at + t + 0.25);
    });
    return;
  }
  if (kind === "clang") {
    [523, 1187, 1873, 2711].forEach((fr) => {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = fr;
      o.connect(g);
      o.start(at);
      o.stop(at + 1.2);
    });
    env(0.12, 0.003, 1);
    return;
  }
  if (kind === "coin") {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = 2200;
    o.connect(g);
    env(0.25, 0.005, 0.6);
    o.start(at);
    o.stop(at + 0.7);
    return;
  }
  if (kind === "knock") {
    [0, 0.22, 0.44].forEach((t) => {
      const o = ctx.createOscillator();
      const gg = ctx.createGain();
      o.frequency.setValueAtTime(180, at + t);
      o.frequency.exponentialRampToValueAtTime(80, at + t + 0.08);
      o.connect(gg);
      gg.connect(out);
      gg.gain.setValueAtTime(0.0001, at + t);
      gg.gain.exponentialRampToValueAtTime(0.6, at + t + 0.004);
      gg.gain.exponentialRampToValueAtTime(0.0001, at + t + 0.12);
      o.start(at + t);
      o.stop(at + t + 0.15);
    });
    return;
  }
  if (kind === "siren") {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.connect(g);
    o.frequency.setValueAtTime(600, at);
    for (let k = 0;k < 4; k++) {
      o.frequency.linearRampToValueAtTime(950, at + k * 0.6 + 0.3);
      o.frequency.linearRampToValueAtTime(600, at + k * 0.6 + 0.6);
    }
    env(0.06, 0.2, 2.2);
    o.start(at);
    o.stop(at + 2.5);
    return;
  }
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 2);
  const f = ctx.createBiquadFilter();
  n.connect(f);
  f.connect(g);
  const presets = {
    whoosh: ["bandpass", 900, 0.18, 0.25, 0.6],
    snap: ["highpass", 2500, 0.6, 0.003, 0.15],
    splash: ["lowpass", 1800, 0.4, 0.02, 0.9],
    creak: ["bandpass", 350, 0.3, 0.2, 0.7],
    fire: ["bandpass", 1200, 0.15, 0.3, 1.5],
    crowd: ["bandpass", 600, 0.12, 0.5, 1.6],
    wind: ["bandpass", 700, 0.16, 0.6, 1.8],
    pour: ["lowpass", 500, 0.3, 0.05, 1.2],
    wave: ["lowpass", 900, 0.4, 0.4, 1.6],
    crash: ["lowpass", 2600, 0.6, 0.01, 1.1],
    spray: ["highpass", 3500, 0.35, 0.03, 0.8],
    rustle: ["bandpass", 2200, 0.22, 0.08, 0.7],
    plane: ["lowpass", 300, 0.35, 1, 2.2],
    impact: ["lowpass", 1200, 0.7, 0.003, 0.6]
  };
  const [type, freq, peak, a, d] = presets[kind] ?? presets["whoosh"];
  f.type = type;
  f.frequency.value = freq;
  if (kind === "wind") {
    f.Q.value = 3;
    f.frequency.setValueAtTime(400, at);
    f.frequency.linearRampToValueAtTime(1200, at + 1.2);
    f.frequency.linearRampToValueAtTime(500, at + 2.3);
  }
  if (kind === "pour") {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 9;
    lg.gain.value = 250;
    lfo.connect(lg);
    lg.connect(f.frequency);
    lfo.start(at);
    lfo.stop(at + 1.4);
  }
  if (kind === "plane") {
    f.frequency.setValueAtTime(150, at);
    f.frequency.linearRampToValueAtTime(600, at + 1.2);
    f.frequency.linearRampToValueAtTime(200, at + 3);
  }
  if (kind === "whoosh") {
    f.frequency.setValueAtTime(300, at);
    f.frequency.exponentialRampToValueAtTime(3000, at + 0.5);
  }
  env(peak, a, d);
  n.start(at);
  n.stop(at + a + d + 0.1);
}
var wordWeight = (w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.5 + (/[.!?]["']?$/.test(w) ? 4 : /[,;:—-]["']?$/.test(w) ? 2 : 0);
function speechBounds(b) {
  const d = b.getChannelData(0);
  const th = 0.012;
  let s = 0, e = d.length - 1;
  while (s < d.length && Math.abs(d[s]) < th)
    s++;
  while (e > s && Math.abs(d[e]) < th)
    e--;
  const pad = b.sampleRate * 0.04;
  return { from: Math.max(0, s - pad) / b.sampleRate, to: Math.min(d.length, e + pad) / b.sampleRate };
}
function tightenPauses(ctx, b, maxPause = 0.16, keep = 0.1) {
  const d = b.getChannelData(0);
  const win = Math.round(b.sampleRate * 0.01);
  const quiet = [];
  for (let i = 0;i < d.length; i += win) {
    let m = 0;
    for (let j = i;j < Math.min(d.length, i + win); j++)
      m = Math.max(m, Math.abs(d[j]));
    quiet.push(m < 0.015);
  }
  const keepWins = Math.round(keep / 0.01), maxWins = Math.round(maxPause / 0.01);
  const segs = [];
  let i = 0;
  while (i < quiet.length) {
    let j = i;
    while (j < quiet.length && quiet[j] === quiet[i])
      j++;
    const len = j - i;
    if (quiet[i] && len > maxWins) {
      const h = Math.floor(keepWins / 2);
      segs.push([i, i + h], [j - h, j]);
    } else
      segs.push([i, j]);
    i = j;
  }
  const total = segs.reduce((a, [x, y]) => a + (y - x) * win, 0);
  const out = ctx.createBuffer(b.numberOfChannels, Math.min(total, d.length), b.sampleRate);
  for (let c = 0;c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c), dst = out.getChannelData(c);
    let o = 0;
    for (const [x, y] of segs) {
      const part = src.subarray(x * win, Math.min(src.length, y * win));
      dst.set(part.subarray(0, Math.max(0, dst.length - o)), o);
      o += part.length;
      if (o >= dst.length)
        break;
    }
  }
  return out;
}
var ATLAS_RATE = 0.85;
function timeStretch(ctx, b, rate) {
  if (Math.abs(rate - 1) <= 0.01)
    return b;
  const sr = b.sampleRate;
  const N = Math.round(sr * 0.03), Hs = Math.round(N / 2), tol = Math.round(sr * 0.008);
  const win = new Float32Array(N);
  for (let i = 0;i < N; i++)
    win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const src = b.getChannelData(0);
  const outLen = Math.floor(src.length / rate);
  const out = ctx.createBuffer(1, outLen + N, sr);
  const o = out.getChannelData(0);
  let prevEnd = 0;
  for (let k = 0;k * Hs + N < outLen; k++) {
    const nominal = Math.round(k * Hs * rate);
    let best = nominal;
    if (k > 0) {
      let bestC = -Infinity;
      const lo = Math.max(0, nominal - tol), hi = Math.min(src.length - N, nominal + tol);
      for (let p = lo;p <= hi; p += 2) {
        let c = 0;
        for (let j = 0;j < Hs; j += 4)
          c += src[p + j] * src[prevEnd + j];
        if (c > bestC) {
          bestC = c;
          best = p;
        }
      }
    }
    if (best + N >= src.length)
      break;
    const at = k * Hs;
    for (let j = 0;j < N; j++)
      o[at + j] += src[best + j] * win[j];
    prevEnd = Math.min(src.length - N - 1, best + Hs);
  }
  return out;
}
function timeline(chunks, texts) {
  const out = texts.map(() => ({ start: 0, end: 0, words: [] }));
  for (const c of chunks) {
    const words = c.scenes.map((i) => texts[i].split(/\s+/).filter(Boolean));
    const total = words.flat().reduce((a, w) => a + wordWeight(w), 0) || 1;
    let t = c.start;
    c.scenes.forEach((si, k) => {
      const sc = out[si];
      sc.start = t;
      for (const w of words[k]) {
        const d = wordWeight(w) / total * c.dur;
        sc.words.push({ text: w, t0: t, t1: t + d });
        t += d;
      }
      sc.end = t;
    });
  }
  return out;
}
var ease = (x) => x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
var easeOut = (x) => 1 - (1 - x) ** 3;
function buildShots(scenes, tl) {
  const shots = [];
  scenes.forEach((sc, i) => {
    const t = tl[i];
    const dur = Math.max(0.6, t.end - t.start);
    const n = Math.max(1, Math.round(dur / 3));
    for (let k = 0;k < n; k++) {
      const s = t.start + dur * k / n, e = t.start + dur * (k + 1) / n;
      const v = (i * 7 + k * 3) % 5;
      const cam = k === 0 ? sc.camera : ["push_in", "pan_right", "tilt_up", "pan_left", "pull_out"][v];
      const base = k === 0 ? 1.05 : 1.3 + v % 3 * 0.15;
      const fx = k === 0 ? 0 : [-0.5, 0.45, 0, -0.3, 0.35][v];
      const fy = k === 0 ? 0 : [-0.35, -0.2, -0.5, 0.2, -0.1][v];
      const m = 0.09;
      const sh = { scene: i, start: s, end: e, z0: base, z1: base, x0: fx, x1: fx, y0: fy, y1: fy, punch: false };
      if (cam === "push_in")
        sh.z1 = base + 0.16;
      if (cam === "pull_out") {
        sh.z0 = base + 0.18;
      }
      if (cam === "pan_left") {
        sh.x0 = fx + 0.5;
        sh.x1 = fx - 0.5;
        sh.z0 = sh.z1 = base + m;
      }
      if (cam === "pan_right") {
        sh.x0 = fx - 0.5;
        sh.x1 = fx + 0.5;
        sh.z0 = sh.z1 = base + m;
      }
      if (cam === "tilt_up") {
        sh.y0 = fy + 0.6;
        sh.y1 = fy - 0.6;
        sh.z0 = sh.z1 = base + m;
      }
      if (cam === "tilt_down") {
        sh.y0 = fy - 0.6;
        sh.y1 = fy + 0.6;
        sh.z0 = sh.z1 = base + m;
      }
      if (cam === "punch_in") {
        sh.punch = true;
        sh.z1 = base + 0.35;
      }
      if (cam === "orbit") {
        sh.x0 = fx - 0.4;
        sh.x1 = fx + 0.4;
        sh.y0 = fy + 0.25;
        sh.y1 = fy - 0.25;
        sh.z0 = base + 0.05;
        sh.z1 = base + 0.2;
      }
      shots.push(sh);
    }
  });
  return shots;
}
function clipRate(clipSec, spanSec) {
  return Math.max(0.5, Math.min(1, clipSec / Math.max(0.1, spanSec)));
}
function drawImage(ctx, img, w, h, zoom, panX, panY, ox = 0, oy = 0) {
  const iw = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
  const ih = img instanceof HTMLVideoElement ? img.videoHeight : img.height;
  if (!iw || !ih)
    return;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale, dh = ih * scale;
  const x = (w - dw) / 2 + Math.max(-1, Math.min(1, panX)) * (dw - w) / 2 + ox;
  const y = (h - dh) / 2 + Math.max(-1, Math.min(1, panY)) * (dh - h) / 2 + oy;
  ctx.drawImage(img, x, y, dw, dh);
}
function drawCaption(ctx, text, w, h, vertical, pop) {
  const size = Math.round(w * (vertical ? 0.088 : 0.05));
  const words = text.split(" ");
  const em = emphasisIndex(words);
  ctx.save();
  const y = vertical ? h * 0.68 : h * 0.8;
  const sc = 1 + 0.25 * (1 - easeOut(Math.min(1, pop)));
  ctx.translate(w / 2, y);
  ctx.scale(sc, sc);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.textAlign = "left";
  const font = (k) => `900 ${Math.round(size * k)}px Manrope, "Arial Black", system-ui, sans-serif`;
  const gap = size * 0.28;
  const widths = words.map((wd, i) => {
    ctx.font = font(i === em ? 1.25 : 1);
    return ctx.measureText(wd).width;
  });
  let x = -(widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1)) / 2;
  words.forEach((wd, i) => {
    const k = i === em ? 1.25 : 1;
    ctx.font = font(k);
    ctx.lineWidth = size * k * 0.24;
    ctx.strokeStyle = "#000000";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = size * 0.25;
    ctx.shadowOffsetY = size * 0.06;
    ctx.strokeText(wd, x, 0);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = i === em ? "#FFD60A" : "#FFFFFF";
    ctx.fillText(wd, x, 0);
    x += widths[i] + gap;
  });
  ctx.restore();
}
function drawHook(ctx, text, w, h, vertical, el) {
  const a = Math.min(1, el / 0.2) * Math.min(1, Math.max(0, (3 - el) / 0.3));
  if (a <= 0)
    return;
  const size = Math.round(w * (vertical ? 0.075 : 0.045));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `900 ${size}px Manrope, "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const words = text.toUpperCase().split(/\s+/);
  const lines = [""];
  for (const wd of words) {
    const tryL = `${lines[lines.length - 1]} ${wd}`.trim();
    if (ctx.measureText(tryL).width > w * 0.82 && lines[lines.length - 1])
      lines.push(wd);
    else
      lines[lines.length - 1] = tryL;
  }
  const y0 = h * (vertical ? 0.1 : 0.09);
  lines.forEach((ln, i) => {
    const y = y0 + i * size * 1.15;
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(ln, w / 2, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(ln, w / 2, y);
  });
  ctx.restore();
}
function captionWords(words) {
  const out = [];
  for (let i = 0;i < words.length; i++) {
    const w = words[i];
    const clean = (x) => x.replace(/^["'“‘(]+|["'”’)]+$/g, "");
    const next = words[i + 1];
    if (next && clean(w.text).length <= 3 && clean(next.text).length <= 7) {
      out.push({ text: `${clean(w.text)} ${clean(next.text)}`, t0: w.t0, t1: next.t1 });
      i++;
    } else
      out.push({ text: clean(w.text), t0: w.t0, t1: w.t1 });
  }
  return out;
}
var NOTE = (m) => 440 * 2 ** ((m - 69) / 12);
var TENSION = [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 44, 47]];
var REVEAL = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];
function scheduleMusic(ctx, out, at, step, mood) {
  const bar = Math.floor(step / 8) % 4;
  const chord = (mood === "tension" ? TENSION : REVEAL)[bar];
  const dur = 60 / 128 / 2;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  o.type = mood === "tension" ? "sawtooth" : "triangle";
  o.frequency.value = NOTE(chord[step % 3] + (mood === "tension" ? 12 : 24));
  f.type = "lowpass";
  f.frequency.value = mood === "tension" ? 1400 : 3000;
  o.connect(f);
  f.connect(g);
  g.connect(out);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(mood === "tension" ? 0.22 : 0.16, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.9);
  o.start(at);
  o.stop(at + dur);
  if (step % 2 === 0) {
    const b = ctx.createOscillator();
    const bg = ctx.createGain();
    b.type = "sine";
    b.frequency.value = NOTE(chord[0] - 12);
    b.connect(bg);
    bg.connect(out);
    bg.gain.setValueAtTime(0.0001, at);
    bg.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, at + dur * 1.8);
    b.start(at);
    b.stop(at + dur * 2);
  }
  if (step % 4 === 0) {
    const k = ctx.createOscillator();
    const kg = ctx.createGain();
    k.frequency.setValueAtTime(120, at);
    k.frequency.exponentialRampToValueAtTime(40, at + 0.15);
    k.connect(kg);
    kg.connect(out);
    kg.gain.setValueAtTime(0.5, at);
    kg.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    k.start(at);
    k.stop(at + 0.25);
  }
}
function beatRate(beat) {
  if (beat === "countdown" || beat === "climax" || beat === "defeat" || beat === "try" || beat === "fail" || beat === "escalation")
    return 0.9;
  if (beat === "reveal" || beat === "proof" || beat === "analogy")
    return 0.82;
  return ATLAS_RATE;
}
var PRE_REVEAL_PAUSE = 0.4;
var ATLAS_WPM = 153;
function paceRate(actual, target) {
  return Math.max(0.8, Math.min(1.45, actual / Math.max(0.5, target)));
}
async function renderVideo(scenes, voice, o) {
  const actx = new AudioContext;
  await actx.resume();
  let buffers = await Promise.all(voice.map((v) => actx.decodeAudioData(v.audio.slice(0))));
  buffers = buffers.map((b, i) => {
    const tb = tightenPauses(actx, b, 0.35, 0.25);
    const words = voice[i].scenes.reduce((a, si) => a + scenes[si].text.split(/\s+/).filter(Boolean).length, 0);
    const bd = speechBounds(tb);
    const target = words * 60 / ATLAS_WPM * (ATLAS_RATE / beatRate(scenes[voice[i].scenes[0]]?.beat));
    return timeStretch(actx, tb, paceRate(bd.to - bd.from, target));
  });
  const LEAD = 0.15, JOIN = 0.06;
  let t = LEAD;
  let voiceRms = 0, voiceN = 0;
  const chunks = buffers.map((b, i) => {
    const bd = speechBounds(b);
    const first = scenes[voice[i].scenes[0]];
    if (i > 0 && first?.beat === "reveal")
      t += PRE_REVEAL_PAUSE;
    const c = { scenes: voice[i].scenes, dur: bd.to - bd.from, start: t, from: bd.from, buf: b };
    const d = b.getChannelData(0);
    for (let k = Math.floor(bd.from * b.sampleRate);k < bd.to * b.sampleRate; k += 4) {
      voiceRms += d[k] * d[k];
      voiceN++;
    }
    t += c.dur + JOIN;
    return c;
  });
  const rmsDb = 10 * Math.log10(voiceRms / Math.max(1, voiceN) + 0.000000000001);
  const voiceGain = Math.min(4, Math.max(0.3, 10 ** ((-19 - rmsDb) / 20)));
  const total = t + 0.3;
  const tl = timeline(chunks, scenes.map((s) => s.text));
  tl[0].start = 0;
  tl[tl.length - 1].end = total;
  for (let i = 1;i < tl.length; i++)
    tl[i].start = tl[i - 1].end;
  const shots = buildShots(scenes, tl);
  const caps = tl.map((x) => captionWords(x.words)).flat();
  const clipOf = new Map;
  for (const c of o.clips ?? []) {
    const e = { ...c };
    c.scenes.forEach((i) => clipOf.set(i, e));
  }
  const revealAt = tl[scenes.findIndex((s) => s.mood === "reveal")]?.start ?? Infinity;
  const payoffIdx = scenes.findIndex((s) => s.beat === "payoff");
  const canvas = document.createElement("canvas");
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext("2d");
  const dest = actx.createMediaStreamDestination();
  const master = actx.createDynamicsCompressor();
  master.threshold.value = -10;
  master.knee.value = 6;
  master.ratio.value = 12;
  master.attack.value = 0.003;
  master.release.value = 0.15;
  const makeup = actx.createGain();
  makeup.gain.value = 1;
  master.connect(makeup);
  makeup.connect(dest);
  const meter = actx.createAnalyser();
  meter.fftSize = 2048;
  makeup.connect(meter);
  const voiceBus = actx.createGain();
  voiceBus.gain.value = 0.9 * voiceGain;
  voiceBus.connect(master);
  const sfxBus = actx.createGain();
  sfxBus.gain.value = 0.45;
  sfxBus.connect(master);
  const wordSfx = actx.createGain();
  wordSfx.gain.value = 0.32;
  wordSfx.connect(master);
  const musicLp = actx.createBiquadFilter();
  musicLp.type = "lowpass";
  musicLp.frequency.value = 18000;
  musicLp.connect(master);
  const musicLift = actx.createGain();
  musicLift.gain.value = 1;
  musicLift.connect(musicLp);
  const musicBus = actx.createGain();
  musicBus.gain.value = o.sfx ? 0.13 : 0;
  musicBus.connect(musicLift);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.width > 1500 || o.height > 1500 ? 9000000 : 6000000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise((r) => rec.onstop = () => r());
  const vertical = o.height > o.width;
  rec.start(1000);
  const t0 = actx.currentTime + 0.15;
  chunks.forEach((c) => {
    const src = actx.createBufferSource();
    src.buffer = c.buf;
    src.connect(voiceBus);
    src.start(t0 + c.start, c.from, c.dur);
    if (o.sfx) {
      musicBus.gain.setTargetAtTime(0.06, t0 + c.start - 0.05, 0.08);
      musicBus.gain.setTargetAtTime(0.13, t0 + c.start + c.dur, 0.15);
    }
  });
  if (o.sfx) {
    if (Number.isFinite(revealAt)) {
      musicLp.frequency.setValueAtTime(18000, t0 + Math.max(0, revealAt - 1.6));
      musicLp.frequency.exponentialRampToValueAtTime(350, t0 + revealAt - 0.1);
      musicLp.frequency.exponentialRampToValueAtTime(18000, t0 + revealAt + 0.6);
    }
    scenes.forEach((sc, i) => {
      const at = t0 + tl[i].start;
      if (i > 0 && shots.some((s) => s.scene === i && s.punch))
        playSfx(actx, sfxBus, "whoosh", at - 0.12);
      if (sc.sfx && sc.sfx !== "none")
        playSfx(actx, sfxBus, sc.sfx === "crash" ? "splash" : sc.sfx, at + 0.05);
      if (sc.sfx === "crash")
        playSfx(actx, sfxBus, "boom", at + 0.05);
    });
    for (const cue of wordSoundCues(tl.flatMap((x) => x.words)))
      playSfx(actx, wordSfx, cue.kind === "crash" ? "splash" : cue.kind, t0 + cue.at);
    if (payoffIdx >= 0) {
      const pa = t0 + tl[payoffIdx].start;
      playSfx(actx, sfxBus, "whoosh", pa - 0.5);
      playSfx(actx, sfxBus, "boom", pa + 0.05);
      musicLift.gain.setValueAtTime(1, pa - 0.6);
      musicLift.gain.linearRampToValueAtTime(1.9, pa + 0.4);
    }
    playSfx(actx, sfxBus, "boom", t0 + Math.max(0, total - 1.2));
  }
  const stepLen = 60 / 128 / 2;
  let nextStep = 0;
  const loud = [];
  const mbuf = new Float32Array(meter.fftSize);
  const drawShot = (sh, el, alpha) => {
    const sc = scenes[sh.scene];
    const local = Math.max(0, el - sh.start);
    const p = Math.min(1, local / Math.max(0.1, sh.end - sh.start));
    const pe = sh.punch ? local < 0.28 ? easeOut(local / 0.28) * 0.8 : 0.8 + 0.2 * p : ease(p);
    let zoom = sh.z0 + (sh.z1 - sh.z0) * pe + (sh.punch ? Math.max(0, 1 - local / 0.22) * 0.06 : 0);
    let ox = Math.sin(el * 1.1) * o.width * 0.003, oy = Math.cos(el * 0.9) * o.height * 0.002;
    const sceneLocal = el - tl[sh.scene].start;
    if (["boom", "thunder", "clang", "snap", "splash", "crash", "wave"].includes(sc.sfx) && sceneLocal < 0.5) {
      const a = (1 - sceneLocal / 0.5) * o.width * 0.014;
      ox += (Math.random() - 0.5) * a;
      oy += (Math.random() - 0.5) * a;
      zoom += 0.02;
    }
    ctx.globalAlpha = alpha;
    const clip = clipOf.get(sh.scene);
    if (clip) {
      const first = clip.scenes[0], last = clip.scenes[clip.scenes.length - 1];
      const cs = tl[first].start, span = Math.max(0.5, tl[last].end - cs);
      if (!clip.started) {
        clip.started = true;
        clip.video.currentTime = 0;
        clip.video.playbackRate = clipRate(clip.video.duration || span, span);
        clip.video.play().catch(() => {
          return;
        });
      }
      if (clip.video.paused && !clip.video.ended)
        clip.video.play().catch(() => {
          return;
        });
      const cp = Math.min(1, Math.max(0, (el - cs) / span));
      drawImage(ctx, clip.video, o.width, o.height, 1.02 + 0.1 * ease(cp), 0, 0, ox * 0.5, oy * 0.5);
    } else {
      drawImage(ctx, sc.image, o.width, o.height, zoom, sh.x0 + (sh.x1 - sh.x0) * pe, sh.y0 + (sh.y1 - sh.y0) * pe, ox, oy);
    }
    ctx.globalAlpha = 1;
    if (sh.punch && local < 0.08) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(0, 0, o.width, o.height);
    }
  };
  const DISSOLVE = 0.35;
  const ticker = backgroundTicker(1000 / 30);
  const tick = ticker.next;
  await new Promise((resolve) => {
    let si = 0, ci = 0, lastMeter = 0, acc = 0, accN = 0;
    const frame = () => {
      const el = actx.currentTime - t0;
      if (el >= total) {
        resolve();
        return;
      }
      while (o.sfx && nextStep * stepLen < Math.min(el + 0.5, total - 1)) {
        const at = nextStep * stepLen;
        scheduleMusic(actx, musicBus, t0 + at, nextStep, at >= revealAt ? "reveal" : "tension");
        nextStep++;
      }
      while (si < shots.length - 1 && el >= shots[si].end)
        si++;
      const sh = shots[Math.min(si, shots.length - 1)];
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, o.width, o.height);
      const local = el - sh.start;
      const prev = si > 0 ? shots[si - 1] : undefined;
      if (prev && !sh.punch && local < DISSOLVE) {
        drawShot(prev, el, 1);
        drawShot(sh, el, easeOut(local / DISSOLVE));
      } else
        drawShot(sh, el, 1);
      const g = ctx.createRadialGradient(o.width / 2, o.height / 2, Math.min(o.width, o.height) * 0.4, o.width / 2, o.height / 2, Math.max(o.width, o.height) * 0.8);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, o.width, o.height);
      if (o.hookText && el < 3)
        drawHook(ctx, o.hookText, o.width, o.height, vertical, el);
      if (o.captions) {
        while (ci < caps.length - 1 && el >= caps[ci].t1)
          ci++;
        const c = caps[ci];
        if (c && el >= c.t0 - 0.02 && el <= c.t1 + 0.05)
          drawCaption(ctx, c.text, o.width, o.height, vertical, (el - c.t0) / 0.1);
      }
      meter.getFloatTimeDomainData(mbuf);
      for (let k = 0;k < mbuf.length; k += 2) {
        acc += mbuf[k] * mbuf[k];
        accN++;
      }
      if (el - lastMeter >= 0.4) {
        loud.push(10 * Math.log10(acc / Math.max(1, accN) + 0.000000000001) - 0.691 + 3);
        acc = 0;
        accN = 0;
        lastMeter = el;
      }
      o.onProgress(Math.min(100, el / total * 100));
      tick(frame);
    };
    frame();
  });
  ticker.stop();
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  await actx.close();
  o.clips?.forEach((c) => c.video.pause());
  const gated = loud.filter((x) => x > -50).sort((a, b) => a - b);
  const lufs = gated.length ? 10 * Math.log10(gated.reduce((a, x) => a + 10 ** (x / 10), 0) / gated.length) : -60;
  const st = [];
  for (let i = 0;i + 7 <= loud.length; i++)
    st.push(10 * Math.log10(loud.slice(i, i + 7).reduce((a, x) => a + 10 ** (x / 10), 0) / 7));
  const sts = st.filter((x) => x > lufs - 20).sort((a, b) => a - b);
  const lra = sts.length > 4 ? sts[Math.floor(sts.length * 0.95) - 1] - sts[Math.floor(sts.length * 0.1)] : 0;
  const words = scenes.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);
  const base = mime.split(";")[0] ?? "video/webm";
  return { blob: new Blob(parts, { type: base }), mime: base, duration: total, stats: { lufs, lra, avgShotSec: total / shots.length, wordsPerSec: words / total } };
}
function backgroundTicker(ms) {
  let worker = null;
  let pending = null;
  try {
    const src = `let t=null;onmessage=(e)=>{if(e.data==="stop"){clearTimeout(t);close();return;}t=setTimeout(()=>postMessage(0),e.data);}`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = () => {
      const f = pending;
      pending = null;
      f?.();
    };
  } catch {
    worker = null;
  }
  return {
    next(fn) {
      if (worker) {
        pending = fn;
        worker.postMessage(ms);
      } else
        setTimeout(fn, ms);
    },
    stop() {
      worker?.postMessage("stop");
      worker = null;
    }
  };
}
export {
  ATLAS_RATE,
  ATLAS_WPM,
  PRE_REVEAL_PAUSE,
  backgroundTicker,
  beatRate,
  clipRate,
  paceRate,
  pickMime,
  renderVideo,
  tightenPauses,
  timeStretch,
  timeline
};
