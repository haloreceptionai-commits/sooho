import { z } from 'zod';

const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const word = z.object({ text: z.string().min(1).max(100), start: z.number().nonnegative(), end: z.number().positive(), confidence: z.number().min(0).max(1) });
const camera = z.object({ frame: z.number().int().nonnegative(), pos: vector, look: vector, fov: z.number().min(15).max(90), roll: z.number().min(-8).max(8).default(0) });
export const cartoonManifest = z.object({
  version: z.literal('cartoon-v1'),
  videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  fps: z.literal(30), width: z.literal(1080), height: z.literal(1920),
  captions: z.boolean().default(false),
  narration: z.object({ path: z.string().min(1).max(500), sha256: z.string().regex(/^[a-f0-9]{64}$/), samples: z.number().int().positive(), rate: z.literal(48000) }),
  words: z.array(word).min(1).max(600),
  cast: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,30}$/), seed: z.number().int().min(1).max(100000), outfit: z.string().min(1).max(100) })).min(1).max(3),
  shots: z.array(z.object({
    start: z.number().int().nonnegative(), end: z.number().int().positive(),
    world: z.enum(['ship', 'town', 'bridge', 'lab', 'landscape']),
    light: z.enum(['day', 'golden', 'night_bright']),
    camera: z.array(camera).min(1).max(20),
    actors: z.array(z.object({ id: z.string().max(30), pos: vector, expression: z.string().max(30), action: z.enum(['idle', 'walk', 'point', 'lift', 'pour', 'react']) })).max(3),
    events: z.array(z.object({ word: z.number().int().nonnegative(), lead: z.number().int().min(0).max(3), kind: z.enum(['whoosh', 'impact', 'creak', 'pour', 'splash', 'reveal']) })).max(30),
  })).min(1).max(120),
}).superRefine((m, ctx) => {
  const total = Math.round(m.narration.samples / m.narration.rate * m.fps);
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  let end = 0;
  const ids = new Set(m.cast.map(a => a.id));
  if (ids.size !== m.cast.length) issue('Cast IDs must be unique');
  m.words.forEach((w, i) => {
    if (w.end <= w.start || w.end > m.narration.samples / m.narration.rate || (i > 0 && w.start < (m.words[i - 1]?.end ?? 0))) issue('Word timing must be monotonic and inside narration');
    if (w.confidence < 0.9) issue('Word alignment needs review');
  });
  m.shots.forEach(s => {
    if (s.start !== end || s.end <= s.start || s.end > total) issue('Shots must cover a continuous half-open frame timeline');
    end = s.end;
    if (s.actors.some(a => !ids.has(a.id))) issue('Unknown actor');
    s.camera.forEach((k, i) => {
      if (k.frame < s.start || k.frame >= s.end || (i > 0 && k.frame <= (s.camera[i - 1]?.frame ?? -1))) issue('Camera keys must be ordered inside their shot');
    });
    s.events.forEach(e => {
      const w = m.words[e.word];
      if (!w) { issue('Unknown event word'); return; }
      const f = Math.round(w.start * 30) - e.lead;
      if (f < s.start || f >= s.end) issue('Event lies outside its shot');
    });
  });
  if (end !== total) issue('Shots must cover all narration frames');
});
export type CartoonManifest = z.infer<typeof cartoonManifest>;