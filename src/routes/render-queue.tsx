import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Layers, X, Film, Smartphone, Download } from "lucide-react";
import { toast } from "sonner";
import { actions, timeAgo, useStore } from "@/lib/store";
import { Page, Panel, Empty, StatusPill, btnOutline } from "@/components/page";

export const Route = createFileRoute("/render-queue")({
  head: () => ({
    meta: [
      { title: "Render queue — Chronicle Studio" },
      { name: "description", content: "Track video stitching and rendering jobs." },
      { property: "og:title", content: "Render queue — Chronicle Studio" },
      { property: "og:description", content: "Track video stitching and rendering jobs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RenderQueue,
});

const STAGES = ["Fetch assets", "Animate scenes", "Mix audio + SFX", "Captions", "Encode MP4"];

function RenderQueue() {
  const jobs = useStore((s) => s.jobs);
  useEffect(() => {
    const t = setInterval(() => actions.tickRender(), 1000);
    return () => clearInterval(t);
  }, []);
  const active = jobs.filter((j) => j.status === "rendering" || j.status === "queued");
  const done = jobs.filter((j) => j.status === "done" || j.status === "failed");

  return (
    <Page eyebrow="Production" title="Render queue"
      desc="Jobs run one at a time. This is a simulated worker for now — the Python + FFmpeg renderer will plug in here."
      actions={done.length > 0 && <button className={btnOutline} onClick={actions.clearFinished}>Clear finished</button>}>
      <div className="grid grid-cols-3 gap-4">
        {[["Active", jobs.filter((j) => j.status === "rendering").length], ["Waiting", jobs.filter((j) => j.status === "queued").length], ["Finished", done.length]].map(([k, v]) => (
          <Panel key={k} className="p-5"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-2xl font-bold">{v}</p></Panel>
        ))}
      </div>

      {jobs.length === 0 ? (
        <Empty icon={Layers} title="Queue is empty" desc="Hit Render on any long-form or short project to add it here." />
      ) : (
        <>
          {active.length > 0 && (
            <Panel className="divide-y">
              {active.map((j) => {
                const stage = Math.min(4, Math.floor(j.progress / 20));
                return (
                  <div key={j.id} className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {j.format === "long" ? <Film className="h-4 w-4 text-muted-foreground" /> : <Smartphone className="h-4 w-4 text-muted-foreground" />}
                      <p className="flex-1 font-semibold">{j.title}</p>
                      {j.status === "queued" && <span className="font-mono text-xs text-muted-foreground">#{active.filter((x) => x.status === "queued").indexOf(j) + 1} in line</span>}
                      <StatusPill status={j.status} />
                      <button className={`${btnOutline} px-2.5 py-1.5`} title="Cancel" onClick={() => { actions.cancelJob(j.id); toast("Job cancelled"); }}><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${j.progress}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
                      <span>{j.status === "rendering" ? STAGES[stage] : "Waiting for worker"}</span><span>{j.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </Panel>
          )}
          {done.length > 0 && (
            <Panel className="divide-y">
              <p className="px-5 py-3 text-sm font-bold">Finished</p>
              {done.map((j) => (
                <div key={j.id} className="flex items-center gap-3 px-5 py-3">
                  {j.format === "long" ? <Film className="h-4 w-4 text-muted-foreground" /> : <Smartphone className="h-4 w-4 text-muted-foreground" />}
                  <p className="flex-1 text-sm font-medium">{j.title}</p>
                  <span className="text-xs text-muted-foreground">{timeAgo(j.createdAt)}</span>
                  <StatusPill status={j.status} />
                  <button className={`${btnOutline} px-2.5 py-1.5`} onClick={() => toast("Downloads will be available once the renderer is connected")}><Download className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </Panel>
          )}
        </>
      )}
    </Page>
  );
}
