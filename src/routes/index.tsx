import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Film, Smartphone, Sparkles, Play, Square, Shuffle, Loader2, ArrowUpRight, Mic } from "lucide-react";
import { toast } from "sonner";
import { useStore, STYLES } from "@/lib/store";
import { startVideo } from "@/lib/pipeline";
import { generateVoice } from "@/lib/pipeline.functions";
import { ARCHETYPES, scoreTopic, type ArchetypeId } from "@/lib/viral-brain";
import { VOICES } from "@/lib/voices";
import { Page, Panel, btnPrimary, btnOutline, input, label } from "@/components/page";
import { VideoJob } from "@/components/video-job";
import { VoiceAuditions } from "@/components/voice-auditions";

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
  const [voice, setVoice] = useState(settings.defaultVoice);
  const [style, setStyle] = useState(settings.defaultStyle);
  const [seed, setSeed] = useState(0);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<Record<string, string>>({});

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

  const preview = async (id: string, text: string) => {
    audioRef.current?.pause();
    if (previewing === id) { setPreviewing(null); return; }
    setPreviewing(id);
    try {
      if (!cache.current[id]) {
        const r = await generateVoice({ data: { text, voice: id, deployment: settings.ttsDeployment, style: "" } });
        const type = r.engine === "azure" ? "audio/mpeg" : "audio/wav";
        cache.current[id] = URL.createObjectURL(new Blob([Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0))], { type }));
      }
      const el = new Audio(cache.current[id]);
      audioRef.current = el;
      el.onended = () => setPreviewing(null);
      await el.play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
      setPreviewing(null);
    }
  };

  const generate = () => {
    if (!topic.trim()) { toast.error("Pick or type a topic first"); return; }
    startVideo({ topic: topic.trim(), format, durationSec: format === "short" ? shortSec : longMin * 60, archetype: arch, style, voice });
    toast.success("Video generation started — you can keep working.");
    setTopic("");
  };

  return (
    <Page eyebrow="Studio" title="Create a video" desc="Pick a format and topic. Script, narration, scene images, sound and editing happen automatically.">
      <VoiceAuditions />
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
                  <span className="font-medium">{t}</span><Ring v={s.overall} />
                </button>
              ))}
            </div>
            <input className={`${input} mt-3`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="…or type your own: Why Lighthouses Were Painted In Stripes" />
            {topic && (
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-muted-foreground">
                <span>Viral score <b className="text-foreground">{score.overall}</b></span>
                <span>Curiosity {score.curiosity}</span><span>Visual drama {score.visual}</span><span>Retention {score.retention}</span>
              </div>
            )}
          </Panel>

          {/* 3. Voice & style */}
          <Panel className="p-5">
            <p className={label}>3 · Narrator voice</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {VOICES.map((vo) => (
                <div key={vo.id} onClick={() => setVoice(vo.id)} role="button"
                  className={`cursor-pointer rounded-lg border-2 p-3 ${voice === vo.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-bold">{vo.name}</p>
                    <button onClick={(e) => { e.stopPropagation(); void preview(vo.id, vo.sample); }} className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-background" aria-label={`Preview ${vo.name}`}>
                      {previewing === vo.id ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-primary">{vo.persona}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{vo.desc}</p>
                </div>
              ))}
            </div>
            <p className={`${label} mt-5`}>Visual style</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STYLES.map((st) => (
                <button key={st} onClick={() => setStyle(st)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${style === st ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{st}</button>
              ))}
            </div>
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
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"><Mic className="h-3 w-3" /> Script by {settings.scriptDeployment} · images by {settings.imageDeployment} on Azure OpenAI.</p>
        </div>
      </div>
    </Page>
  );
}
