import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, ThumbsUp, MessageCircle, Users, PlaySquare, TrendingUp, RefreshCw, Bot, Send, Heart } from "lucide-react";
import { useActiveWorkspace } from "@/lib/workspaces";
import { youtubeAnalytics, youtubeReplyNow, youtubeSetAutoReply } from "@/lib/youtube.functions";
import { Page, Panel, btnDark, btnOutline } from "@/components/page";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Chronicle Studio" },
      { name: "description", content: "YouTube channel views, engagement KPIs and auto-replies to comments." },
      { property: "og:title", content: "Analytics — Chronicle Studio" },
      { property: "og:description", content: "YouTube channel views, engagement KPIs and auto-replies to comments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

const fmt = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const ago = (iso: string) => {
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const secs = (d: string) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d); return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0)) : 0; };

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Eye; label: string; value: string; sub?: string }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono text-[10px] uppercase tracking-widest">{label}</span><Icon className="h-4 w-4" /></div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Panel>
  );
}

function AnalyticsPage() {
  const load = useServerFn(youtubeAnalytics), replyNow = useServerFn(youtubeReplyNow), setAuto = useServerFn(youtubeSetAutoReply);
  const qc = useQueryClient();
  const { id: workspaceId, active } = useActiveWorkspace();
  const q = useQuery({ queryKey: ["yt-analytics", workspaceId], queryFn: () => load({ data: { workspaceId: workspaceId! } }), enabled: !!workspaceId, retry: false, staleTime: 60_000 });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"pending" | "replied">("pending");

  const stats = useMemo(() => {
    const v = q.data?.videos ?? [];
    const views = v.reduce((s, x) => s + x.views, 0), likes = v.reduce((s, x) => s + x.likes, 0), comments = v.reduce((s, x) => s + x.comments, 0);
    const shorts = v.filter((x) => secs(x.duration) <= 180);
    const week = v.filter((x) => Date.now() - new Date(x.published).getTime() < 7 * 864e5);
    return { views, likes, comments, eng: views ? ((likes + comments) / views) * 100 : 0, avg: v.length ? views / v.length : 0,
      shorts: shorts.length, long: v.length - shorts.length, week: week.reduce((s, x) => s + x.views, 0),
      top: [...v].sort((a, b) => b.views - a.views), max: Math.max(1, ...v.map((x) => x.views)) };
  }, [q.data]);

  if (!workspaceId || q.isLoading) return <Page eyebrow={active?.name ?? "YouTube"} title="Analytics"><Panel className="p-10 text-center text-sm text-muted-foreground">Loading your channel…</Panel></Page>;
  if (q.error) return (
    <Page eyebrow={active?.name ?? "YouTube"} title="Analytics">
      <Panel className="p-10 text-center"><p className="text-sm text-muted-foreground">{String((q.error as Error).message)}</p>
        <Link to="/settings" className={`${btnDark} mt-4`}>Open Settings</Link></Panel>
    </Page>
  );
  const d = q.data!;
  const pending = d.comments.filter((c) => !c.replied && !d.replies.some((r) => r.comment_id === c.id));
  const titleOf = (id: string | null) => d.videos.find((v) => v.id === id)?.title ?? "Video";

  const runReplies = async () => {
    setBusy(true);
    try { const r = await replyNow({ data: { workspaceId: workspaceId! } }); toast.success(`Replied to ${r.replied} comment${r.replied === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} spam` : ""}`); await qc.invalidateQueries({ queryKey: ["yt-analytics", workspaceId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const toggle = async () => {
    await setAuto({ data: { on: !d.autoReply, workspaceId: workspaceId! } });
    toast.success(d.autoReply ? "Auto-reply turned off" : "Auto-reply on — new comments get a kind reply every 10 minutes");
    await qc.invalidateQueries({ queryKey: ["yt-analytics"] });
  };

  return (
    <Page eyebrow={active?.name ?? "YouTube"} title="Analytics" desc={`${d.channel.title} · last ${d.videos.length} uploads`}
      actions={<button className={btnOutline} onClick={() => void q.refetch()} disabled={q.isFetching}><RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh</button>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Subscribers" value={fmt(d.channel.subscribers)} />
        <Kpi icon={Eye} label="Total views" value={fmt(d.channel.views)} sub={`${fmt(stats.week)} on this week's uploads`} />
        <Kpi icon={PlaySquare} label="Videos" value={fmt(d.channel.videos)} sub={`${stats.shorts} Shorts · ${stats.long} long-form`} />
        <Kpi icon={TrendingUp} label="Avg views / video" value={fmt(stats.avg)} />
        <Kpi icon={ThumbsUp} label="Likes" value={fmt(stats.likes)} />
        <Kpi icon={MessageCircle} label="Comments" value={fmt(stats.comments)} />
        <Kpi icon={Heart} label="Engagement rate" value={`${stats.eng.toFixed(2)}%`} sub="(likes + comments) / views" />
        <Kpi icon={Bot} label="Auto-replies sent" value={fmt(d.replies.filter((r) => r.reply !== "(skipped)").length)} sub={`${pending.length} waiting`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel className="p-5 lg:col-span-3">
          <h2 className="text-sm font-bold">Top videos</h2>
          <div className="mt-4 space-y-3">
            {stats.top.slice(0, 10).map((v) => (
              <a key={v.id} href={`https://youtu.be/${v.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md p-1 hover:bg-muted">
                {v.thumb && <img src={v.thumb} alt="" className="h-10 w-16 shrink-0 rounded object-cover" loading="lazy" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{v.title}</p>
                  <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(v.views / stats.max) * 100}%` }} /></div>
                </div>
                <div className="w-24 shrink-0 text-right font-mono text-xs"><p className="font-bold">{fmt(v.views)} views</p><p className="text-muted-foreground">{fmt(v.likes)} · {fmt(v.comments)}</p></div>
              </a>
            ))}
            {!stats.top.length && <p className="text-sm text-muted-foreground">No uploads yet.</p>}
          </div>
        </Panel>

        <Panel className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Comment replies</h2>
            <button onClick={() => void toggle()} role="switch" aria-checked={d.autoReply} className="flex items-center gap-2 text-xs font-semibold">
              Auto-reply
              <span className={`relative h-5 w-9 rounded-full transition-colors ${d.autoReply ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-all ${d.autoReply ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Soft, friendly replies written by AI. Spam is skipped. Each comment is answered once.</p>
          {d.commentError && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{d.commentError}</p>}
          <div className="mt-3 flex gap-1 rounded-md bg-muted p-1 text-xs font-semibold">
            {(["pending", "replied"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded px-2 py-1.5 ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                {t === "pending" ? `Waiting (${pending.length})` : `Replied (${d.replies.length})`}
              </button>
            ))}
          </div>
          <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {tab === "pending" ? pending.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <img src={c.authorThumb} alt="" className="h-7 w-7 shrink-0 rounded-full" loading="lazy" />
                <div className="min-w-0 text-sm"><p className="text-xs"><b>{c.author}</b> <span className="text-muted-foreground">· {ago(c.published)} · {titleOf(c.videoId)}</span></p><p className="mt-0.5 break-words">{c.text}</p></div>
              </div>
            )) : d.replies.map((r) => (
              <div key={r.comment_id} className="rounded-md border p-2.5 text-sm">
                <p className="text-xs text-muted-foreground"><b className="text-foreground">{r.author}</b> · {ago(r.created_at)} · {titleOf(r.video_id)}</p>
                <p className="mt-1 break-words">{r.comment}</p>
                <p className={`mt-1.5 border-l-2 pl-2 ${r.reply === "(skipped)" ? "border-muted text-muted-foreground italic" : "border-primary"}`}>{r.reply === "(skipped)" ? "Skipped as spam" : r.reply}</p>
              </div>
            ))}
            {tab === "pending" && !pending.length && <p className="py-6 text-center text-sm text-muted-foreground">All caught up 🎉</p>}
          </div>
          <button className={`${btnDark} mt-4 w-full`} onClick={() => void runReplies()} disabled={busy || !pending.length}>
            <Send className="h-4 w-4" /> {busy ? "Replying…" : `Reply to ${Math.min(20, pending.length)} now`}
          </button>
        </Panel>
      </div>
    </Page>
  );
}
