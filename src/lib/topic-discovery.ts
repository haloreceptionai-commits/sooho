import { z } from 'zod';
import { topicKey, topicUnavailable, type FactTopic, type TopicUse } from './topics';

export const topicEvidence = z.object({ url: z.string().url().refine(v => v.startsWith('https://')), title: z.string().min(1), quote: z.string().min(30) });
export const discoveredTopicSchema = z.object({
  id: z.string(), title: z.string().min(10).max(100), archetype: z.enum(['paradox', 'exploit', 'object', 'experiment']),
  fact: z.string().min(40), source: z.string().url(), factKey: z.string().min(8), hook: z.string().min(10),
  whyWatch: z.string().min(20), payoff: z.string().min(20), caveat: z.string(),
  scores: z.object({ curiosity: z.number().int().min(0).max(20), clarity: z.number().int().min(0).max(20), visual: z.number().int().min(0).max(20), payoff: z.number().int().min(0).max(20), surprise: z.number().int().min(0).max(20) }),
  sources: z.array(topicEvidence).min(2),
});
export type DiscoveredTopic = z.infer<typeof discoveredTopicSchema> & FactTopic;
export interface DiscoveryLibrary { latest: DiscoveredTopic[]; saved: DiscoveredTopic[] }
export const potential = (t: DiscoveredTopic) => Object.values(t.scores).reduce((sum, n) => sum + n, 0);
const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Recover an exact evidence passage when the editor changed only quote punctuation/markup. */
export function exactEvidenceQuote(quote: string, text: string) {
  if (normalized(text).includes(normalized(quote))) return quote;
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  const wanted = quote.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (wanted.length < 8) return null;
  for (let start = 0; start <= words.length - wanted.length; start++) {
    if (!wanted.every((word, j) => words[start + j]?.[0].toLowerCase() === word)) continue;
    const first = words[start], last = words[start + wanted.length - 1];
    if (first?.index === undefined || last?.index === undefined) continue;
    return text.slice(first.index, last.index + last[0].length);
  }
  return null;
}
export function evidenceSupported(t: DiscoveredTopic, fetched: Map<string, string>) {
  const domains = new Set(t.sources.filter(s => {
    const text = fetched.get(s.url);
    return text && normalized(text).includes(normalized(s.quote));
  }).map(s => new URL(s.url).hostname.replace(/^www\./, '')));
  return domains.size >= 2;
}
export function freshSix(candidates: DiscoveredTopic[], seen: DiscoveredTopic[], used: TopicUse[]) {
  const keys = new Set(seen.map(t => topicKey(t.factKey)));
  const titles = new Set(seen.map(t => topicKey(t.title)));
  return candidates.filter(t => {
    const key = topicKey(t.factKey), title = topicKey(t.title);
    if (keys.has(key) || titles.has(title) || topicUnavailable(t.title, t.id, used)) return false;
    keys.add(key); titles.add(title); return true;
  }).sort((a, b) => potential(b) - potential(a)).slice(0, 6);
}