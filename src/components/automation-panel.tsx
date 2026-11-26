import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CalendarClock, FlaskConical, Loader2, Save, Video, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Panel, input, label } from '@/components/page';
import { useActiveWorkspace } from '@/lib/workspaces';
import { getAutomation, saveAutomation, verifyAutomationPosting } from '@/lib/automation.functions';
import { nextAutomationSlots, type AutomationConfig } from '@/lib/automation';
import type { Settings } from '@/lib/store';

const timeLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export function AutomationPanel({ settings }: { settings: Settings }) {
  const { id } = useActiveWorkspace();
  if (!id) return null;
  return <WorkspaceAutomation key={id} workspaceId={id} settings={settings} />;
}
function WorkspaceAutomation({ workspaceId, settings }: { workspaceId: string; settings: Settings }) {
  const get = useServerFn(getAutomation), save = useServerFn(saveAutomation), verifyPosting = useServerFn(verifyAutomationPosting), cache = useQueryClient();
  const key = ['video-automation', workspaceId];
  const query = useQuery({ queryKey: key, queryFn: () => get({ data: { workspaceId } }), refetchInterval: 30000 });
  const [draft, setDraft] = useState<AutomationConfig | null>(null), [busy, setBusy] = useState(false);
  const c = draft ?? query.data?.config;
  const set = (patch: Partial<AutomationConfig>) => { if (c) setDraft({ ...c, ...patch }); };
  const submit = async () => {
    if (!c) return;
    setBusy(true);
    try {
      await save({ data: { config: c, settings } });
      await cache.invalidateQueries({ queryKey: key });
      setDraft(null); toast.success(c.enabled ? 'Daily automation enabled' : 'Automation settings saved · daily creation is off');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save automation'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!c) return;
    setBusy(true);
    try {
      const done = await verifyPosting({ data: { workspaceId, config: c, settings } });
      await cache.invalidateQueries({ queryKey: key });
      toast.success(`Posting works: "${done.title}" was uploaded privately to YouTube. You can now turn on daily automation.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Posting check failed'); }
    finally { setBusy(false); }
  };
  return <Panel className="space-y-5 p-5 lg:col-span-2">
    <div className="flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2 font-bold"><CalendarClock className="h-4 w-4" /> Automate</h2>
      <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{c?.enabled ? 'On' : 'Off'}</span><Switch aria-label="Daily video automation" checked={c?.enabled ?? false} disabled={!c || busy || (!c.enabled && !query.data?.readiness.ready)} onCheckedChange={enabled => set({ enabled })} /></div>
    </div>
    {query.isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking automation…</p>}
    {query.isError && <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{query.error.message}</p><Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button></div>}
    {c && query.data && <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4 text-sm">
        <span className="flex min-w-0 items-center gap-2"><Youtube className="h-4 w-4 shrink-0" /><span className="break-words">{query.data.channel ?? 'YouTube not connected'}</span></span>
        <span className="text-muted-foreground">United Kingdom · GMT / BST</span>
      </div>
      {(!query.data.readiness.ready || query.data.pausedReason) && <p role="status" className="border-l-2 border-warning pl-3 text-sm text-warning">{query.data.pausedReason ?? query.data.readiness.reason}</p>}
      {!query.data.readiness.ready && <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy || !query.data.connected} onClick={() => void verify()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}Verify posting with a finished video</Button><span className="text-xs text-muted-foreground">Uploads one video you already made, privately. No new video is created.</span></div>}
      {query.data.verifiedAt && query.data.verifiedYoutubeId && <p className="text-xs text-muted-foreground">Posting verified {timeLabel(query.data.verifiedAt)} · <a className="text-primary underline" href={`https://youtu.be/${query.data.verifiedYoutubeId}`} target="_blank" rel="noreferrer">private check video</a></p>}
      <div className="grid gap-5 md:grid-cols-2">
        {(['short', 'long'] as const).map(format => {
          const short = format === 'short', selected = c.formats.includes(format);
          return <div key={format} className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-primary" checked={selected} onChange={e => set({ formats: e.target.checked ? [...c.formats, format] : c.formats.filter(f => f !== format) })} /><Video className="h-4 w-4" />{short ? 'Short video' : 'Long-form video'}</label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>Daily posting time</span><input aria-label={`${short ? 'Short' : 'Long-form'} posting time`} type="time" className={`${input} mt-1.5`} value={short ? c.shortTime : c.longTime} disabled={!selected} onChange={e => set(short ? { shortTime: e.target.value } : { longTime: e.target.value })} /></label>
              <label><span className={label}>Video length</span><select aria-label={`${short ? 'Short' : 'Long-form'} video length`} className={`${input} mt-1.5`} value={short ? c.shortSeconds : c.longSeconds} disabled={!selected} onChange={e => set(short ? { shortSeconds: Number(e.target.value) } : { longSeconds: Number(e.target.value) })}>{(short ? [15, 30, 45, 60, 90] : [180, 300, 600, 900, 1200]).map(s => <option key={s} value={s}>{short ? `${s} seconds` : `${s / 60} minutes`}</option>)}</select></label>
            </div>
          </div>;
        })}
      </div>
      <label className="block"><span className={label}>Topic focus</span><input aria-label="Automation topic focus" className={`${input} mt-1.5`} maxLength={200} value={c.focus} placeholder="History and documented facts" onChange={e => set({ focus: e.target.value })} /></label>
      <dl className="grid gap-3 border-y py-4 sm:grid-cols-2">
        {nextAutomationSlots(c, Date.now()).map(slot => <div key={slot.format} className="space-y-1 text-sm"><dt className="font-semibold">{slot.format === 'short' ? 'Next Short' : 'Next long-form video'}</dt><dd className="text-muted-foreground">Create: {timeLabel(slot.generateAt)}</dd><dd className="text-muted-foreground">Post: {timeLabel(slot.publishAt)}</dd></div>)}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-muted-foreground">{c.formats.length} video{c.formats.length === 1 ? '' : 's'} per day · Paid AI generation{query.data.lastCheckedAt ? ` · Last checked ${timeLabel(query.data.lastCheckedAt)}` : ''}</p>
        <Button disabled={busy || !c.formats.length} onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save automation</Button>
      </div>
      {!!query.data.runs.length && <div className="border-t pt-4"><h3 className="mb-2 text-sm font-semibold">Recent daily videos</h3><ul className="divide-y">{query.data.runs.map(run => <li key={run.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm"><div><p>{run.format === 'short' ? 'Short' : 'Long-form'} · {run.private_test ? 'Private test' : timeLabel(run.publish_at)}</p>{run.error && <p className="mt-1 max-w-xl break-words text-xs text-destructive">{run.error}</p>}</div>{run.youtube_id ? <a href={`https://youtu.be/${run.youtube_id}`} target="_blank" rel="noreferrer" className="text-primary underline">{run.private_test ? 'Private on YouTube' : run.status}</a> : <span className="text-muted-foreground">{run.status}</span>}</li>)}</ul></div>}
    </>}
  </Panel>;
}