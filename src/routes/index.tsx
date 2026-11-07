import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard, Film, Smartphone, FileText, Mic, ImageIcon, Layers, Settings,
  Plus, Search, Bell, Clapperboard, Clock, CheckCircle2, Loader2, CircleDashed,
  Sparkles, ArrowUpRight, Youtube, Cpu,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Chronicle Studio" },
      { name: "description", content: "Create long-form history and fact videos plus Shorts with an AI pipeline." },
      { property: "og:title", content: "Chronicle Studio Dashboard" },
      { property: "og:description", content: "AI pipeline for history-telling YouTube videos and Shorts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const nav: { icon: typeof Film; label: string; active?: boolean; to?: "/story-generator" }[] = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Film, label: "Long-form" },
  { icon: Smartphone, label: "Shorts & Reels" },
  { icon: Sparkles, label: "5-Beat Story Generator", to: "/story-generator" },
  { icon: FileText, label: "Scripts" },
  { icon: Mic, label: "Voiceovers" },
  { icon: ImageIcon, label: "Image library" },
  { icon: Layers, label: "Render queue" },
  { icon: Settings, label: "Settings" },
];

const stats = [
  { label: "Videos rendered", value: "128", delta: "+12 this week" },
  { label: "Minutes produced", value: "1,942", delta: "+214 min" },
  { label: "Shorts published", value: "86", delta: "+9 this week" },
  { label: "Avg. render time", value: "6m 40s", delta: "−18% vs last month" },
];

const steps = [
  { icon: FileText, name: "Script", desc: "Azure OpenAI writer" },
  { icon: Mic, name: "Narration", desc: "Azure text-to-speech" },
  { icon: ImageIcon, name: "Scenes", desc: "Image generation" },
  { icon: Clapperboard, name: "Motion", desc: "Ken Burns, parallax, maps" },
  { icon: Layers, name: "Stitch", desc: "Python + FFmpeg render" },
];

type Status = "done" | "rendering" | "queued" | "draft";
const projects: { title: string; format: "Long-form" | "Short"; length: string; status: Status; step: number; updated: string }[] = [
  { title: "The Fall of Constantinople, 1453", format: "Long-form", length: "18:24", status: "rendering", step: 4, updated: "4 min ago" },
  { title: "Why Romans Never Used Soap", format: "Short", length: "0:52", status: "done", step: 5, updated: "1 h ago" },
  { title: "The Lost Library of Alexandria", format: "Long-form", length: "22:10", status: "queued", step: 2, updated: "2 h ago" },
  { title: "Napoleon Was Not Short", format: "Short", length: "0:45", status: "done", step: 5, updated: "Yesterday" },
  { title: "Rise of the Mongol Empire", format: "Long-form", length: "—", status: "draft", step: 1, updated: "2 days ago" },
];

const statusStyle: Record<Status, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  done: { label: "Ready", cls: "text-success bg-success/10", Icon: CheckCircle2 },
  rendering: { label: "Rendering", cls: "text-primary bg-primary/10", Icon: Loader2 },
  queued: { label: "Queued", cls: "text-warning bg-warning/15", Icon: Clock },
  draft: { label: "Draft", cls: "text-muted-foreground bg-muted", Icon: CircleDashed },
};

function Dashboard() {
  const [format, setFormat] = useState<"long" | "short">("long");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Clapperboard className="h-4 w-4" />
          </div>
          <span className="font-bold tracking-tight">Chronicle Studio</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map((n) => n.to ? (
            <Link key={n.label} to={n.to} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ) : (
            <button
              key={n.label}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                n.active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </button>
          ))}
        </nav>
        <div className="m-3 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><Cpu className="h-3.5 w-3.5" /> Azure OpenAI</div>
          <p className="mt-1 text-xs text-muted-foreground">Not connected yet</p>
          <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full w-0 rounded-full bg-primary" /></div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <div className="flex w-full max-w-sm items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" /> Search projects, scripts…
          </div>
          <div className="flex items-center gap-3">
            <button className="grid h-9 w-9 place-items-center rounded-md border text-muted-foreground hover:text-foreground"><Bell className="h-4 w-4" /></button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">J</div>
          </div>
        </header>

        <main className="bg-grid flex-1 p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Studio overview</p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Good evening, James</h1>
              </div>
              <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
                <Plus className="h-4 w-4" /> New video
              </button>
            </div>

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border bg-background p-5">
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{s.value}</p>
                  <p className="mt-1 font-mono text-xs text-success">{s.delta}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-lg border bg-background p-6 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Quick create</h2>
                  <div className="flex rounded-md border p-0.5 text-xs font-semibold">
                    {(["long", "short"] as const).map((f) => (
                      <button key={f} onClick={() => setFormat(f)}
                        className={`rounded px-3 py-1.5 ${format === f ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                        {f === "long" ? "Long-form 16:9" : "Short 9:16"}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={3}
                  placeholder={format === "long" ? "e.g. The untold story of the Byzantine Empire's final days…" : "e.g. 3 weird facts about ancient Egypt…"}
                  className="mt-4 w-full resize-none rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Duration", format === "long" ? "15–20 min" : "45–60 sec"],
                    ["Voice", "Narrator · Deep male"],
                    ["Visual style", "Oil painting archive"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md border px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">{k}</p>
                      <p className="text-sm font-medium">{v}</p>
                    </div>
                  ))}
                </div>
                <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background">
                  <Sparkles className="h-4 w-4" /> Generate script
                </button>
                <Link to="/story-generator" className="ml-3 text-sm font-semibold text-primary hover:underline">Open 5-Beat Generator →</Link>
              </div>

              <div className="rounded-lg border bg-background p-6">
                <h2 className="font-bold">Production pipeline</h2>
                <p className="text-xs text-muted-foreground">No direct text-to-video — scenes are built and stitched.</p>
                <ol className="mt-4 space-y-3">
                  {steps.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                      <div className="grid h-8 w-8 place-items-center rounded-md border"><s.icon className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section className="rounded-lg border bg-background">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="font-bold">Recent projects</h2>
                <button className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">View all <ArrowUpRight className="h-3.5 w-3.5" /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-6 py-3 font-medium">Title</th>
                      <th className="px-6 py-3 font-medium">Format</th>
                      <th className="px-6 py-3 font-medium">Length</th>
                      <th className="px-6 py-3 font-medium">Progress</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const st = statusStyle[p.status];
                      return (
                        <tr key={p.title} className="border-b last:border-0 hover:bg-muted/60">
                          <td className="px-6 py-3.5 font-medium">
                            <span className="inline-flex items-center gap-2">
                              {p.format === "Short" ? <Smartphone className="h-4 w-4 text-muted-foreground" /> : <Youtube className="h-4 w-4 text-muted-foreground" />}
                              {p.title}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground">{p.format}</td>
                          <td className="px-6 py-3.5 font-mono text-xs">{p.length}</td>
                          <td className="px-6 py-3.5">
                            <div className="flex gap-1">
                              {steps.map((_, i) => (
                                <span key={i} className={`h-1.5 w-5 rounded-full ${i < p.step ? "bg-primary" : "bg-muted"}`} />
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
                              <st.Icon className={`h-3 w-3 ${p.status === "rendering" ? "animate-spin" : ""}`} /> {st.label}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground">{p.updated}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
