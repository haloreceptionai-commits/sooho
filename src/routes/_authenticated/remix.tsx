import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles, Youtube, Smartphone, Film } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useStore, STYLES, type VideoEngine } from "@/lib/store";
import { startVideo } from "@/lib/pipeline";
import { importShort, type ShortImport } from "@/lib/pipeline.functions";
import { getTopicHistory } from "@/lib/topics.functions";
import { topicUnavailable } from "@/lib/topics";
import { Page, Panel, btnPrimary, input, label } from "@/components/page";
import { Button } from "@/components/ui/button";
import { VideoJob } from "@/components/video-job";
import { seedanceEstimate } from "@/lib/seedance";

export const Route = createFileRoute("/_authenticated/remix")({
  head: () => ({
    meta: [
      { title: "Remix a Short or video — Chronicle Studio" },
      { name: "description", content: "Paste a YouTube Short or long video link and get a brand-new Short or long-form video on the same topic." },
      { property: "og:title", content: "Remix a YouTube Short or video — Chronicle Studio" },
      { property: "og:description", content: "Read any YouTube video's script and turn its topic into your own original Short or long-form video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Remix,
});

function Remix() {
  const settings = useStore((s) => s.settings);
  const videos = useStore((s) => s.videos);
  const read = useServerFn(importShort);
  const checkHistory = useServerFn(getTopicHistory);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [found, setFound] = useState<(ShortImport & { url: string }) | null>(null);
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<"short" | "long">("short");
  const [sec, setSec] = useState(60);
  const [longMin, setLongMin] = useState(8);
  const [style, setStyle] = useState(settings.defaultStyle);
  const [engine, setEngine] = useState<VideoEngine>("own");
  const jobs = videos.filter((v) => v.input.reference && v.status !== "done" && !v.removed).slice(0, 4);

  const fetchScript = async () => {
    setLoading(true); setFound(null);
    try {
      const r = await read({ data: { url: url.trim(), deployment: settings.scriptDeployment } });
      setFound({ ...r, url: url.trim() }); setTopic(r.topic);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not read that Short"); }
    finally { setLoading(false); }
  };

  const generate = async () => {
    if (!found || !topic.trim()) return;
    setStarting(true);
    try {
      const used = [...(await checkHistory()), ...videos.map((v) => ({ topic: v.input.topic, topicId: v.input.topicId, status: v.status }))];
      if (topicUnavailable(topic, undefined, used)) { toast.error("You already made a video with this title. Change the title a little."); return; }
      startVideo({
        topic: topic.trim(), format, durationSec: format === "short" ? sec : longMin * 60, archetype: "paradox", style, voice: "onyx", engine,
        topicSource: { url: found.url, fact: found.summary }, reference: { url: found.url, transcript: found.transcript },
      });
      toast.success("Your new video is being made — follow it below or in My videos.");
      setFound(null); setUrl(""); setTopic("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not start the video"); }
    finally { setStarting(false); }
  };

  return (
    <Page eyebrow="Remix" title="Remix a YouTube Short or video" desc="Paste a Short or a long video link. We read its script, find the true topic, and make a brand-new original Short or long-form video about it.">
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Panel className="p-5">
            <label htmlFor="yt-url" className={label}>1 · YouTube link — Short or long video</label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input id="yt-url" className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/shorts/… or https://www.youtube.com/watch?v=…" onKeyDown={(e) => { if (e.key === "Enter" && url) void fetchScript(); }} />
              <Button onClick={fetchScript} disabled={!url.trim() || loading} className={btnPrimary}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />} Get script
              </Button>
            </div>
            {loading && <p className="mt-2 text-xs text-muted-foreground">Reading the video's words… about 20 seconds (longer videos can take a minute).</p>}
          </Panel>

          {found && (
            <>
              <Panel className="p-5">
                <p className={label}>2 · What the video says</p>
                <p className="mt-3 text-sm">{found.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{found.facts.map((f) => <li key={f}>{f}</li>)}</ul>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer font-semibold">Original script ({found.transcript.split(" ").length} words)</summary>
                  <p className="mt-2 max-h-48 overflow-y-auto rounded-md bg-muted p-3 leading-relaxed text-muted-foreground">{found.transcript}</p>
                </details>
                <label htmlFor="remix-topic" className={`${label} mt-5 block`}>Your new video title</label>
                <input id="remix-topic" className={`${input} mt-2`} value={topic} onChange={(e) => setTopic(e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">Your video tells the same true story with a brand-new script. It never copies the original's lines.</p>
              </Panel>

              <Panel className="space-y-4 p-5">
                <p className={label}>3 · Format, length, style & model</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([["short", Smartphone, "Short / Reel 9:16"], ["long", Film, "Long-form 16:9 · 3–15 min"]] as const).map(([f, Icon, n]) => (
                    <button key={f} onClick={() => { setFormat(f); setStyle(f === "long" ? "Ink explainer" : settings.defaultStyle); }} className={`flex items-center gap-2 rounded-lg border-2 p-3 text-sm font-semibold ${format === f ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><Icon className="h-4 w-4" /> {n}</button>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between text-sm"><span className="font-semibold">Length</span><span className="font-mono">{format === "short" ? `${sec}s` : `${longMin} min`}</span></div>
                  {format === "short"
                    ? <input aria-label="Short length in seconds" type="range" min={30} max={90} step={5} value={sec} onChange={(e) => setSec(+e.target.value)} className="mt-2 w-full accent-primary" />
                    : <input aria-label="Long-form length in minutes" type="range" min={3} max={15} step={1} value={longMin} onChange={(e) => setLongMin(+e.target.value)} className="mt-2 w-full accent-primary" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((st) => <button key={st} onClick={() => setStyle(st)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${style === st ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground"}`}>{st}</button>)}
                </div>
                <select aria-label="Video model" className={input} value={engine} onChange={(e) => setEngine(e.target.value as VideoEngine)}>
                  <option value="own">Own model — AI images with camera motion</option>
                  <option value="cartoon">Own cartoon — 3D cartoon + animated maps on Azure</option>
                  <option value="omni">Gemini Omni — AI-animated video clips</option>
                  <option value="seedance">Seedance 2.5 — fluid cartoon animation · 720p</option>
                </select>
                {engine === "own" && format === "long" && style === "Ink explainer" && <p className="text-xs text-muted-foreground">Ink explainer long-form: sharp hand-drawn pictures that change every 1–2 seconds in time with the narration, plus a matching thumbnail.</p>}
                {engine === "cartoon" && <p className="text-xs text-muted-foreground">{format === "short" ? "3D cartoon Short rendered on Azure." : "Long-form cartoon: 16:9 documentary with animated relief maps, glowing territory and marching armies, plus cartoon scenes."} You approve a preview before the full render; it then continues even if you close your browser.</p>}
                {engine === "omni" && <p className="text-xs text-muted-foreground">Characters really move. Uses far more AI credits and adds several minutes per video.</p>}
                {engine === "seedance" && <p className="text-xs text-muted-foreground">Estimated animation: ~{seedanceEstimate(format === "short" ? sec : longMin * 60)} credits, plus script, images and narration. Actual cost varies with scene lengths.</p>}
              </Panel>

              <Button onClick={generate} disabled={starting || !topic.trim()} className={`${btnPrimary} h-auto w-full py-4 text-base`}>
                {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} Create my {format === "short" ? "Short" : "long-form video"}
              </Button>
            </>
          )}
        </div>

        <Panel className="h-fit min-w-0 p-5">
          <h2 className="font-bold">Remixes in production</h2>
          <div className="mt-4 space-y-3">
            {jobs.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No remixes being made right now.</p>}
            {jobs.map((v) => <VideoJob key={v.id} v={v} />)}
          </div>
        </Panel>
      </div>
    </Page>
  );
}
