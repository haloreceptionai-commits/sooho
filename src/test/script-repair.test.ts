import { describe, expect, it } from 'vitest';
import { eligibleHooks, preferRepair, repairBrief } from '@/lib/script-repair';
import type { Hook, Plan } from '@/lib/pipeline.functions';
import type { GateResult } from '@/lib/story-v2';

const anchors = { subject: 'seismoscope', stakes: 'quake', year: '132 CE', place: 'Luoyang', org: 'Eastern Han court' };
const hook = (line: string): Hook => ({ line, text: 'DISTANT SHOCK. LOCAL SIGNAL.', visual: '', type: 'paradox_image', curiosity: 10, clarity: 10, visualness: 10, speakability: 10 });
const gate = (score: number, blockers: string[], ready = false): GateResult => ({ score, blockers, ready, parts: {} });

describe('Dragon Jar script repairs', () => {
  it('excludes the actual failed hook despite its high self-rating', () => {
    expect(eligibleHooks([hook('No shaking here, yet the dragon points west in Luoyang.')], anchors, '132 CE')).toEqual([]);
  });
  it('allows a hook that literally names seismoscope and the checked place', () => {
    expect(eligibleHooks([hook('This seismoscope drops a ball in Luoyang before quake news.')], anchors, '132 CE')).toHaveLength(1);
  });
  it('prefers a ready repair even when its score is lower', () => {
    expect(preferRepair(gate(96, ['Pass B']), gate(90, [], true))).toBe(true);
  });
  it('prefers fewer blocking failures rather than repeatedly keeping a high-scoring broken draft', () => {
    expect(preferRepair(gate(84, ['V1', 'V2', 'V6']), gate(82, ['V2']))).toBe(true);
    expect(preferRepair(gate(82, ['V2']), gate(84, ['V1', 'V2', 'V6']))).toBe(false);
  });
  it('retains visual, character and loop state for repairs instead of discarding it', () => {
    const plan = { hero: { name: 'Zhang Heng', role: 'inventor', want: 'show the quake' }, scenes: [{ narration: 'The seismoscope drops its ball.', image_prompt: 'A bronze ball lands inside a frog cup.', characters: ['Zhang Heng'], shot: 'macro', beat: 'reveal', loop_opened: '', loop_closed: 'main', money: true }] } as Plan;
    const brief = repairBrief(plan, gate(70, ['Visual literalness: scenes 1']), anchors);
    const previous = JSON.parse(brief.split('Previous COMPLETE plan (indexes are zero-based; fix visuals and characters at the cited scene indexes as well as narration):\n')[1] ?? '{}');
    expect(previous.scenes[0].image_prompt).toBe('A bronze ball lands inside a frog cup.');
    expect(previous.scenes[0].characters).toEqual(['Zhang Heng']);
    expect(previous.scenes[0].loop_closed).toBe('main');
    expect(previous.sceneAudit[0]).toEqual({ index: 0, startSec: 0, words: 5 });
  });
});