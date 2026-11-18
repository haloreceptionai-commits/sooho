// Paints and saves the cutouts of the cast. Written with injected storage and painting so it can be tested without a model.
// Every finished cutout is saved under the video's media folder at once, so Resume never pays for one twice; a person that cannot be painted is dropped
// (the video then simply shows no cutout for them) and never stops the video.
import { cutoutPrompts, type CastEntry, type Era } from './cast';

export interface PaintDeps {
  /** File names already saved for this video (resume). */
  have: Set<string>;
  save(name: string, bytes: Uint8Array): Promise<void>;
  paint(prompts: string[]): Promise<{ image: string; tried: number }>;
  report(detail: string): void;
  /** How many paintings may run at once (the image quota rejects bigger bursts). */
  limit?: number;
  /** The art style of the video's pictures; cutouts are drawn in the same style. */
  look?: string;
}
export const cutoutName = (id: string) => `cast-${id}.png`;

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export async function paintCutouts(entries: CastEntry[], era: Era, deps: PaintDeps): Promise<{ painted: CastEntry[]; log: string[] }> {
  const ok = new Set<string>();
  const log: string[] = [];
  let next = 0, done = 0;
  const run = async () => {
    while (next < entries.length) {
      const e = entries[next++]!;
      const name = cutoutName(e.id);
      if (deps.have.has(name)) { ok.add(e.id); done++; continue; }
      try {
        const r = await deps.paint(cutoutPrompts(e, era, deps.look ?? ''));
        const bytes = fromB64(r.image);
        if (bytes.length < 2000 || bytes[0] !== 0x89 || bytes[1] !== 0x50) throw new Error('not a PNG');
        await deps.save(name, bytes);
        deps.have.add(name); ok.add(e.id);
        if (e.kind === 'figure' && r.tried > 0) log.push(`${e.name}: the image service would not draw the real person, so a look-alike stand-in was drawn`);
      } catch (err) {
        log.push(`${e.name}: no cutout (${err instanceof Error ? err.message.slice(0, 120) : 'failed'})`);
      }
      deps.report(`Painting the people of the story · ${++done}/${entries.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(deps.limit ?? 3, Math.max(1, entries.length)) }, run));
  return { painted: entries.filter(e => ok.has(e.id)), log };
}
