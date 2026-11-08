import { describe, it, expect } from 'vitest';
import { scriptTimeline, motionPrompt } from '@/lib/script-writer';
import type { Plan } from '@/lib/pipeline.functions';

const scene: Plan['scenes'][number] = { beat: 'hook', narration: 'One two three four five', image_prompt: 'A sailor pours oil on water.', characters: ['Cook'], camera: 'push_in', sfx: 'pour', mood: 'tension', color: 'bright', angle: 'wide', shot: 'wide', money: true, loop_opened: '', loop_closed: '', purpose: 'Oddity' };
const plan: Plan = { title: 'Storm oil', description: '', premise: '', question: '', hero: { name: 'Cook', role: 'sailor', want: 'save ship' }, beats: [], script: '', palette: '', hookText: '', loopLine: '', characters: [{ name: 'Cook', role: 'sailor', look: 'Blue coat, red hat' }], scenes: [scene, scene] };
describe('portable production plan', () => {
  it('estimates continuous scene timing at the approved 153 words/minute', () => {
    const scenes = scriptTimeline(plan);
    expect(scenes[0]?.start).toBe(0);
    expect(scenes[0]?.end).toBeCloseTo(5 * 60 / 153);
    expect(scenes[1]?.start).toBe(scenes[0]?.end);
    expect(scenes[1]?.end).toBeCloseTo(10 * 60 / 153);
  });
  it('carries locked cast appearance into external motion direction', () => {
    expect(motionPrompt(plan, scene, '3D animated cartoon', 'short')).toContain('Cook: Blue coat, red hat');
  });
});