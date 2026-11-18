import { FOCUS_PRESETS } from '@/lib/viral-topics';
import { useRef, useState } from 'react';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bookmark, BookmarkCheck, Check, ExternalLink, Loader2, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { input, label } from './page';
import { discoveryQuery } from '@/lib/topic-discovery-query';
import { findTopics, saveTopicForLater } from '@/lib/topic-discovery.functions';
import { potential, type DiscoveredTopic } from '@/lib/topic-discovery';
import { topicUnavailable, type TopicUse } from '@/lib/topics';

export function TopicFinder({ used, selected, onSelect, format, deployment }: { used: TopicUse[]; selected: string; onSelect: (t: DiscoveredTopic) => void; format: 'short' | 'long'; deployment: string }) {
  const { data } = useSuspenseQuery(discoveryQuery), client = useQueryClient();
  const find = useServerFn(findTopics), save = useServerFn(saveTopicForLater);
  const [focus, setFocus] = useState(''), [tab, setTab] = useState<'fresh' | 'saved'>('fresh');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saving, setSaving] = useState<string[]>([]);
  const lock = useRef(false);
  const ideas = (tab === 'fresh' ? data.latest : data.saved).filter(t => !topicUnavailable(t.title, t.id, used));
  const discover = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const topics = await find({ data: { focus, format, deployment } }); client.setQueryData(discoveryQuery.queryKey, { ...data, latest: topics }); setTab('fresh'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Research could not finish. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const toggle = async (t: DiscoveredTopic) => {
    const saved = data.saved.some(s => s.factKey === t.factKey);
    setSaving(prev => [...prev, t.factKey]);
    try { await save({ data: { factKey: t.factKey, saved: !saved } }); await client.invalidateQueries({ queryKey: discoveryQuery.queryKey }); toast.success(saved ? 'Removed from saved topics' : 'Saved for later'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save topic'); }
    finally { setSaving(prev => prev.filter(k => k !== t.factKey)); }
  };
  return <section aria-label="AI topic finder">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className={`${label} flex items-center gap-2`}><Sparkles className="size-4" />2 · Find a story</p>
      <div className="flex gap-1"><Button variant={tab === 'fresh' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab('fresh')}>Fresh facts</Button><Button variant={tab === 'saved' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab('saved')}><Bookmark className="size-4" />Saved ({data.saved.length})</Button></div>
    </div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Topic research focus" className={`${input} min-w-0 flex-1`} value={focus} onChange={e => setFocus(e.target.value)} maxLength={200} placeholder="Any subject, or focus on ships, inventions, strange history…" /><Button disabled={busy} onClick={discover}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Find topics</Button></div>
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Viral angles">{FOCUS_PRESETS.map(p => <button key={p.label} type="button" onClick={() => setFocus(p.focus)} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${focus === p.focus ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{p.label}</button>)}</div>
    {busy && <p role="status" className="mt-3 text-sm text-muted-foreground">Hunting for shocking true stories, checking every fact against two sources…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {!ideas.length && !busy && <p className="py-7 text-center text-sm text-muted-foreground">{tab === 'saved' ? 'No unused saved topics yet.' : 'Pick a viral angle above (or type your own) and find six shocking true stories.'}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {ideas.map(t => { const saved = data.saved.some(s => s.factKey === t.factKey); return <article key={t.id} className={`min-w-0 rounded-md border p-4 ${selected === t.title ? 'border-primary bg-primary/5' : 'border-border'}`}>
        <div className="flex items-start justify-between gap-2"><h3 className="font-semibold leading-snug">{t.title}</h3><Button variant="ghost" size="icon" title={saved ? 'Remove from saved topics' : 'Save for later'} aria-label={`${saved ? 'Unsave' : 'Save'} ${t.title}`} disabled={saving.includes(t.factKey)} onClick={() => toggle(t)}>{saved ? <BookmarkCheck className="size-4 text-primary" /> : <Bookmark className="size-4" />}</Button></div>
        <p className="mt-2 text-xs font-medium text-primary">Editorial potential {potential(t)}/100 · {t.sources.length} sources</p>
        <p className="mt-3 text-sm leading-relaxed">{t.fact}</p>
        <p className="mt-3 text-sm font-medium">“{t.hook}”</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.whyWatch}</p>
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-primary">Evidence & reveal</summary><p className="mt-2 leading-relaxed">{t.payoff}</p>{t.caveat && <p className="mt-2 text-muted-foreground">{t.caveat}</p>}{t.sources.map(s => <div key={s.url} className="mt-3"><a className="inline-flex items-center gap-1 text-primary break-all" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<ExternalLink className="size-3 shrink-0" /></a><blockquote className="mt-1 leading-relaxed text-muted-foreground">{s.quote}</blockquote></div>)}<p className="mt-3 text-muted-foreground">Editorial assessment, not a guarantee of views.</p></details>
        <Button className="mt-4 w-full" variant={selected === t.title ? 'secondary' : 'outline'} aria-pressed={selected === t.title} onClick={() => onSelect(t)}>{selected === t.title ? <Check className="size-4" /> : <Sparkles className="size-4" />}{selected === t.title ? 'Selected' : 'Use this topic'}</Button>
      </article>; })}
    </div>
  </section>;
}