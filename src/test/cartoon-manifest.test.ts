import { describe, expect, it } from 'vitest';
import { cartoonManifest } from '@/lib/cartoon';
const fixture = () => ({ version: 'cartoon-v1', videoId: 'test', fps: 30, width: 1080, height: 1920, narration: { path: 'owner/test/voice.wav', sha256: 'a'.repeat(64), samples: 48000, rate: 48000 }, words: [{ text: 'pour', start: 0.5, end: 0.8, confidence: 0.98 }], cast: [{ id: 'hero', seed: 1, outfit: 'sailor' }], shots: [{ start: 0, end: 30, world: 'ship', light: 'day', camera: [{ frame: 0, pos: [0, 1, 4], look: [0, 1, 0], fov: 40 }], actors: [{ id: 'hero', pos: [0, 0, 0], expression: 'excited', action: 'pour' }], events: [{ word: 0, lead: 3, kind: 'pour' }] }] });
describe('declarative cartoon manifest', () => {
  it('defaults to no captions and a thirty-fps vertical frame contract', () => {
    const m = cartoonManifest.parse(fixture());
    expect(m.captions).toBe(false); expect(m.fps).toBe(30);
    expect(m.width).toBe(1080); expect(m.height).toBe(1920);
  });
  it('rejects missing narration frames', () => {
    const f = fixture(); const shot = f.shots[0]; if (!shot) throw Error('fixture missing');
    shot.end = 29; expect(cartoonManifest.safeParse(f).success).toBe(false);
  });
  it('retains uncertain acoustic words for mandatory owner review', () => {
    const f = fixture(); const w = f.words[0]; if (!w) throw Error('fixture missing');
    w.confidence = 0.5; expect(cartoonManifest.parse(f).words[0]?.confidence).toBe(0.5);
  });
  it('rejects unknown cast and reaction leads above three frames', () => {
    const f = fixture(); const s = f.shots[0]; if (!s) throw Error('fixture missing');
    const a = s.actors[0]; if (!a) throw Error('fixture missing');
    a.id = 'stranger'; expect(cartoonManifest.safeParse(f).success).toBe(false);
    a.id = 'hero'; const e = s.events[0]; if (!e) throw Error('fixture missing');
    e.lead = 4; expect(cartoonManifest.safeParse(f).success).toBe(false);
  });
});