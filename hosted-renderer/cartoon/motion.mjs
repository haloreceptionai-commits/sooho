const clamp = x => Math.max(0, Math.min(1, x));
export const smootherstep = x => { const t = clamp(x); return t ** 3 * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

// Centripetal Catmull-Rom, alpha=0.5; duplicate endpoint knots are guarded.
export function pathAt(points, progress) {
  if (points.length < 2 || points.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v)))) throw new Error('Invalid camera path');
  const n = points.length - 1, x = clamp(progress) * n, i = Math.min(n - 1, Math.floor(x));
  const p = [points[Math.max(0, i - 1)], points[i], points[i + 1], points[Math.min(n, i + 2)]];
  const t = [0];
  for (let j = 1; j < 4; j++) t.push(t[j - 1] + Math.max(1e-4, Math.sqrt(distance(p[j - 1], p[j]))));
  const at = t[1] + (t[2] - t[1]) * (x - i);
  const interp = (a, b, lo, hi) => mix(a, b, (at - lo) / (hi - lo));
  const a = [interp(p[0], p[1], t[0], t[1]), interp(p[1], p[2], t[1], t[2]), interp(p[2], p[3], t[2], t[3])];
  const b = [interp(a[0], a[1], t[0], t[2]), interp(a[1], a[2], t[1], t[3])];
  return interp(b[0], b[1], t[1], t[2]);
}

export function cameraAt(keys, frame) {
  if (!keys.length || !Number.isFinite(frame)) throw new Error('Missing camera keys');
  keys.forEach((k, i) => {
    if (!Number.isInteger(k.frame) || (i && k.frame <= keys[i - 1].frame) || k.fov < 15 || k.fov > 90 || !Number.isFinite(k.fov)) throw new Error('Invalid camera key');
    if ([k.pos, k.look].some(p => !Array.isArray(p) || p.length !== 3 || p.some(v => !Number.isFinite(v)))) throw new Error('Invalid camera vectors');
  });
  const next = keys.findIndex(k => k.frame > frame);
  const a = next <= 0 ? (next === 0 ? keys[0] : keys[keys.length - 1]) : keys[next - 1];
  const b = next <= 0 ? a : keys[next];
  const t = a === b ? 0 : smootherstep((frame - a.frame) / (b.frame - a.frame));
  const pos = b.path ? pathAt([a.pos, ...b.path, b.pos], t) : mix(a.pos, b.pos, t);
  return { ...a, pos, look: mix(a.look, b.look, t), fov: Math.max(15, Math.min(90, a.fov + (b.fov - a.fov) * t)), roll: (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * t };
}

export function actorIdle(frame, seed) {
  return { bob: 0.006 * Math.sin((frame + seed * 11) * 0.11), tilt: 1.2 * Math.sin((frame + seed * 7) * 0.05), headTilt: 1.5 * Math.sin((frame + seed * 5) * 0.037 + 1) };
}