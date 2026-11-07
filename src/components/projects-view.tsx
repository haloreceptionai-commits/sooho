import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Play, Film, Smartphone, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actions, timeAgo, useStore, type Format } from "@/lib/store";
import { TEMPLATES, fmt } from "@/lib/story-engine";
import { Page, Panel, Empty, StatusPill, btnPrimary, btnOutline, input, label } from "@/components/page";

const STEPS = ["Script", "Voice", "Scenes", "Motion", "Stitch"];

export function ProjectsView({ format }: { format: Format }) {
  const all = useStore((s) => s.projects);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "queued" | "rendering" | "done">("all");
  const [open, setOpen] = useState(false);
  const isLong = format === "long";
  const list = all.filter((p) => p.format === format && (filter === "all" || p.status === filter) && p.title.toLowerCase().includes(q.toLowerCase()));

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [template, setTemplate] = useState("paradox");
  const [dur, setDur] = useState(isLong ? 15 : 60);

  const create = () => {
    if (!title.trim()) return toast.error("Give your video a title");
    actions.addProject({ title, topic: topic || title, format, template, duration: isLong ? dur * 60 : dur });
    toast.success("Project created");
    setOpen(false); setTitle(""); setTopic("");
  };

  return (
    <Page
      eyebrow={isLong ? "16:9 · YouTube" : "9:16 · Shorts / Reels / TikTok"}
      title={isLong ? "Long-form videos" : "Shorts & Reels"}
      desc={isLong ? "Documentary-style history episodes, 8–30 minutes." : "Fast fact videos under 90 seconds, built to loop."}
      actions={<button className={btnPrimary} onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New {isLong ? "episode" : "short"}</button>}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-md border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="w-full bg-transparent py-2 text-sm outline-none" />
        </div>
        <div className="flex rounded-md border bg-background p-0.5 text-xs font-semibold">
          {(["all", "draft", "queued", "rendering", "done"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded px-3 py-1.5 capitalize ${filter === f ? "bg-foreground text-background" : "text-muted-foreground"}`}>{f === "done" ? "ready" : f}</button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={isLong ? Film : Smartphone} title="No projects here yet" desc="Start a new project or use the Story Generator to plan one." action={<button className={btnPrimary} onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New project</button>} />
      ) : (
        <div className={`grid gap-4 ${isLong ? "md:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
          {list.map((p) => (
            <Panel key={p.id} className="flex flex-col overflow-hidden">
              <div className={`bg-grid relative flex items-center justify-center border-b bg-muted ${isLong ? "aspect-video" : "aspect-[4/5]"}`}>
                {isLong ? <Film className="h-8 w-8 text-muted-foreground" /> : <Smartphone className="h-8 w-8 text-muted-foreground" />}
                <span className="absolute bottom-2 right-2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background">{fmt(p.duration)}</span>
                <span className="absolute left-2 top-2"><StatusPill status={p.status} /></span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="font-bold leading-snug">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{TEMPLATES.find((t) => t.id === p.template)?.name} · {timeAgo(p.updatedAt)}</p>
                <div className="mt-3 flex gap-1">
                  {STEPS.map((s, i) => (
                    <button key={s} title={`${s} ${i < p.step ? "done" : ""}`} onClick={() => actions.updateProject(p.id, { step: i + 1 === p.step ? i : i + 1 })}
                      className={`h-1.5 flex-1 rounded-full ${i < p.step ? "bg-primary" : "bg-muted"}`} />
                  ))}
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{p.step}/5 · {STEPS[Math.min(p.step, 4)]}{p.step >= 5 ? " complete" : " next"}</p>
                <div className="mt-4 flex gap-2">
                  <Link to="/story-generator" className={`${btnOutline} flex-1 px-3 text-xs`}>Plan story</Link>
                  <button className={`${btnOutline} flex-1 px-3 text-xs`} disabled={p.status === "queued" || p.status === "rendering"}
                    onClick={() => { actions.queueRender(p.id); toast.success("Added to render queue"); }}>
                    <Play className="h-3.5 w-3.5" /> Render
                  </button>
                  <button className={`${btnOutline} px-2.5`} title="Delete" onClick={() => { actions.deleteProject(p.id); toast("Project deleted"); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New {isLong ? "long-form episode" : "short"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><p className={label}>Title</p><input className={`${input} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Day Rome Burned" /></div>
            <div><p className={label}>Topic / angle</p><input className={`${input} mt-1.5`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Great Fire of Rome, 64 AD" /></div>
            <div>
              <p className={label}>Viral template</p>
              <select className={`${input} mt-1.5`} value={template} onChange={(e) => setTemplate(e.target.value)}>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <div className="flex justify-between"><p className={label}>Target length</p><span className="font-mono text-xs">{isLong ? `${dur} min` : `${dur}s`}</span></div>
              <input type="range" className="mt-2 w-full accent-primary" min={isLong ? 5 : 15} max={isLong ? 30 : 90} step={isLong ? 1 : 5} value={dur} onChange={(e) => setDur(+e.target.value)} />
            </div>
            <button className={`${btnPrimary} w-full`} onClick={create}>Create project</button>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
