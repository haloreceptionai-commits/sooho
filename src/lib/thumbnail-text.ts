// Exact-text title badges for thumbnails, matching the reference style: big white-on-black title
// label top-left and a smaller years badge under it. Pure layout maths so it can be tested.
export interface Badge { text: string; x: number; y: number; w: number; h: number; size: number }

export function badgeLayout(label: string, years: string, width: number, measure: (text: string, size: number) => number): Badge[] {
  const out: Badge[] = [], pad = width * 0.012, x = width * 0.025;
  let y = width * 0.025;
  // Long titles wrap onto two lines (like "RISE OF / ENGLAND"); each line is its own black box.
  const words = label.trim().toUpperCase().split(/\s+/).filter(Boolean);
  let size = width * 0.075;
  const lines: string[] = [];
  if (words.length) {
    const one = words.join(' ');
    if (words.length > 1 && measure(one, size) > width * 0.5) {
      const mid = Math.ceil(words.length / 2);
      lines.push(words.slice(0, mid).join(' '), words.slice(mid).join(' '));
    } else lines.push(one);
    while (size > width * 0.035 && Math.max(...lines.map(l => measure(l, size))) > width * 0.55) size *= 0.92;
  }
  for (const line of lines) {
    const w = measure(line, size) + pad * 2, h = size * 1.2;
    out.push({ text: line, x, y, w, h, size }); y += h;
  }
  if (years.trim()) {
    const s = width * 0.03, w = measure(years.trim(), s) + pad * 2;
    out.push({ text: years.trim(), x, y: y + pad * 0.6, w, h: s * 1.35, size: s });
  }
  return out;
}
