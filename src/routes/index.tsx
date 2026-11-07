import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Film, Smartphone, FileText, Mic, ImageIcon, Clapperboard, Layers, Plus, Sparkles, ArrowUpRight, Youtube } from "lucide-react";
import { toast } from "sonner";
import { actions, timeAgo, useStore } from "@/lib/store";
import { fmt } from "@/lib/story-engine";
import { Page, Panel, StatusPill, btnPrimary, btnDark, input } from "@/components/page";

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

const steps = [
  { icon: FileText, name: "Script", desc: "Azure OpenAI writer", to: "/scripts" as const },
  { icon: Mic, name: "Narration", desc: "Azure text-to-speech", to: "/voiceovers" as const },
  { icon: ImageIcon, name: "Scenes", desc: "Image generation", to: "/images" as const },
  { icon: Clapperboard, name: "Motion", desc: "Ken Burns, parallax, maps", to: "/story-generator" as const },
  { icon: Layers, name: "Stitch", desc: "Python + FFmpeg render", to: "/render-queue" as const },
];

function Dashboard() {
  const s = useStore((x) => x);
  const navigate = useNavigate();
  const [format, setFormat] = useState<"long" | "short">("long");
  const [idea, setIdea] = useState("");
  const done = s.projects.filter((p) => p.status === "done");
  const minutes = Math.round(done.reduce((a, p) => a + p.duration, 0) / 60);
  const stats = [
    { label: "Projects", value: s.projects.length, sub: `${s.projects.filter((p) => p.status === "draft").length} drafts` },
    { label: "Videos ready", value: done.length, sub: `${minutes} min produced` },
    { label: "Shorts", value: s.projects.filter((p) => p.format === "short").length, sub: "9:16 vertical" },
    { label: "In render queue", value: s.jobs.filter((j) => j.status !== "done").length, sub: "active + waiting" },
  ];

  const quick = () => {
    if (!idea.trim()) { toast.error("Type a video idea first"); return; }
    actions.addProject({ title: idea, topic: idea, format, template: "paradox", duration: format === "long" ? 900 : 60 });
    toast.success("Project created");
    setIdea("");
    navigate({ to: format === "long" ? "/long-form" : "/shorts" });
  };

  return (
    <Page eyebrow="Studio overview" title="Good evening, James"
      actions={<Link to="/story-generator" className={btnPrimary}><Plus className="h-4 w-4" /> New video</Link>}>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((x) => (
          <Panel key={x.label} className="p-5">
            <p className="text-xs font-medium text-muted-foreground">{x.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{x.value}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{x.sub}</p>
          </Panel>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Quick create</h2>
            <div className="flex rounded-md border p-0.5 text-xs font-semibold">
              {(["long", "short"] as const).map((f) => (
                <button key={f} onClick={() => setFormat(f)} className={`rounded px-3 py-1.5 ${format === f ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                  {f === "long" ? "Long-form 16:9" : "Short 9:16"}
                </button>
              ))}
            </div>
          </div>
          <textarea rows={3} value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder={format === "long" ? "e.g. The untold story of the Byzantine Empire's final days…" : "e.g. 3 weird facts about ancient Egypt…"}
            className={`${input} mt-4 resize-none`} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={quick} className={btnDark}><Plus className="h-4 w-4" /> Create project</button>
            <Link to="/story-generator" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><Sparkles className="h-4 w-4" /> Plan with 5-Beat Generator →</Link>
          </div>
        </Panel>

        <Panel className="p-6">
          <h2 className="font-bold">Production pipeline</h2>
          <p className="text-xs text-muted-foreground">No direct text-to-video — scenes are built and stitched.</p>
          <ol className="mt-4 space-y-1">
            {steps.map((st, i) => (
              <li key={st.name}>
                <Link to={st.to} className="flex items-center gap-3 rounded-md p-1.5 hover:bg-muted">
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  <div className="grid h-8 w-8 place-items-center rounded-md border bg-background"><st.icon className="h-4 w-4" /></div>
                  <div><p className="text-sm font-semibold">{st.name}</p><p className="text-xs text-muted-foreground">{st.desc}</p></div>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <Panel>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-bold">Recent projects</h2>
          <Link to="/long-form" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">View all <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                {["Title", "Format", "Length", "Progress", "Status", "Updated"].map((h) => <th key={h} className="px-6 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...s.projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/60">
                  <td className="px-6 py-3.5 font-medium">
                    <Link to={p.format === "long" ? "/long-form" : "/shorts"} className="inline-flex items-center gap-2 hover:underline">
                      {p.format === "short" ? <Smartphone className="h-4 w-4 text-muted-foreground" /> : <Youtube className="h-4 w-4 text-muted-foreground" />}
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground">{p.format === "long" ? "Long-form" : "Short"}</td>
                  <td className="px-6 py-3.5 font-mono text-xs">{fmt(p.duration)}</td>
                  <td className="px-6 py-3.5"><div className="flex gap-1">{steps.map((_, i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i < p.step ? "bg-primary" : "bg-muted"}`} />)}</div></td>
                  <td className="px-6 py-3.5"><StatusPill status={p.status} /></td>
                  <td className="px-6 py-3.5 text-muted-foreground">{timeAgo(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <span className="hidden"><Film /></span>
    </Page>
  );
}
