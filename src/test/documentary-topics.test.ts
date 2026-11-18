import { describe, expect, it } from 'vitest';
import { curatedAsDiscovered, ERA_LABEL, LONG_ERAS, LONG_FOCUS_PRESETS, LONG_LENSES, LONG_TOPICS, LONGFORM_STANDARD, longTopicsByEra, pickLongLenses } from '@/lib/long-topics';
import { topicKey, topicUnavailable } from '@/lib/topics';

describe('long-form topic suggestions', () => {
  it('has a curated list that spans ancient history to today, each with a real source and enough to say', () => {
    expect(LONG_TOPICS.length).toBeGreaterThanOrEqual(40);
    for (const era of LONG_ERAS) expect(longTopicsByEra(era).length, era).toBeGreaterThanOrEqual(5);
    const ids = new Set(LONG_TOPICS.map(x => x.id)), keys = new Set(LONG_TOPICS.map(x => topicKey(x.title)));
    expect(ids.size).toBe(LONG_TOPICS.length);
    expect(keys.size).toBe(LONG_TOPICS.length);
    for (const x of LONG_TOPICS) {
      expect(x.id.startsWith('long-')).toBe(true);
      expect(x.source).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/);
      expect(x.title.length).toBeGreaterThanOrEqual(20);
      expect(x.title.length).toBeLessThanOrEqual(100);
      expect(x.fact.length).toBeGreaterThanOrEqual(60);
      expect(ERA_LABEL[x.era]).toBeTruthy();
    }
  });

  it('includes famous people whose names the cast system can draw', () => {
    const names = LONG_TOPICS.flatMap(x => x.people);
    expect(names).toEqual(expect.arrayContaining(['Queen Elizabeth I', 'Napoleon', 'Cleopatra', 'Joan of Arc', 'Hannibal']));
  });

  it('the documentary standard is about long stories from any era, not 40-second Shorts', () => {
    expect(LONGFORM_STANDARD).toMatch(/8-15 minute/);
    expect(LONGFORM_STANDARD).toMatch(/ancient/);
    expect(LONGFORM_STANDARD).toMatch(/Cold War/);
    expect(LONG_LENSES.length).toBeGreaterThanOrEqual(12);
    const a = pickLongLenses(4, () => 0.1), b = pickLongLenses(4, () => 0.9);
    expect(a).toHaveLength(4);
    expect(new Set(a).size).toBe(4);
    expect(a).not.toEqual(b);
  });

  it('offers an angle chip for every era and for famous people', () => {
    const eras = LONG_FOCUS_PRESETS.map(p => p.era).filter(Boolean);
    for (const e of LONG_ERAS) expect(eras).toContain(e);
    expect(LONG_FOCUS_PRESETS.some(p => /famous/i.test(p.label))).toBe(true);
    expect(LONG_FOCUS_PRESETS.every(p => p.focus.length <= 200)).toBe(true);
  });

  it('a curated topic can be used like a researched one and disappears once it has been made', () => {
    const x = LONG_TOPICS[0]!;
    const d = curatedAsDiscovered(x);
    expect(d.title).toBe(x.title);
    expect(d.sources[0]!.url).toBe(x.source);
    expect(d.sources[0]!.quote.length).toBeGreaterThanOrEqual(30);
    expect(topicUnavailable(d.title, d.id, [{ topic: d.title, topicId: d.id, status: 'done' }])).toBe(true);
    expect(topicUnavailable(d.title, d.id, [])).toBe(false);
  });
});
