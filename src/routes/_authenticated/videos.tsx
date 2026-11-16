import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Download, Film, Smartphone, Clapperboard, Plus, Copy, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actions, timeAgo, useStore, type Video } from "@/lib/store";
import { getVideoFile, saveVideoFile } from "@/lib/video-db";
import { fmt } from "@/lib/story-engine";
import { Page, Panel, Empty, btnPrimary, btnOutline, btnDark } from "@/components/page";
import { VideoJob } from "@/components/video-job";
import { RunningSteps } from "@/components/running-steps";
import { PublishButton } from "@/components/youtube";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "My videos — Chronicle Studio" },
      { name: "description", content: "Watch and download your generated history videos and Shorts." },
      { property: "og:title", content: "My videos — Chronicle Studio" },
      { property: "og:description", content: "Watch and download your generated history videos and Shorts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Videos,
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "video";

async function download(v: Video) {
  const blob = await getVideoFile(v.id);
  if (!blob) { toast.error("Video file not found on this device"); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(v.title)}.${(v.mime ?? blob.type).includes("mp4") ? "mp4" : "webm"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function importVideo(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const el = document.createElement("video");
    el.muted = true; el.preload = "auto"; el.src = url;
    await new Promise<void>((res, rej) => { el.onloadeddata = () => res(); el.onerror = () => rej(new Error("Can't read this video")); });
    el.currentTime = Math.min(1, el.duration / 2);
    await new Promise<void>((res) => { el.onseeked = () => res(); });
    const w = el.videoWidth, h = el.videoHeight, s = 360 / Math.max(w, h);
    const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext("2d")!.drawImage(el, 0, 0, c.width, c.height);
    const short = h > w;
    const title = file.name.replace(/\.[^.]+$/, "").replace(/\.publer\.com$/, "");
    const id = actions.addVideo({ topic: title, format: short ? "short" : "long", durationSec: Math.round(el.duration), archetype: "", style: "", voice: "atlas" });
    await saveVideoFile(id, file);
    actions.updateVideo(id, { status: "done", stage: "done", progress: 100, detail: "", duration: el.duration, mime: file.type, size: file.size, thumb: c.toDataURL("image/jpeg", 0.7), sceneCount: 0 });
    toast.success("Video added to your library");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Import failed");
  } finally { URL.revokeObjectURL(url); }
}

function Videos() {
  const videos = useStore((s) => s.videos);
  const [filter, setFilter] = useState<"all" | "long" | "short">("all");
  const [playing, setPlaying] = useState<Video | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!playing) { setSrc(null); return; }
    let url: string | null = null;
    void getVideoFile(playing.id).then((b) => {
      if (!b) { toast.error("Video file not found on this device"); return; }
      url = URL.createObjectURL(b); setSrc(url);
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [playing]);

  const done = videos.filter((v) => v.status === "done" && (filter === "all" || v.input.format === filter));
  const inProgress = videos.filter((v) => v.status !== "done" && !v.removed);

  return (
    <Page eyebrow="Library" title="My videos" desc="Every finished video, ready to watch and download."
      actions={<div className="flex gap-2">
        <label className={`${btnOutline} cursor-pointer`}><Upload className="h-4 w-4" /> Import video
          <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importVideo(f); }} />
        </label>
        <Link to="/" className={btnPrimary}><Plus className="h-4 w-4" /> New video</Link>
      </div>}>
      <RunningSteps videos={videos} />
      {inProgress.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">{inProgress.map((v) => <VideoJob key={v.id} v={v} />)}</div>
      )}

      <div className="flex rounded-md border bg-background p-0.5 text-xs font-semibold w-fit">
        {([["all", "All"], ["short", "Shorts"], ["long", "Long-form"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded px-4 py-1.5 ${filter === k ? "bg-foreground text-background" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {done.length === 0 ? (
        <Empty icon={Clapperboard} title="No finished videos yet" desc="Generate your first video and it will appear here." action={<Link to="/" className={btnPrimary}>Create a video</Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {done.map((v) => (
            <Panel key={v.id} className="flex flex-col overflow-hidden">
              <button onClick={() => setPlaying(v)} className="group relative aspect-video overflow-hidden bg-foreground">
                {v.thumb && <img src={v.thumb} alt="" className={`h-full w-full ${v.input.format === "short" ? "object-contain" : "object-cover"}`} />}
                <span className="absolute inset-0 grid place-items-center bg-foreground/20 opacity-80 transition-opacity group-hover:opacity-100">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"><Play className="h-5 w-5" /></span>
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background">{fmt(v.duration ?? 0)}</span>
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold">
                  {v.input.format === "short" ? <Smartphone className="h-3 w-3" /> : <Film className="h-3 w-3" />}{v.input.format === "short" ? "Short" : "Long-form"}
                </span>
              </button>
              <div className="flex flex-1 flex-col p-4">
                <p className="font-bold leading-snug">{v.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{timeAgo(v.createdAt)} · {v.sceneCount ? `${v.sceneCount} scenes · ` : ""}{((v.size ?? 0) / 1e6).toFixed(1)} MB</p>
                {v.qa && (
                  <details className="mt-2 text-xs">
                    <summary className={`w-fit cursor-pointer rounded px-1.5 py-0.5 font-mono font-bold ${v.qa.score >= 85 && v.ready !== false ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                      Quality {v.qa.score}/100{v.ready === false || v.qa.score < 85 ? " · Not ready to publish" : " · Ready"}
                    </summary>
                    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                      {Object.entries(v.qa.parts).map(([k, n]) => <li key={k} className="flex justify-between"><span className="capitalize">{k}</span><span>{n}</span></li>)}
                    </ul>
                    {v.story && <p className="mt-2 text-muted-foreground"><b className="text-foreground">Premise:</b> {v.story.premise}<br /><b className="text-foreground">Question:</b> {v.story.question}<br /><b className="text-foreground">Hero:</b> {v.story.hero}</p>}
                    {v.hooks && <p className="mt-2 text-muted-foreground"><b className="text-foreground">Hook:</b> {v.hooks.best}<br /><b className="text-foreground">Runner-up (A/B):</b> {v.hooks.runnerUp}</p>}
                    {v.judges && <p className="mt-1 text-muted-foreground"><b className="text-foreground">Viewer tests:</b> first 3s {v.judges.passA}/4 · first 15s {v.judges.passB}/4 · question answered {v.judges.passC ? "yes" : "no"}<br /><b className="text-foreground">Weakest part:</b> {v.judges.weakest}</p>}
                    {v.facts && <p className="mt-1 text-muted-foreground"><b className="text-foreground">Reality:</b> {v.facts.reality}</p>}
                    {!!v.checks?.length && <p className="mt-1 text-warning">To fix: {v.checks.join(" · ")}</p>}
                    <PerfForm v={v} />
                  </details>
                )}
                <div className="mt-auto flex gap-2 pt-4">
                  <button className={`${btnDark} flex-1 px-3 text-xs`} onClick={() => setPlaying(v)}><Play className="h-3.5 w-3.5" /> Play now</button>
                  <button className={`${btnPrimary} flex-1 px-3 text-xs`} onClick={() => void download(v)}><Download className="h-3.5 w-3.5" /> Download</button>
                </div>
                <PublishButton v={v} className={`${btnOutline} mt-2 w-full px-3 text-xs`} />
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className={playing?.input.format === "short" ? "max-w-md" : "max-w-4xl"}>
          <DialogHeader><DialogTitle>{playing?.title}</DialogTitle></DialogHeader>
          {src ? <video src={src} controls autoPlay className={`w-full rounded-md bg-foreground ${playing?.input.format === "short" ? "max-h-[70vh]" : ""}`} /> : <div className="aspect-video animate-pulse rounded-md bg-muted" />}
          {playing && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{playing.description}</p>
              <div className="flex gap-2">
                <button className={btnPrimary} onClick={() => void download(playing)}><Download className="h-4 w-4" /> Download</button>
                <button className={btnOutline} onClick={() => { void navigator.clipboard?.writeText(`${playing.title}\n\n${playing.description}`); toast("Title & description copied"); }}><Copy className="h-4 w-4" /> Copy title & description</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

const PERF = [["hold3", "3s hold %"], ["ret30", "30s retention %"], ["completion", "Completion %"], ["replays", "Replays %"]] as const;

/** Enter real YouTube numbers; hook types are re-ranked from them for future videos. */
function PerfForm({ v }: { v: Video }) {
  return (
    <div className="mt-2 rounded border p-2">
      <p className="font-semibold text-foreground">Your YouTube stats</p>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {PERF.map(([k, l]) => (
          <label key={k} className="flex flex-col text-[11px] text-muted-foreground">{l}
            <input type="number" min={0} max={1000} defaultValue={v.perf?.[k] ?? ""} className="mt-0.5 rounded border bg-background px-1.5 py-1 text-foreground"
              onBlur={(e) => { const n = e.target.value === "" ? undefined : Number(e.target.value); actions.updateVideo(v.id, { perf: { ...v.perf, [k]: n } }); }} />
          </label>
        ))}
      </div>
    </div>
  );
}
