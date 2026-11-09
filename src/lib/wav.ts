// Joins several PCM WAV takes (same rate/channels/bit depth) into one locked narration file,
// with a short silence between takes. Long-form cartoons record many takes but the renderer
// aligns and mixes exactly one voice track.
interface Pcm { rate: number; channels: number; bits: number; data: Uint8Array }

export function parseWav(buf: ArrayBuffer): Pcm {
  const v = new DataView(buf), tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw Error('Narration take is not a WAV file');
  let o = 12, fmt: Omit<Pcm, 'data'> | null = null;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      if (v.getUint16(body, true) !== 1) throw Error('Narration take must be PCM');
      fmt = { channels: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') {
      if (!fmt) throw Error('WAV data before format');
      // Streamed WAVs may carry a placeholder size; clamp to the bytes actually present.
      const len = Math.min(size, buf.byteLength - body);
      return { ...fmt, data: new Uint8Array(buf, body, len - (len % (fmt.channels * fmt.bits / 8))) };
    }
    o = body + size + (size % 2);
  }
  throw Error('WAV has no audio data');
}

export function joinWavs(takes: ArrayBuffer[], gapSec = 0.35): ArrayBuffer {
  if (!takes.length) throw Error('No narration takes');
  const parts = takes.map(parseWav), f = parts[0]!;
  if (parts.some(p => p.rate !== f.rate || p.channels !== f.channels || p.bits !== f.bits)) throw Error('Narration takes have different formats');
  const block = f.channels * f.bits / 8, gap = Math.round(gapSec * f.rate) * block;
  const total = parts.reduce((a, p) => a + p.data.length, 0) + gap * (parts.length - 1);
  const out = new ArrayBuffer(44 + total), v = new DataView(out), bytes = new Uint8Array(out);
  const w = (o: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + total, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, f.channels, true); v.setUint32(24, f.rate, true); v.setUint32(28, f.rate * block, true); v.setUint16(32, block, true); v.setUint16(34, f.bits, true);
  w(36, 'data'); v.setUint32(40, total, true);
  let o = 44;
  parts.forEach((p, i) => { bytes.set(p.data, o); o += p.data.length + (i < parts.length - 1 ? gap : 0); });
  return out;
}

/** Groups narration sentences into takes of at most `maxWords` words, never splitting a sentence. */
export function groupTakes(sentences: string[], maxWords = 140): string[] {
  const out: string[] = []; let cur: string[] = [], n = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).filter(Boolean).length;
    if (cur.length && n + w > maxWords) { out.push(cur.join(' ')); cur = []; n = 0; }
    cur.push(s); n += w;
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}
