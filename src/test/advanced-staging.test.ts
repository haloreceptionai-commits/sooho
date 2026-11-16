import { describe, it, expect } from 'vitest';
import { applyStaging, firstMention, type StagingAnswer } from '@/lib/advanced-staging';
import { paintedCastIds, OBJECT_PAINT_CAP } from '@/lib/advanced-cards';
import { cartoonDirection } from '@/lib/cartoon-job';

const narration = ["Boston's molasses killed twenty-one people,", 'but its owner blamed anarchists.', 'The tank burst on Commercial Street.', 'In nineteen twenty-five, Hugh W. Ogden', 'answered that question for the court.'];
const card = (id: string, size: 'huge' | 'large' = 'huge') => ({ kind: 'asset' as const, place: 'background' as const, motion: 'none' as const, asset: `card/${id}`, phrase: id.replace(/_/g, ' '), size });
const actor = (a: string, slot: 'left' | 'center' | 'right') => ({ actor: a, action: 'idle' as const, expression: 'neutral' as const, slot, facing: 0 });
const direction = cartoonDirection.parse({
  cast: [{ id: 'ogden', seed: 1, outfit: 'scholar' }, { id: 'owner', seed: 2, outfit: 'merchant' }],
  scenes: narration.map((_, i) => ({ world: 'town', light: 'day', action: 'idle', expression: 'neutral', actor: 'ogden', wide: false, actors: [actor('ogden', 'left'), actor('owner', 'right')],
    props: i === 0 ? [card('molasses_wave', 'large')] : i === 2 ? [card('steel_tank')] : i === 4 ? [card('seam_failure', 'large')] : [] })),
});
const answer: StagingAnswer = {
  cast: [{ id: 'ogden', who: 'auditor who investigated the disaster', enters: 0 }, { id: 'owner', who: 'the tank company', enters: 1 }],
  scenes: narration.map(() => ({ actors: [{ actor: 'ogden', reason: 'AI put him everywhere' }, { actor: 'owner', reason: 'company' }] })),
  families: [{ canonical: 'steel_tank', variants: [{ id: 'seam_failure', state: 'failing' }, { id: 'steel_tank', state: 'self' }, { id: 'made_up', state: 'burst' }] }],
  climax: { scene: 2, sequence: ['steel_tank', 'seam_failure', 'molasses_wave', 'made_up'] },
};

describe('Advanced staging (owner Stage 1.5 rules)', () => {
  const out = applyStaging(direction, narration, answer);
  it('never shows a character before the line that names them, whatever the AI says', () => {
    expect(firstMention('ogden', narration)).toBe(3);
    for (const i of [0, 1, 2]) expect(out.scenes[i]!.actors?.some(a => a.actor === 'ogden') ?? false).toBe(false);
    expect(out.scenes[3]!.actors?.map(a => a.actor)).toContain('ogden');
    expect(out.stagingLog?.some(l => l.includes('removed ogden'))).toBe(true);
  });
  it('shows only the place and objects when nobody has entered the story yet', () => {
    expect(out.scenes[0]!.empty).toBe(true);
    expect(out.scenes[1]!.empty).toBeUndefined();
  });
  it('logs a reason for every character on screen', () => {
    for (const sc of out.scenes) for (const a of sc.actors ?? []) if (!sc.empty) expect(a.reason).toBeTruthy();
  });
  it('keeps one canonical object with real painted variants only', () => {
    expect(out.families).toEqual([{ canonical: 'steel_tank', variants: [{ id: 'seam_failure', state: 'failing' }] }]);
  });
  it('shows the key event as an ordered sequence of existing object states', () => {
    expect(out.scenes[2]!.sequence).toEqual(['steel_tank', 'seam_failure', 'molasses_wave']);
    expect(out.scenes[2]!.props!.slice(0, 3).map(p => p.asset)).toEqual(['card/steel_tank', 'card/seam_failure', 'card/molasses_wave']);
    expect(cartoonDirection.safeParse(out).success).toBe(true);
  });
  it('paints character cards only for animals and caps object paintings at 8', () => {
    expect(paintedCastIds(['ogden', 'owner', 'emu', 'war_horse'])).toEqual(['emu', 'war_horse']);
    expect(OBJECT_PAINT_CAP).toBe(8);
  });
});
