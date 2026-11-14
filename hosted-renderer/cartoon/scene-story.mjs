import { cameraAt, actorIdle } from './motion.js';
import { actionState } from './action.js';
import { LIGHTS } from './lights.js';
import manifest from './manifest.json' with { type: 'json' };

// Advanced Video AI: painted cards (image-model art) with one shared code-drawn ink outline and a soft light pass,
// so they sit in the scene's light instead of looking pasted on. Keys: '<castId>', '<castId>-<pose>', 'obj-<name>'.
async function inkCard(key) {
  const img = new Image(); img.src = `./cards/${key}.png`; await img.decode();
  // 600x1000 design canvas (the card's aspect), feet at bottom centre, 9 px ink rim at 1500 px tall.
  const W = 600, H = 1000, pad = 22, k = Math.min((W - pad * 2) / img.width, (H - pad * 2) / img.height);
  const w = img.width * k, h = img.height * k, x = (W - w) / 2, y = H - 8 - h;
  const art = document.createElement('canvas'); art.width = W; art.height = H; const a = art.getContext('2d');
  a.drawImage(img, x, y, w, h);
  // Key light from the upper left, a cool bounce in the lower right; only on the painted pixels.
  a.globalCompositeOperation = 'source-atop';
  const lg = a.createLinearGradient(0, 0, W, H); lg.addColorStop(0, 'rgba(255,236,200,0.16)'); lg.addColorStop(.5, 'rgba(255,236,200,0)'); lg.addColorStop(1, 'rgba(36,20,70,0.22)');
  a.fillStyle = lg; a.fillRect(0, 0, W, H);
  const sil = document.createElement('canvas'); sil.width = W; sil.height = H; const g = sil.getContext('2d');
  g.drawImage(img, x, y, w, h); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#17131c'; g.fillRect(0, 0, W, H);
  const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d');
  const r = 6; for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; o.drawImage(sil, Math.cos(t) * r, Math.sin(t) * r); }
  o.drawImage(art, 0, 0);
  return out;
}
const CARD_KEYS = manifest.cast.some(c => c.card) ? await (await fetch('./cards/index.json')).json() : [];
const CARDS = Object.fromEntries(await Promise.all(CARD_KEYS.map(async k => [k, await inkCard(k)])));
export const ADVANCED = CARD_KEYS.length > 0;
const REACH = new Set(['point', 'lift', 'pour', 'wave', 'grab', 'shout', 'thumbs_up', 'carry', 'hold']);
const SHOCKED = new Set(['shock', 'nervous', 'dazed', 'pained']), HAPPY = new Set(['grin', 'laugh', 'relief', 'smile', 'whistle']);
/** Which painted pose a performer shows: faces of shock or joy win, then reaching actions, else standing. */
export function cardPose(action, expression) {
  if (SHOCKED.has(expression) || action === 'react' || action === 'cower' || action === 'worried') return 'shock';
  if (HAPPY.has(expression) || action === 'cheer') return 'happy';
  if (REACH.has(action)) return 'reach';
  return 'stand';
}
const cardFor = (id, action, expression) => { const pose = cardPose(action, expression); return CARDS[pose === 'stand' ? id : `${id}-${pose}`] || CARDS[id]; };
const drawCard = (p, art, o) => {
  // Alive: breathing squash/stretch, a hop on cheer/run, lean into walks, and a talk bounce on each spoken syllable.
  const g = p.g, talk = o.talk || 0, sq = 1 + (o.bob || 0) * .6 + talk * .035, lean = (o.tilt || 0) * .02 + (o.step || 0) * .05;
  const hop = (o.action === 'cheer' || o.action === 'run' ? 28 * Math.abs(o.step || Math.sin((o.frame || 0) * .4)) : 0) + talk * 6;
  g.save(); g.translate(300, 1000 - hop); g.rotate(lean); g.scale(1 / Math.sqrt(sq), sq); g.drawImage(art, -300, -1000); g.restore();
};
const isCardProp = p => p.kind === 'asset' && typeof p.asset === 'string' && p.asset.startsWith('card/');
export const TOTAL = Math.round(manifest.narration.samples / 48000 * 30);
export const SHOTS = manifest.shots;
export const WORDS = manifest.words;
export const shotAt = f => {
  const shot = SHOTS.find(s => f >= s.start && f < s.end);
  if (!shot) throw Error('Frame outside scene timeline');
  return shot;
};
export { LIGHTS };
// Beat moods grade the same light instead of switching worlds.
// Cinematic grade: a soft vignette always, cool low-key contrast on tension, warm bright payoff.
const MOOD = { calm: { vig: .22 }, tense: { vig: .44, sat: .98, hemi: .82, gain: '#d6e0ff' }, reveal: { vig: .2, sat: 1.28, hemi: 1.3, gain: '#fff1d6' } };
export const lightFor = s => {
  const light = LIGHTS[s.light];
  if (!light) throw Error('Unsupported light');
  const out = { ...light, ...(MOOD[s.mood || 'calm'] || {}) };
  // Rich, saturated grade like the reference: warm sunny day, deep blue storm night lit by lanterns.
  out.sat = (out.sat || 1.1) * 1.18;
  // Guide grade for painted cards: violet shadow lift so blacks never crush, gentle highlight shoulder.
  if (ADVANCED) Object.assign(out, { lift: '#0b0714', gain: out.gain || '#f6f2ea', sat: Math.min(out.sat, 1.3) });
  if (s.world === 'storm_sea') Object.assign(out, { skyTop: '#0f1d4a', skyHor: '#34508f', sky: '#5a78c8', ground: '#1c2440', sun: '#9fb8ff', sunI: 1.1, hemi: .85,
    fog: '#2a3f78', fogNear: 30, fogFar: 260, waterDeep: '#0e2a5c', waterShal: '#2f5fa8', glint: '#9fd0ff', vig: .42, gain: '#c8d6ff', sat: 1.25 });
  // Map views sit far above the ground: no haze, slightly cooler documentary grade.
  if (s.world === 'map') Object.assign(out, { fogNear: 2000, fogFar: 5000, vig: .34, sat: 1.12, hemi: 1.1 });
  if (s.world === 'night_camp') Object.assign(out, { skyTop: '#22305a', skyHor: '#5a6f9c', sunI: .9, hemi: 1.0, vig: .3 });
  return out;
};
const hash = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
export const camAt = f => {
  const shot = shotAt(f), c = cameraAt(shot.camera, f);
  // A bounded physical camera creep, not cumulative FOV mutation.
  c.pos = c.pos.map((v, i) => v + (i === 2 ? .005 * Math.sin(f * .03) : 0));
  const local = f - shot.start, shake = (shot.shake || 0) * Math.exp(-local / 18);
  if (shake > .001) { c.pos = c.pos.map((v, i) => v + (hash(f * 3 + i) - .5) * .12 * shake); c.roll = (c.roll || 0) + (hash(f * 7) - .5) * 3 * shake; }
  let flash = 0;
  if (shot.mood === 'reveal') flash = Math.max(flash, .5 * Math.exp(-local / 4));
  if ((shot.fx || []).includes('lightning') && (f % 71 < 3)) flash = Math.max(flash, .7 - (f % 71) * .2);
  c.flash = flash;
  c.shadowAt = c.look;
  return c;
};
export const dofAt = f => {
  const c = camAt(f);
  const distance = Math.hypot(...c.pos.map((v, i) => v - c.look[i]));
  return { focus: distance, cinf: distance < 6 ? 10 : 0, near: 1 };
};
// Wide shots and sea/sky story objects open the view past the stern so the horizon reads.
export const worldAt = f => { const s = shotAt(f); return { world: s.world, map: s.map || null, mapProgress: (f - s.start) / Math.max(1, s.end - s.start - 1), props3d: props3dAt(f, s), open: s.shot === 'wide' || s.shot === 'high' || (s.props || []).some(p => p.place === 'sea' || p.place === 'sky' || p.place === 'background') }; };
const outfits = {"sailor": {"tunic": "#386e9a", "skin": "#f5c9a0", "cap": "#eee8df", "hair": "#392b26"}, "worker": {"tunic": "#527e57", "skin": "#f5c9a0", "hair": "#392b26", "apron": "#dfd8c7"}, "scholar": {"tunic": "#d6e6ed", "skin": "#c99067", "hair": "#29252a", "apron": "#eff4f1"}, "captain": {"tunic": "#24365c", "skin": "#f5c9a0", "cap": "#24365c", "moustache": "#4a3020", "stout": true}, "pirate": {"tunic": "#8a2a2a", "skin": "#ecd0b6", "hair": "#1f1a1a", "beard": "#2a1d18"}, "king": {"tunic": "#6b3fa0", "skin": "#ffe2c2", "hair": "#c9c2b4", "beard": "#e8e2d6", "cape": "#b8323a", "stout": true}, "farmer": {"tunic": "#a07a3c", "skin": "#c99067", "cap": "#e2c27a", "apron": "#7a5434"}, "queen": {"tunic": "#e2b13c", "skin": "#f3d6bb", "hair": "#7a3b1e", "dress": "#7c2f8f", "cape": "#b8323a"}, "woman": {"tunic": "#d9a441", "skin": "#f5c9a0", "hair": "#2b211c", "dress": "#c25a7a"}, "maid": {"tunic": "#eae3d2", "skin": "#8d5a3b", "hair": "#1e1714", "dress": "#3f5a8a", "apron": "#f4f1ea"}, "nurse": {"tunic": "#f4f1ea", "skin": "#ecd0b6", "cap": "#f4f1ea", "dress": "#dfe9f0"}, "soldier": {"tunic": "#b8322f", "skin": "#f5c9a0", "cape": "#8f2228", "helmet": true, "armor": true}, "veteran": {"tunic": "#9c4a3c", "skin": "#f3d6bb", "cape": "#6e3330", "helmet": "old", "armor": true, "beard": "#f4f1ea", "brows": "#f4f1ea"}, "knight": {"tunic": "#2f5c9a", "skin": "#ecd0b6", "cape": "#1f3d6b", "helmet": true, "armor": true, "moustache": "#5a3b2a"}, "noble": {"tunic": "#f1ead8", "skin": "#f5c9a0", "toga": "#6b3c8f", "hair": "#3b2a20", "stout": true}, "merchant": {"tunic": "#c9862e", "skin": "#c99067", "cap": "#7a3b1e", "moustache": "#2b211c", "stout": true}, "fisherman": {"tunic": "#3f6a6f", "skin": "#ecd0b6", "cap": "#5b4a8a", "beard": "#8a8580"}, "doctor": {"tunic": "#f4f1ea", "skin": "#f5c9a0", "hair": "#8a8580", "apron": "#ffffff", "moustache": "#8a8580"}, "monk": {"tunic": "#6e4a2e", "skin": "#f3d6bb", "cape": "#5a3b24", "stout": true}, "explorer": {"tunic": "#b59b62", "skin": "#f5c9a0", "cap": "#c9b27a", "moustache": "#5a3b2a"}, "chef": {"tunic": "#f4f1ea", "skin": "#ecd0b6", "cap": "#ffffff", "apron": "#f4f1ea", "stout": true, "moustache": "#2b211c"}, "blacksmith": {"tunic": "#3a3532", "skin": "#c99067", "hair": "#1e1714", "apron": "#6b4a2e", "beard": "#1e1714", "stout": true}, "elder": {"tunic": "#7d7a8a", "skin": "#f3d6bb", "hair": "#f4f1ea", "beard": "#f4f1ea", "brows": "#f4f1ea"}, "inventor": {"tunic": "#2f7a74", "skin": "#f5c9a0", "hair": "#c2733a", "apron": "#d8c9a6", "moustache": "#c2733a"}, "spy": {"tunic": "#2a2c33", "skin": "#ecd0b6", "cap": "#2a2c33"}, "villager": {"tunic": "#5d8a3a", "skin": "#8d5a3b", "hair": "#1e1714"}, "peasant": {"tunic": "#d8c9a6", "skin": "#c99067", "hair": "#5a3b2a", "dress": "#8a5d3b"}, "priest": {"tunic": "#1f1d22", "skin": "#f5c9a0", "hair": "#8a8580", "cape": "#2a2730"}, "pharaoh": {"tunic": "#f1ead8", "skin": "#b67a4e", "cap": "#d9a441", "toga": "#2f5c9a", "beard": "#1e1714"}, "cowboy": {"tunic": "#8a5d3b", "skin": "#ecd0b6", "cap": "#5a3b24", "moustache": "#3b2a20"}};
// Speech: the frame's word for the speaking actor, so the mouth moves only while that line is spoken.
const wordAt = (f, shot) => {
  const t = f / 30;
  for (let i = 0; i < WORDS.length; i++) { const w = WORDS[i]; if (t >= w.start && t < w.end) return { w, i, t: (t - w.start) / (w.end - w.start) }; }
  return null;
};
// x offsets are relative to where the camera looks, so story props stay inside the narrow frame.
const PLACE = { ground_left: [-.95, 0, .7, .5], ground_right: [.95, 0, .7, .5], background: [.7, 0, -7, 3], sky: [.2, 3.6, -9, 2.2], sea: [-1.1, -1.2, -15, 6] };
const NEAR_SEA = new Set(['wave', 'fish']);
function propPose(prop, f, shot, index) {
  let [x0, y0, z0, s0] = PLACE[prop.place];
  if (prop.place !== 'ground_left' && prop.place !== 'ground_right') x0 += camAt(f).look[0];
  // Library objects stand beside the cast, a step behind, so they never hide a performer.
  if (prop.kind === 'asset' && prop.place.startsWith('ground')) { x0 = camAt(f).look[0] + Math.sign(x0) * (isCardProp(prop) ? .55 : .8); z0 = -.6; }
  if (prop.place === 'sea' && NEAR_SEA.has(prop.kind)) { z0 = -13; s0 = 5; y0 = -1.6; x0 -= .3; }
  if (prop.place === 'sea' && MODEL3D.has(prop.kind) && !NEAR_SEA.has(prop.kind)) { y0 = .4; z0 = -20; s0 = 7; }
  const t = Math.max(0, Math.min(1, (f - shot.start) / Math.max(1, shot.end - shot.start)));
  const ease = t * t * (3 - 2 * t);
  let x = x0 + index * (prop.place === 'sea' || prop.place === 'sky' ? 1.9 : .25), y = y0, z = z0, s = s0, roll = 0;
  if (prop.motion === 'approach') { z = z0 - 10 + 10 * ease; x = x0 - 2 + 2 * ease; }
  if (prop.motion === 'rise') { y = y0 - s0 * .9 + s0 * .9 * ease; }
  if (prop.motion === 'fall') { y = prop.place === 'sea' ? y0 - s0 * .9 * ease : y0 + 3 * (1 - ease * ease); }
  if (prop.motion === 'bob') { y = y0 + .12 * Math.sin(f * .12 + index); roll = .05 * Math.sin(f * .09); }
  if (prop.motion === 'spin') { roll = f * .08; }
  if (prop.motion === 'grow') { s = s0 * (.4 + .6 * ease); }
  return { x, y, z, s, roll };
}
// Story objects with a real 3D model render in the world (lit, inked, shadowed); the rest stay painted cards.
export const MODEL3D = new Set(['merchant_ship', 'pirate_ship', 'wave', 'barrel', 'cannon', 'lantern', 'chest', 'anchor', 'helm_wheel', 'rowboat', 'asset']);
const props3dAt = (f, shot) => (shot.props || []).map((p, i) => [p, i]).filter(([p]) => p.place !== 'hand' && MODEL3D.has(p.kind) && !isCardProp(p)).map(([p, i]) => { const pose = propPose(p, f, shot, i); return { kind: p.kind, asset: p.asset, place: p.place, i, ...pose, k: pose.s / PLACE[p.place][3] }; });
const q = (v, k = 20) => Math.round(v * k) / k;
export const actorsAt = (f, T) => {
  const shot = shotAt(f), local = (f - shot.start) / 30;
  const held = (shot.props || []).find(p => p.place === 'hand');
  const speaking = shot.speaker ? wordAt(f, shot) : null;
  const subjectId = shot.speaker || shot.actors[0]?.id;
  const out = shot.actors.map(a => {
    const design = manifest.cast.find(c => c.id === a.id);
    if (!design || !outfits[design.outfit]) throw Error('Unsupported cast design');
    const art = ADVANCED && design.card ? cardFor(design.id, a.action, a.expression) : null;
    const idle = actorIdle(f, design.seed);
    const moving = a.action === 'walk' || a.action === 'run';
    const step = moving ? Math.sin(local * (a.action === 'run' ? 14 : 8)) : 0;
    const action = actionState(a.action === 'pour' || a.action === 'lift' ? a.action : 'lift', f, shot.start, shot.end);
    const cower = a.action === 'cower' ? -.05 : 0, cheer = a.action === 'cheer' ? .03 * Math.abs(Math.sin(local * 6)) : 0;
    const viseme = speaking && a.id === shot.speaker ? T.visemeAt(speaking.w.text, speaking.t) : null;
    const facing = a.action === 'look_back' ? -(a.facing || 1) : (a.facing || 0);
    const opts = { seed: design.seed, expr: a.expression, blink: (f + design.seed * 13) % 113 < 4 ? 1 : 0, facing: facing * .6,
      tilt: idle.tilt, headTilt: idle.headTilt + (a.action === 'think' ? 6 : 0), bob: idle.bob * 5 + (moving ? .04 * Math.abs(step) : 0) + cower + cheer,
      step, action: a.action, progress: action.progress, lift: action.lift, frame: f, viseme,
      held: a.id === subjectId && held ? held.kind : null,
      // Card talk bounce: peaks mid-word for the on-screen speaker (or the subject during narration).
      talk: art && a.id === shot.speaker && speaking ? Math.sin(Math.PI * speaking.t) : 0 };
    const rounded = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * (k === 'bob' ? 1000 : 20)) / (k === 'bob' ? 1000 : 20) : v]));
    const travel = moving ? local * (a.action === 'run' ? .9 : .35) * ((a.facing || 1) >= 0 ? 1 : -1) : 0;
    return { x: a.pos[0] + travel, y: a.pos[1] + (shot.world === 'storm_sea' ? .03 * Math.sin(f * .06) : 0), z: a.pos[2], flip: facing < 0,
      key: JSON.stringify([design.id, rounded]), draw: art ? p => drawCard(p, art, rounded) : p => T.propCharacter(p, outfits[design.outfit], rounded) };
  });
  return out;
};
export const fxAt = (f, T) => {
  const shot = shotAt(f), out = [];
  (shot.props || []).forEach((prop, i) => {
    if (isCardProp(prop)) {
      const art = CARDS[`obj-${prop.asset.slice(5)}`];
      if (!art) throw Error('Painted object card missing');
      const pose = propPose(prop, f, shot, i);
      out.push({ x: pose.x, y: pose.y, z: pose.z, s: .6 * (pose.s / .5), roll: pose.roll, order: 1, blob: true,
        key: JSON.stringify(['card', prop.asset, Math.round(pose.s * 50)]), draw: p => drawCard(p, art, {}) });
      return;
    }
    if (prop.place === 'hand' || MODEL3D.has(prop.kind)) return;
    const pose = propPose(prop, f, shot, i), animated = !['rock', 'tower', 'house', 'tree', 'chest', 'barrel', 'books', 'cart', 'crown', 'key', 'letter', 'scroll', 'bread', 'bottle', 'skull_sign', 'map', 'oil_jar', 'pot', 'sword', 'cannon', 'anchor', 'oar', 'moon', 'rowboat'].includes(prop.kind);
    out.push({ x: pose.x, y: pose.y, z: pose.z, s: pose.s, roll: pose.roll, order: 1, blob: prop.place.startsWith('ground'),
      key: JSON.stringify(['prop', prop.kind, animated ? f : 0]), draw: p => T.drawProp(p, prop.kind, f) });
  });
  (shot.fx || []).filter(x => x !== 'lightning').forEach((kind, i) => {
    const near = kind === 'rain' || kind === 'wind' || kind === 'sparkle';
    const c = camAt(f), dx = c.look[0] - c.pos[0], dz = c.look[2] - c.pos[2], len = Math.hypot(dx, dz) || 1;
    // Screen-space effects sit 1.2 m in front of the lens; ground effects sit at the subject.
    const x = near ? c.pos[0] + dx / len * 1.2 : (shot.actors[0]?.pos[0] || 0) + .6 * (i - .5);
    const z = near ? c.pos[2] + dz / len * 1.2 : .4;
    const y = near ? c.pos[1] - .9 : 0;
    out.push({ x, y, z, s: kind === 'sparkle' ? .8 : kind === 'rain' ? 1.9 : near ? 1.4 : 1, shadow: false, blob: false, order: 3, alpha: .95,
      key: JSON.stringify(['fx', kind, f]), draw: p => T.FX_ART[kind](p, f) });
  });
  return out;
};
// Caption state for the 2D overlay: up to three words, the spoken word and the director's key word highlighted.
export const captionAt = f => {
  if (!manifest.captions) return null;
  const shot = shotAt(f), t = f / 30;
  let i = WORDS.findIndex(w => t < w.end);
  if (i < 0) i = WORDS.length - 1;
  if (t < WORDS[0].start - .1) return null;
  // Groups of three restart at each sentence/shot so a caption never mixes two sentences.
  let first = WORDS.findIndex(w => Math.round(w.start * 30) >= shot.start);
  if (first < 0 || first > i) first = i;
  const startGroup = i - ((i - first) % 3), words = [];
  let last = WORDS.findIndex(w => Math.round(w.start * 30) >= shot.end); if (last < 0) last = WORDS.length;
  for (let k = startGroup; k < Math.min(last, startGroup + 3); k++) words.push({ text: manifest.caption_words[k], key: shot.keyword != null ? k === shot.keyword : k === i, live: k === i, shown: WORDS[k].start <= t + .05 });
  return words;
};

// Map overlay data: the title badge, years and city labels for the 2D overlay.
export const mapAt = f => { const s = shotAt(f); if (s.world !== 'map' || !s.map) return null; return { ...s.map, progress: (f - s.start) / Math.max(1, s.end - s.start - 1) }; };
