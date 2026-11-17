import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Eye, Users, Video, ThumbsUp, MessageCircle, Layers, RefreshCw, Plus, ArrowUpRight, Youtube } from "lucide-react";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { dashboardQuery } from "@/lib/dashboard-query";
import { dashboardTotals, type WorkspaceStats } from "@/lib/dashboard-stats";
import { setActiveWorkspace } from "@/lib/workspaces";

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (search: Record<string, unknown>): { mode?: "remix" | "script" } =>
    search["mode"] === "remix" || search["mode"] === "script" ? { mode: search["mode"] } : {},
  beforeLoad: ({ search }) => { if (search.mode) throw redirect({ to: "/create", search: { mode: search.mode }, replace: true }); },
  head: () => ({ meta: [
    { title: "Workspace dashboard — Chronicle Studio" },
    { name: "description", content: "Live YouTube views, subscribers, uploads and engagement across every workspace." },
    { property: "og:title", content: "Workspace dashboard — Chronicle Studio" },
    { property: "og:description", content: "All your workspace channels and YouTube performance in one dashboard." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  pendingComponent: () => <Page eyebrow="All workspaces" title="Dashboard"><p className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Loading your channel statistics…</p></Page>,
  errorComponent: DashboardError,
  notFoundComponent: () => <Page title="Dashboard"><p>Dashboard not found.</p></Page>,
  component: Dashboard,
});

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
function DashboardError({ error }: { error: unknown }) {
  const router = useRouter();
  return <Page title="Dashboard"><p role="alert" className="text-destructive">{error instanceof Error ? error.message : "Could not load your dashboard."}</p><Button variant="outline" onClick={() => void router.invalidate()}>Try again</Button></Page>;
}

function Dashboard() {
  const q = useSuspenseQuery({ ...dashboardQuery, refetchInterval: 5 * 60_000 });
  const d = q.data;
  const totals = dashboardTotals(d.workspaces);
  const available = totals.connected > 0;
  const value = (n: number) => available ? fmt(n) : "—";
  const metrics = [
    { icon: Eye, name: "Total views", value: value(totals.views), note: "Channel lifetime", tone: "text-primary bg-primary/10" },
    { icon: Users, name: "Subscribers", value: value(totals.subscribers), note: totals.hiddenSubscribers ? `${totals.hiddenSubscribers} channel count hidden` : "Current audience", tone: "text-success bg-success/10" },
    { icon: Video, name: "Videos posted", value: value(totals.posted), note: "Published on YouTube", tone: "text-chart-3 bg-chart-3/10" },
    { icon: ThumbsUp, name: "Likes", value: value(totals.likes), note: "All accessible uploads", tone: "text-chart-2 bg-chart-2/10" },
    { icon: MessageCircle, name: "Comments", value: value(totals.comments), note: "All accessible uploads", tone: "text-warning bg-warning/10" },
    { icon: Layers, name: "Workspaces", value: fmt(d.workspaces.length), note: `${totals.connected} live channel${totals.connected === 1 ? "" : "s"}`, tone: "text-muted-foreground bg-muted" },
  ];
  const seen = new Set<string>();
  const top = d.workspaces.flatMap(w => w.videos.map(v => ({ ...v, workspace: w.name })))
    .filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true; })
    .sort((a, b) => b.views - a.views).slice(0, 6);

  return <Page eyebrow="All workspaces" title="Dashboard"
    actions={<><Button variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} />Refresh</Button><Button asChild><Link to="/create"><Plus />Create video</Link></Button></>}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${available ? "bg-success" : "bg-muted-foreground"}`} />{totals.connected} connected channel{totals.connected === 1 ? "" : "s"} · YouTube</span>
      <span>Updated {new Date(d.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
    {q.isRefetchError && <p role="alert" className="text-sm text-destructive">Refresh failed. Showing the last successful statistics.</p>}
    {d.workspaces.some(w => w.status === "error") && <p role="alert" className="text-sm text-warning">Some channels are unavailable. Totals include only channels that loaded successfully.</p>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
      {metrics.map(m => <article key={m.name} className="min-w-0 rounded-lg border bg-background p-4">
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{m.name}</span><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${m.tone}`}><m.icon className="h-4 w-4" /></span></div>
        <p className="mt-4 break-words text-2xl font-extrabold tabular-nums">{m.value}</p><p className="mt-1 text-xs text-muted-foreground">{m.note}</p>
      </article>)}
    </div>
    <section>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Workspace performance</h2><span className="text-xs text-muted-foreground">Lifetime totals</span></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {d.workspaces.map(w => <WorkspaceCard key={w.id} workspace={w} />)}
      </div>
      {!d.workspaces.length && <p className="py-8 text-sm text-muted-foreground">No workspaces yet. Add a workspace from the sidebar.</p>}
    </section>
    <section className="border-t pt-6">
      <h2 className="mb-4 text-lg font-bold">Top performing videos</h2>
      {top.length ? <div className="divide-y">{top.map(v => <a key={v.id} href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-4 hover:bg-muted/50">
        {v.thumb ? <img src={v.thumb} alt="" className="h-12 w-20 shrink-0 rounded object-cover" loading="lazy" /> : <Video className="h-8 w-8 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold">{v.title}</p><p className="mt-1 text-xs text-muted-foreground">{v.workspace} · {fmt(v.likes)} likes · {fmt(v.comments)} comments</p></div>
        <div className="shrink-0 text-right"><p className="text-sm font-bold tabular-nums">{fmt(v.views)}</p><p className="text-xs text-muted-foreground">views</p></div><ArrowUpRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
      </a>)}</div> : <div className="flex items-center gap-3 border-y py-8 text-sm text-muted-foreground"><Youtube className="h-6 w-6" />{available ? "No YouTube uploads yet." : "No connected channel statistics yet."}</div>}
    </section>
  </Page>;
}

