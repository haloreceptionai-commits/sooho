import { describe, expect, it } from 'vitest';
import { discoveryTarget, evidenceSupported, exactEvidenceQuote, freshSix, type DiscoveredTopic } from '@/lib/topic-discovery';
import { sourcePassages } from '@/lib/topic-passages';
const sample = (n: number): DiscoveredTopic => ({ id: `live-${n}`, factKey: `mechanism-${n}`, title: `Why object number ${n} works`, archetype: 'object', fact: 'A documented mechanism with a clear factual explanation.', source: 'https://museum.org/a', hook: 'This object works without power.', whyWatch: 'A clear visible surprise with a satisfying explanation.', payoff: 'The mechanism explains the surprising opening.', caveat: '', scores: { curiosity: 15, clarity: 15, visual: 15, payoff: 15, surprise: 15 }, sources: [{ url: 'https://museum.org/a', title: 'Museum', quote: 'This documented mechanism works without power.' }, { url: 'https://university.edu/b', title: 'University', quote: 'This documented mechanism works without power.' }] });
describe('live topic rules', () => {
  it('requires one source-verified topic for one automatic daily video', () => expect(discoveryTarget('automation')).toBe(1));
  it('keeps six fresh topics for every Find topics request', () => expect(discoveryTarget('suggestions')).toBe(6));
  it('retains only exact fetched passages with unique selectable IDs', () => {
    const text = 'This real museum passage explains how the mechanism works without electricity.';
    const passages = sourcePassages([{ url: 'https://museum.org/a', title: 'Museum', excerpts: [text] }]);
    expect(passages).toEqual([{ url: 'https://museum.org/a', title: 'Museum', quote: text, id: 0 }]);
    expect(sourcePassages([{ url: 'https://museum.org/a', title: 'Museum', excerpts: undefined }])).toEqual([]);
  });
  it('returns exactly six new topics from a larger researched pool', () => expect(freshSix(Array.from({ length: 10 }, (_, i) => sample(i)), [], [])).toHaveLength(6));
  it('does not offer previous suggestions under renamed titles', () => expect(freshSix([{ ...sample(1), title: 'A completely new title' }], [sample(1)], [])).toHaveLength(0));
  it('excludes already generated topics', () => expect(freshSix([sample(1)], [], [{ topic: sample(1).title, status: 'done' }])).toHaveLength(0));
  it('requires exact quotes from two independently fetched domains', () => { const t = sample(1); expect(evidenceSupported(t, new Map(t.sources.map(s => [s.url, s.quote])))).toBe(true); expect(evidenceSupported(t, new Map([[t.source, t.sources[0]?.quote ?? '']]))).toBe(false); });
  it('rejects fabricated quotes even with real source URLs', () => expect(evidenceSupported(sample(1), new Map(sample(1).sources.map(s => [s.url, 'Unrelated evidence'])))).toBe(false));
  it('recovers original punctuation but never substitutes invented words', () => {
    const text = 'The tiny ball—inside this pen—rolls across paper without leaking ink.';
    expect(exactEvidenceQuote('The tiny ball inside this pen rolls across paper without leaking ink', text)).toBe(text.slice(0, -1));
    expect(exactEvidenceQuote('The tiny ball inside this pen flies across paper without leaking ink', text)).toBe(null);
  });
});