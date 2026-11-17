// Self-healing for the locked manifest: every rule validate-manifest.mjs enforces has a safe repair here, so a small slip in a shot
// (an unknown library prop, an actor who is not in the cast, a gap in the shot clock) costs that detail, never the whole paid video.
// repairManifest returns a repaired copy plus the list of what changed; prepare-scene.mjs logs it and re-validates.
import V from './vocabulary.json' with { type: 'json' };
import { LIBRARY, OUTFITS } from './validate-manifest.mjs';

const vec = p => Array.isArray(p) && p.length === 3 && p.every(v => Number.isFinite(v) && Math.abs(v) < 1000);
const has = (list, x) => list.includes(x);

export function repairManifest(input) {
  const m = structuredClone(input); const log = []; const note = s => { if (log.length < 60) log.push(s); };
  const total = Math.round(m.narration.samples / 48000 * 30), dur = m.narration.samples / 48000;
  // cast
  const seen = new Set(); let cast = (Array.isArray(m.cast) ? m.cast : []).filter(c => c && typeof c === 'object');
  cast = cast.filter(c => { if (!/^[a-z0-9_-]{1,30}$/.test(c.id) || seen.has(c.id)) { note(`cast: dropped ${String(c.id).slice(0, 30)}`); return false; } seen.add(c.id); return true; }).slice(0, 4);
  cast.forEach((c, i) => { if (!has(OUTFITS, c.outfit)) { note(`cast ${c.id}: outfit -> worker`); c.outfit = 'worker'; } if (!Number.isInteger(c.seed)) c.seed = i + 1; if (c.card !== undefined && typeof c.card !== 'boolean') delete c.card; });
  if (!cast.length) { cast = [{ id: 'hero', seed: 1, outfit: 'worker' }]; note('cast: added a default hero'); }
  m.cast = cast; const ids = new Set(cast.map(c => c.id));
  // word clock (small numeric slips only; the voice itself is never touched)
  let wend = 0;
  for (const w of m.words) {
    if (!Number.isFinite(w.confidence) || w.confidence < 0 || w.confidence > 1) w.confidence = .5;
    if (!Number.isFinite(w.start) || w.start < wend) w.start = wend;
    if (!Number.isFinite(w.end) || w.end <= w.start) w.end = Math.min(dur, w.start + .02);
    if (w.end > dur) { w.end = dur; if (w.start >= w.end) w.start = Math.max(0, w.end - .02); }
    wend = w.end;
  }
  if (m.captions && (!Array.isArray(m.caption_words) || m.caption_words.length !== m.words.length || m.caption_words.some(t => typeof t !== 'string' || !t || t.length > 40))) {
    m.caption_words = m.words.map((w, i) => (typeof m.caption_words?.[i] === 'string' && m.caption_words[i] && m.caption_words[i].length <= 40) ? m.caption_words[i] : String(w.text || '...').slice(0, 40) || '...'); note('captions: rebuilt from the aligned words');
  }
  // shot clock: continuous, ordered, covering the narration exactly
  let shots = (Array.isArray(m.shots) ? m.shots : []).filter(s => s && Number.isInteger(s.start) && Number.isInteger(s.end)).sort((a, b) => a.start - b.start);
  shots = shots.filter(s => s.end > s.start && s.start < total);
  let cursor = 0;
  for (const s of shots) { if (s.start !== cursor) note(`shots: closed a gap or overlap at frame ${cursor}`); s.start = cursor; s.end = Math.min(Math.max(s.end, cursor + 1), total); cursor = s.end; }
  shots = shots.filter(s => s.end > s.start);
  if (shots.length && shots.at(-1).end !== total) { shots.at(-1).end = total; note('shots: last shot stretched to the end of the voice'); }
  m.shots = shots.slice(0, m.width === 1920 ? 2500 : 120);
  const sounds = V.sounds;
  for (const [i, s] of m.shots.entries()) {
    const tag = `shot ${i}`;
    if (!has(V.worlds, s.world)) { note(`${tag}: world -> lab`); s.world = 'lab'; }
    if (!has(V.lights, s.light)) { note(`${tag}: light -> day`); s.light = 'day'; }
    if (!has(V.shots, s.shot)) { note(`${tag}: shot -> medium`); s.shot = 'medium'; }
    if (!has(V.moves, s.move)) { note(`${tag}: move -> push_in`); s.move = 'push_in'; }
    if (!has(V.moods, s.mood)) { note(`${tag}: mood -> calm`); s.mood = 'calm'; }
    if (!Number.isFinite(s.shake) || s.shake < 0 || s.shake > 1) s.shake = Math.max(0, Math.min(1, Number.isFinite(s.shake) ? s.shake : 0));
    // actors
    const used = new Set();
    s.actors = (Array.isArray(s.actors) ? s.actors : []).filter(a => { const ok = a && ids.has(a.id) && !used.has(a.id); if (ok) used.add(a.id); else note(`${tag}: dropped actor ${String(a?.id).slice(0, 30)}`); return ok; }).slice(0, 3);
    for (const a of s.actors) {
      if (!vec(a.pos)) a.pos = [0, 0, 0]; if (!has(V.actions, a.action)) a.action = 'idle';
      if (!has(V.expressions, a.expression)) a.expression = 'neutral'; if (![-1, 0, 1].includes(a.facing ?? 0)) a.facing = 0;
    }
    if (s.speaker != null && !s.actors.some(a => a.id === s.speaker)) { s.speaker = s.actors[0]?.id ?? null; note(`${tag}: speaker fixed`); }
    if (s.keyword != null && (!Number.isInteger(s.keyword) || !m.words[s.keyword])) { s.keyword = null; note(`${tag}: keyword cleared`); }
    // props
    const cardOk = m.advancedEdit === 1 || m.cast.some(c => c.card); let hands = 0;
    s.props = (Array.isArray(s.props) ? s.props : []).filter(p => {
      if (!p || !has(V.props, p.kind) || !has(V.prop_motions, p.motion)) { note(`${tag}: dropped unsupported prop`); return false; }
      if (!has(V.places, p.place)) p.place = 'ground_right';
      if (p.kind === 'asset') { const ok = p.place !== 'hand' && (LIBRARY.has(p.asset) || (/^card\/[a-z0-9_]{1,30}$/.test(p.asset ?? '') && cardOk)); if (!ok) { note(`${tag}: dropped unknown library object ${String(p.asset).slice(0, 40)}`); return false; } }
      else if (p.asset !== undefined) delete p.asset;
      if (p.place === 'hand' && ++hands > 1) p.place = 'ground_right';
      return true;
    }).slice(0, 4);
    s.fx = (Array.isArray(s.fx) ? s.fx : []).filter(x => has(V.fx, x)).slice(0, 3);
    if (s.world === 'map' && (s.actors.length || s.props.length)) { s.actors = []; s.props = []; note(`${tag}: map shot cleared of cast and props`); }
    else if (s.world !== 'map' && s.map != null) delete s.map;
    // camera track
    let prev = s.start - 1;
    const keys = (Array.isArray(s.camera) ? s.camera : []).filter(c => c && Number.isInteger(c.frame) && c.frame >= s.start && c.frame < s.end && vec(c.pos) && vec(c.look) && Number.isFinite(c.fov)).sort((a, b) => a.frame - b.frame)
      .filter(c => c.frame > prev && (prev = c.frame, true)).slice(0, 20);
    for (const c of keys) { c.fov = Math.max(15, Math.min(90, c.fov)); c.roll = Math.max(-8, Math.min(8, c.roll || 0)); }
    if (!keys.length) { keys.push({ frame: s.start, pos: [0, 1.6, 4.5], look: [0, 1, 0], fov: 40, roll: 0 }); note(`${tag}: camera rebuilt`); }
    s.camera = keys;
    // sound events
    s.events = (Array.isArray(s.events) ? s.events : []).filter(e => {
      const w = e && m.words[e.word]; if (!w || !Number.isInteger(e.lead) || e.lead < 0 || e.lead > 3 || !has(sounds, e.kind)) return false;
      const f = Math.round(w.start * 30) - e.lead; return f >= s.start && f < s.end;
    }).slice(0, 30);
  }
  return { manifest: m, repairs: log };
}
