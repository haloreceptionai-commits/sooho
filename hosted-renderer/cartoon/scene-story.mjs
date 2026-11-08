import { cameraAt, actorIdle } from './motion.js';
import { actionState } from './action.js';
import { LIGHTS } from './lights.js';
import manifest from './manifest.json' with { type: 'json' };

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
const MOOD = { calm: {}, tense: { vig: .36, sat: .95, hemi: .9 }, reveal: { vig: .16, sat: 1.22, hemi: 1.25 } };
export const lightFor = s => {
  const light = LIGHTS[s.light];
  if (!light) throw Error('Unsupported light');
  const out = { ...light, ...(MOOD[s.mood || 'calm'] || {}) };
  // Rich, saturated grade like the reference: warm sunny day, deep blue storm night lit by lanterns.
  out.sat = (out.sat || 1.1) * 1.18;
  if (s.world === 'storm_sea') Object.assign(out, { skyTop: '#0f1d4a', skyHor: '#34508f', sky: '#5a78c8', ground: '#1c2440', sun: '#9fb8ff', sunI: 1.1, hemi: .85,
    fog: '#2a3f78', fogNear: 30, fogFar: 260, waterDeep: '#0e2a5c', waterShal: '#2f5fa8', glint: '#9fd0ff', vig: .42, gain: '#c8d6ff', sat: 1.25 });
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
export const worldAt = f => { const s = shotAt(f); return { world: s.world, props3d: props3dAt(f, s), open: s.shot === 'wide' || s.shot === 'high' || (s.props || []).some(p => p.place === 'sea' || p.place === 'sky' || p.place === 'background') }; };
const outfits = {
  sailor: { tunic: '#386e9a', skin: '#f5c9a0', cap: '#eee8df', hair: '#392b26' },
  worker: { tunic: '#527e57', skin: '#f5c9a0', hair: '#392b26', apron: '#dfd8c7' },
  scholar: { tunic: '#d6e6ed', skin: '#c99067', hair: '#29252a', apron: '#eff4f1' },
  captain: { tunic: '#24365c', skin: '#f5c9a0', cap: '#24365c', moustache: '#4a3020', stout: true },
  pirate: { tunic: '#8a2a2a', skin: '#ecd0b6', hair: '#1f1a1a', beard: '#2a1d18' },
  king: { tunic: '#6b3fa0', skin: '#ffe2c2', hair: '#c9c2b4', beard: '#e8e2d6', cape: '#b8323a', stout: true },
  farmer: { tunic: '#a07a3c', skin: '#c99067', cap: '#e2c27a', apron: '#7a5434' },
};
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
const props3dAt = (f, shot) => (shot.props || []).map((p, i) => [p, i]).filter(([p]) => p.place !== 'hand' && MODEL3D.has(p.kind)).map(([p, i]) => { const pose = propPose(p, f, shot, i); return { kind: p.kind, asset: p.asset, place: p.place, i, ...pose, k: pose.s / PLACE[p.place][3] }; });
const q = (v, k = 20) => Math.round(v * k) / k;
export const actorsAt = (f, T) => {
  const shot = shotAt(f), local = (f - shot.start) / 30;
  const held = (shot.props || []).find(p => p.place === 'hand');
  const speaking = shot.speaker ? wordAt(f, shot) : null;
  const subjectId = shot.speaker || shot.actors[0]?.id;
  const out = shot.actors.map(a => {
    const design = manifest.cast.find(c => c.id === a.id);
    if (!design || !outfits[design.outfit]) throw Error('Unsupported cast design');
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
      held: a.id === subjectId && held ? held.kind : null };
    const rounded = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * (k === 'bob' ? 1000 : 20)) / (k === 'bob' ? 1000 : 20) : v]));
    const travel = moving ? local * (a.action === 'run' ? .9 : .35) * ((a.facing || 1) >= 0 ? 1 : -1) : 0;
    return { x: a.pos[0] + travel, y: a.pos[1] + (shot.world === 'storm_sea' ? .03 * Math.sin(f * .06) : 0), z: a.pos[2], flip: facing < 0,
      key: JSON.stringify([design.id, rounded]), draw: p => T.propCharacter(p, outfits[design.outfit], rounded) };
  });
  return out;
};
export const fxAt = (f, T) => {
  const shot = shotAt(f), out = [];
  (shot.props || []).forEach((prop, i) => {
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
