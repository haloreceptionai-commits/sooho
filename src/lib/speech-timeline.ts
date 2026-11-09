export interface AlignedWord { text: string; start: number; end: number }
export interface AlignedScene { scene: number; words: AlignedWord[] }

/** Scene cuts follow measured first-word onsets, not spelling length or assumed speaking speed. */
export function alignedTimeline(chunks: { scenes: number[]; dur: number; start: number; from: number; alignment?: AlignedScene[] }[], texts: string[]) {
  const out = texts.map(() => ({ start: 0, end: 0, words: [] as { text: string; t0: number; t1: number }[] }));
  const covered = new Set<number>();
  for (const c of chunks) {
    if (!c.alignment || c.alignment.length !== c.scenes.length) throw new Error('Measured speech timing is missing');
    for (const [k, si] of c.scenes.entries()) {
      const item = c.alignment[k];
      const text = texts[si];
      const sc = out[si];
      if (!item || item.scene !== si || !text || !sc || covered.has(si)) throw new Error('Speech timing scene association is invalid');
      const expected = text.trim().split(/\s+/);
      if (item.words.length !== expected.length) throw new Error('Speech timing differs from narration');
      let previous = -Infinity;
      sc.words = item.words.map((w, wi) => {
        if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < previous || w.end <= w.start || w.end > c.from + c.dur + 0.1) throw new Error('Speech timing contains invalid intervals');
        previous = w.end;
        return { text: expected[wi] ?? w.text, t0: c.start + w.start - c.from, t1: c.start + w.end - c.from };
      });
      sc.start = k === 0 ? c.start : sc.words[0]?.t0 ?? c.start;
      const next = c.alignment[k + 1]?.words[0];
      sc.end = next ? c.start + next.start - c.from : c.start + c.dur;
      covered.add(si);
    }
  }
  if (covered.size !== texts.length) throw new Error('Speech timing omitted a picture');
  return out;
}