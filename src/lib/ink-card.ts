// Ink explainer idea cards: plain white frames with one short hand-lettered phrase and a small doodle.
// The rules are pure so they can be tested; drawing happens in the browser canvas so text is always spelled exactly.
export interface InkCard { index: number; text: string; icon: string }

export const INK_FONT = '"Patrick Hand", "Comic Sans MS", cursive';

/** Cleans AI card picks: valid index, never the first scene, no neighbours, 1-4 words, at most ~1 in 4 scenes. */
export function pickInkCards(raw: InkCard[], sceneCount: number): InkCard[] {
  const max = Math.max(1, Math.floor(sceneCount / 4));
  const out: InkCard[] = [];
  const taken = new Set<number>();
  for (const c of [...raw].sort((a, b) => a.index - b.index)) {
    const text = String(c.text ?? '').replace(/[^\p{L}\p{N}?!'.,%&\s-]/gu, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const words = text.split(' ').filter(Boolean);
    if (!Number.isInteger(c.index) || c.index < 1 || c.index >= sceneCount) continue;
    if (!words.length || words.length > 4 || text.length > 28) continue;
    if (taken.has(c.index - 1) || taken.has(c.index + 1) || taken.has(c.index)) continue;
    if (out.length >= max) break;
    taken.add(c.index);
    out.push({ index: c.index, text, icon: String(c.icon ?? '').slice(0, 60).trim() });
  }
  return out;
}

/** Splits card text into at most two balanced lines that fit `maxW`. */
export function cardLines(text: string, maxW: number, measure: (t: string) => number): string[] {
  if (measure(text) <= maxW) return [text];
  const w = text.split(' ');
  if (w.length < 2) return [text];
  let best = [text], score = Infinity;
  for (let k = 1; k < w.length; k++) {
    const a = w.slice(0, k).join(' '), b = w.slice(k).join(' ');
    const s = Math.max(measure(a), measure(b));
    if (s < score) { score = s; best = [a, b]; }
  }
  return best;
}

/** Browser only: white 1536x1024 card with the doodle above and the exact phrase below. Returns base64 JPEG. */
export async function composeInkCard(iconB64: string | null, text: string, red = false): Promise<string> {
  await document.fonts.load(`120px ${INK_FONT}`).catch(() => undefined);
  const W = 1536, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  if (iconB64) {
    const img = new Image(); img.src = `data:image/jpeg;base64,${iconB64}`; await img.decode();
    const box = 380, k = Math.min(box / img.width, box / img.height);
    const iw = Math.round(img.width * k), ih = Math.round(img.height * k);
    const o = document.createElement('canvas'); o.width = iw; o.height = ih;
    const og = o.getContext('2d')!; og.drawImage(img, 0, 0, iw, ih);
    // The doodle comes back on off-white paper; lift near-white to pure white so no grey box shows.
    const px = og.getImageData(0, 0, iw, ih);
    for (let q = 0; q < px.data.length; q += 4) px.data[q] = liftWhite(px.data[q]!), px.data[q + 1] = liftWhite(px.data[q + 1]!), px.data[q + 2] = liftWhite(px.data[q + 2]!);
    og.putImageData(px, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(o, (W - iw) / 2, H * 0.12);
    g.globalCompositeOperation = 'source-over';
  }
  let size = 150;
  const font = () => `${size}px ${INK_FONT}`;
  const measure = (t: string) => { g.font = font(); return g.measureText(t).width; };
  let lines = cardLines(text, W * 0.82, measure);
  while (size > 70 && Math.max(...lines.map(measure)) > W * 0.86) { size -= 8; lines = cardLines(text, W * 0.82, measure); }
  g.font = font(); g.fillStyle = red ? '#c62828' : '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const top = iconB64 ? H * 0.68 : H / 2 - ((lines.length - 1) * size * 1.1) / 2;
  lines.forEach((l, i) => g.fillText(l, W / 2, top + i * size * 1.1));
  return c.toDataURL('image/jpeg', 0.9).split(',')[1]!;
}

/** Maps 205..255 to 255 and stretches the rest, so paper texture disappears but ink keeps its colour. */
export function liftWhite(v: number): number { return v >= 205 ? 255 : Math.round((v / 205) * 255); }