function WorkspaceCard({ workspace: w }: { workspace: WorkspaceStats }) {
  const c = w.channel;
  const metrics = c ? [
    ["Views", fmt(c.views)], ["Subscribers", c.subscribers === null ? "Hidden" : fmt(c.subscribers)], ["Videos posted", fmt(c.videos)],
    ["Likes", fmt(w.videos.reduce((s, v) => s + v.likes, 0))], ["Comments", fmt(w.videos.reduce((s, v) => s + v.comments, 0))],
  ] : [];
  return <article className="min-w-0 rounded-lg border bg-background p-5">
    <div className="flex items-center gap-3">
      {c?.thumb ? <img src={c.thumb} alt="" className="h-10 w-10 rounded-full" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent text-lg font-bold text-accent-foreground">{w.name[0]}</span>}
      <div className="min-w-0 flex-1"><h3 className="break-words font-bold">{w.name}</h3><p className="truncate text-xs text-muted-foreground">{c?.title ?? (w.status === "error" ? "Connection needs attention" : "YouTube not connected")}</p></div>
      <span className={`h-2 w-2 shrink-0 rounded-full ${c ? "bg-success" : w.status === "error" ? "bg-warning" : "bg-muted-foreground"}`} />
    </div>
    {c ? <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">{metrics.map(([label, n]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{n}</dd></div>)}</dl> : <p className="my-5 text-sm text-muted-foreground">{w.error ?? "Connect this workspace’s YouTube channel to see its views, subscribers and engagement."}</p>}
    <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
      <Button asChild variant={c ? "outline" : "default"} size="sm"><Link to={c ? "/analytics" : "/settings"} onClick={() => setActiveWorkspace(w.id)}>{c ? "View analytics" : w.status === "error" ? "Reconnect YouTube" : "Connect YouTube"}<ArrowUpRight /></Link></Button>
      <Button asChild variant="ghost" size="sm"><Link to="/videos" onClick={() => setActiveWorkspace(w.id)}>My videos</Link></Button>
    </div>
  </article>;
}