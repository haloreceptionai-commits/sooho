import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Film, Smartphone, Sparkles, Shuffle, Loader2, ArrowUpRight, Mic } from "lucide-react";
import { toast } from "sonner";
import { useStore, STYLES, type VideoEngine } from "@/lib/store";
import { startVideo } from "@/lib/pipeline";
import { ARCHETYPES, scoreTopic, type ArchetypeId } from "@/lib/viral-brain";
import { madeBefore, scoreTopic5 } from "@/lib/quality";
import { Page, Panel, btnPrimary, btnOutline, input, label } from "@/components/page";
import { VideoJob } from "@/components/video-job";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Create video — Chronicle Studio" },
      { name: "description", content: "Generate viral history long-form videos and Shorts in one click." },
      { property: "og:title", content: "Chronicle Studio — AI history video generator" },
      { property: "og:description", content: "Topic in, finished narrated history video out. Long-form or Shorts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Create,
});

function Ring({ v }: { v: number }) {
  const tone = v >= 70 ? "text-success" : v >= 45 ? "text-warning" : "text-muted-foreground";
  return <span className={`font-mono text-xs font-bold ${tone}`}>{v}</span>;
}

function Create() {
  const settings = useStore((s) => s.settings);
  const videos = useStore((s) => s.videos);
  const [format, setFormat] = useState<"long" | "short">("short");
  const [topic, setTopic] = useState("");
  const [arch, setArch] = useState<ArchetypeId>("paradox");
  const [shortSec, setShortSec] = useState(60);
  const [longMin, setLongMin] = useState(8);
    const [style, setStyle] = useState(settings.defaultStyle);
  const [engine, setEngine] = useState<VideoEngine>("own");
  const [seed, setSeed] = useState(0);

  const a = ARCHETYPES.find((x) => x.id === arch)!;
  const ideas = useMemo(() => {
    const t = a.topics;
    const r = seed % t.length;
    return [...t.slice(r), ...t.slice(0, r)].slice(0, 4).map((x) => ({ t: x, s: scoreTopic(x) }));
  }, [a, seed]);
  const score = scoreTopic(topic);
  const active = videos.filter((v) => v.status !== "done").slice(0, 5);
  const recent = videos.filter((v) => v.status === "done").slice(0, 4);
  const busy = videos.some((v) => v.status === "running");

  const generate = () => {
    if (!topic.trim()) { toast.error("Pick or type a topic first"); return; }
    startVideo({ topic: topic.trim(), format, durationSec: format === "short" ? shortSec : longMin * 60, archetype: arch, style, voice: "onyx", engine });
    toast.success("Video generation started — you can keep working.");
    setTopic("");
  };

  return (
    <Page eyebrow="Studio" title="Create a video" desc="Pick a format and topic. Script, narration, scene images, sound and editing happen automatically.">
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {/* 1. Format */}
          <Panel className="p-5">
            <p className={label}>1 · Format</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                ["short", Smartphone, "Short / Reel", "9:16 vertical · 30–90 sec · viral hook formula"],
                ["long", Film, "Long-form", "16:9 YouTube · 3–15 min documentary"],
              ] as const).map(([f, Icon, name, sub]) => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors ${format === f ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                  <div className={`grid h-12 place-items-center rounded-md ${format === f ? "bg-primary text-primary-foreground" : "bg-muted"} ${f === "short" ? "w-8" : "w-16"}`}><Icon className="h-5 w-5" /></div>
                  <div><p className="font-bold">{name}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm"><span className="font-semibold">Length</span>
                <span className="font-mono">{format === "short" ? `${shortSec}s` : `${longMin} min`}</span></div>
              {format === "short"
                ? <input type="range" min={30} max={90} step={5} value={shortSec} onChange={(e) => setShortSec(+e.target.value)} className="mt-2 w-full accent-primary" />
                : <input type="range" min={3} max={15} step={1} value={longMin} onChange={(e) => setLongMin(+e.target.value)} className="mt-2 w-full accent-primary" />}
            </div>
          </Panel>

          {/* 2. Topic */}
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <p className={label}>2 · Topic</p>
              <button className={`${btnOutline} px-2.5 py-1 text-xs`} onClick={() => setSeed((x) => x + 2)}><Shuffle className="h-3 w-3" /> More ideas</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ARCHETYPES.map((x) => (
                <button key={x.id} onClick={() => setArch(x.id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${arch === x.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{x.name}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{a.formula} — e.g. “{a.example}”</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ideas.map(({ t, s }) => (
                <button key={t} onClick={() => setTopic(t)} className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${topic === t ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                  <span className="font-medium">{t}{madeBefore(t, videos.map((v) => v.input.topic)) && <span className="ml-1.5 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">made before</span>}</span>
                  <span className="flex shrink-0 items-center gap-2"><span className={`font-mono text-[11px] ${scoreTopic5(t).pass ? "text-success" : "text-muted-foreground"}`} title="5 topic tests">{scoreTopic5(t).total}/25</span><Ring v={s.overall} /></span>
                </button>
              ))}
            </div>
            <input className={`${input} mt-3`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="…or type your own: Why Lighthouses Were Painted In Stripes" />
            {topic && (
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-muted-foreground">
                <span>Viral score <b className="text-foreground">{score.overall}</b></span>
                <span>Topic tests <b className="text-foreground">{scoreTopic5(topic).total}/25</b>{scoreTopic5(topic).pass ? " ✓" : " (needs 18)"}</span>
                {madeBefore(topic, videos.map((v) => v.input.topic)) && <span className="text-warning">Already made</span>}
                <span>Curiosity {score.curiosity}</span><span>Visual drama {score.visual}</span><span>Retention {score.retention}</span>
              </div>
            )}
          </Panel>

          {/* 3. Voice & style */}
          <Panel className="p-5">
            <p className={label}>3 · Visual style</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STYLES.map((st) => (
                <button key={st} onClick={() => setStyle(st)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${style === st ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{st}</button>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <label htmlFor="engine" className={label}>4 · Video model</label>
            <select id="engine" className={`${input} mt-3`} value={engine} onChange={(e) => setEngine(e.target.value as VideoEngine)}>
              <option value="own">Own model — AI images with camera motion</option>
              <option value="omni">Gemini Omni — AI-animated video clips</option>
            </select>
            {engine === "omni" && <p className="mt-2 text-xs text-muted-foreground">Characters really move. Uses far more AI credits and adds several minutes per video.</p>}
          </Panel>

          <button onClick={generate} className={`${btnPrimary} w-full py-4 text-base`}>
            <Sparkles className="h-5 w-5" /> Generate {format === "short" ? "Short" : "long-form video"}
          </button>
        </div>

        {/* Right column: live jobs */}
        <div className="space-y-4">
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold">{busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />} In production</h2>
              <span className="font-mono text-xs text-muted-foreground">{active.length} job{active.length === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-4 space-y-3">
              {active.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No videos generating. Your next one will show live progress here.</p>}
              {active.map((v) => <VideoJob key={v.id} v={v} />)}
            </div>
            {busy && <p className="mt-3 text-[11px] text-muted-foreground">Keep this tab open until rendering finishes.</p>}
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Latest videos</h2>
              <Link to="/videos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">All videos <ArrowUpRight className="h-3 w-3" /></Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {recent.length === 0 && <p className="col-span-2 text-sm text-muted-foreground">Nothing yet.</p>}
              {recent.map((v) => (
                <Link key={v.id} to="/videos" className="group overflow-hidden rounded-md border">
                  <div className="aspect-video bg-muted">{v.thumb && <img src={v.thumb} alt="" className="h-full w-full object-cover" />}</div>
                  <p className="truncate px-2 py-1.5 text-xs font-semibold group-hover:underline">{v.title}</p>
                </Link>
              ))}
            </div>
          </Panel>
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"><Mic className="h-3 w-3" /> Atlas narrator · script by {settings.scriptDeployment} · images by {settings.imageDeployment} on Azure OpenAI.</p>
        </div>
      </div>
    </Page>
  );
}
