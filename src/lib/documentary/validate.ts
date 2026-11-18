// Checks a documentary manifest before anything is paid for or sent to a render machine. Mirrors documentary/doc_timeline.py validate_manifest,
// so a plan the worker would refuse is refused here with a plain message, at submit time rather than minutes into a render.
import { CARD_KINDS, MOVES, OVERLAY_KINDS, TRANSITIONS, type DocManifest } from './types';

export function manifestProblems(m: DocManifest): string[] {
  const out: string[] = [];
  if (m.kind !== 'documentary' || m.version !== 1) return ['not a documentary manifest'];
  if (!m.scenes.length || m.scenes.length > 3000) out.push('needs between 1 and 3000 scenes');
  if (!m.images.length) out.push('needs pictures');
  if (!m.voice.length) out.push('needs recorded narration');
  const seen = new Set<number>();
  m.voice.forEach(v => v.scenes.forEach(i => { if (i < 0 || i >= m.scenes.length) out.push('narration points at a missing scene'); seen.add(i); }));
  if (m.scenes.some((_, i) => !seen.has(i))) out.push('a scene has no recorded narration');
  m.scenes.forEach((s, i) => { if (!s.text.trim()) out.push(`scene ${i} has no narration`); if (/\d/.test(s.text)) out.push(`scene ${i} contains digits (numbers must be spelled for speech timing)`); });
  for (const b of m.beats) {
    const sc = m.scenes[b.scene];
    if (!sc) { out.push('a beat points at a missing scene'); continue; }
    const n = sc.text.split(/\s+/).filter(Boolean).length;
    if (!(Number.isInteger(b.w0) && Number.isInteger(b.w1) && b.w0 >= 0 && b.w0 < b.w1 && b.w1 <= n)) out.push(`scene ${b.scene} has a beat with an invalid word range`);
    const v = b.visual;
    if (v.type === 'image') {
      if (!Number.isInteger(v.src) || v.src < 0 || v.src >= m.images.length) out.push('a beat points at a missing picture');
      if (!(MOVES as readonly string[]).includes(v.move)) out.push('unknown camera move');
    } else if (v.type === 'card') {
      if (!(CARD_KINDS as readonly string[]).includes(v.card)) out.push('unknown card kind');
      if (v.bg != null && (v.bg < 0 || v.bg >= m.images.length)) out.push('a card points at a missing background');
    } else out.push('a beat has no visual');
    if (b.transition && !(TRANSITIONS as readonly string[]).includes(b.transition)) out.push('unknown transition');
    for (const o of b.overlays ?? []) if (!(OVERLAY_KINDS as readonly string[]).includes(o.kind) && !(CARD_KINDS as readonly string[]).includes(o.kind)) out.push('unknown overlay');
  }
  for (let s = 0; s < m.scenes.length; s++) if (!m.beats.some(b => b.scene === s)) out.push(`scene ${s} has no beat`);
  return [...new Set(out)];
}
