import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Search, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { input, label } from "@/components/page";
import { ARCHETYPES, scoreTopic } from "@/lib/viral-brain";
import { availableTopics, topicPage, type FactTopic, type TopicUse } from "@/lib/topics";

export function TopicLibrary({ library, used, selected, onSelect }: {
  library: FactTopic[]; used: TopicUse[]; selected: string; onSelect: (topic: FactTopic) => void;
}) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const remaining = useMemo(() => availableTopics(library, used), [library, used]);
  const filtered = useMemo(() => availableTopics(library, used, category, search), [library, used, category, search]);
  const ideas = topicPage(filtered, page);
  return <section aria-label="Fact topic library">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className={`${label} flex items-center gap-2`}><BookOpen className="size-4" />2 · Topic library</p>
      <span className="text-xs text-muted-foreground">{remaining.length} unused · {library.length} sourced topics</span>
    </div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input aria-label="Search fact topics" className={`${input} pl-9`} placeholder="Search history, space, ships…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div>
      <select aria-label="Topic category" className={`${input} sm:w-56`} value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }}>
        <option value="all">All categories</option>{ARCHETYPES.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}
      </select>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {ideas.map((idea) => <div key={idea.id} className={`min-w-0 rounded-md border ${selected === idea.title ? "border-primary bg-primary/5" : "border-border"}`}>
        <Button variant="ghost" className="h-auto min-h-16 w-full items-start justify-between whitespace-normal p-3 text-left" onClick={() => onSelect(idea)} aria-pressed={selected === idea.title}>
          <span className="min-w-0 font-semibold">{idea.title}</span><span className="shrink-0 font-mono text-xs text-muted-foreground" title="Topic potential">{scoreTopic(idea.title).overall}</span>
        </Button>
        <div className="px-3 pb-3"><p className="text-xs leading-relaxed text-muted-foreground">{idea.fact}</p><a href={idea.source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary">Read source <ExternalLink className="size-3" /></a></div>
      </div>)}
    </div>
    {ideas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{search ? "No unused topics match this search." : "All topics in this category have been used."}</p>}
    <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{filtered.length} matching topics · {filtered.length ? page % Math.ceil(filtered.length / 8) + 1 : 0}/{Math.ceil(filtered.length / 8)}</span><Button variant="outline" size="sm" disabled={filtered.length <= 8} onClick={() => setPage((p) => p + 1)}><Shuffle />More ideas</Button></div>
  </section>;
}