import type { ArchetypeId } from "@/lib/viral-brain";

export interface FactTopic {
  id: string;
  title: string;
  archetype: ArchetypeId;
  fact: string;
  source: string;
}
export interface TopicUse {
  topic: string;
  topicId?: string | undefined;
  status: string;
}

/** Ignore punctuation, spacing and question prefixes, not the subject itself. */
export function topicKey(title: string) {
  return title.normalize("NFKD").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^(why|how|the)\s+/, "");
}

export function topicUnavailable(title: string, id: string | undefined, used: TopicUse[]) {
  const key = topicKey(title);
  return used.some((u) => (u.status === "done" || u.status === "running") && ((id && u.topicId === id) || topicKey(u.topic) === key));
}

export function availableTopics(library: FactTopic[], used: TopicUse[], category = "all", search = "") {
  const words = topicKey(search).split(" ").filter(Boolean);
  const seen = new Set<string>();
  return library.filter((t) => {
    const key = topicKey(t.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return !topicUnavailable(t.title, t.id, used) && (category === "all" || category === t.archetype)
      && words.every((w) => `${t.title} ${t.fact}`.toLowerCase().includes(w));
  });
}

export function topicPage(topics: FactTopic[], page: number, size = 8) {
  const pages = Math.max(1, Math.ceil(topics.length / size));
  return topics.slice((page % pages) * size, (page % pages + 1) * size);
}