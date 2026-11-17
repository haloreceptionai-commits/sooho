import { exactDuration } from "@/lib/shorts-writer/stage";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Film, Smartphone, Sparkles, Loader2, ArrowUpRight, Mic, Youtube, FilePenLine, PenLine } from "lucide-react";
import { toast } from "sonner";
import { useStore, STYLES, type VideoEngine } from "@/lib/store";
import { startVideo } from "@/lib/pipeline";
import { scoreTopic, type ArchetypeId } from "@/lib/viral-brain";
import { scoreTopic5 } from "@/lib/quality";
import { Page, Panel, btnPrimary, input, label } from "@/components/page";
import { VideoJob } from "@/components/video-job";
import { Button } from "@/components/ui/button";
import { TopicFinder } from "@/components/topic-finder";
import { discoveryQuery } from "@/lib/topic-discovery-query";
import type { DiscoveredTopic } from "@/lib/topic-discovery";
import { topicUnavailable, type TopicUse } from "@/lib/topics";
import { topicHistoryQuery } from "@/lib/topics-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTopicHistory } from "@/lib/topics.functions";
import { RemixPanel } from "@/components/remix-panel";
import { ScriptWriterPanel } from "@/components/script-writer-panel";
import { useActiveWorkspace, useWorkspaceVideos } from "@/lib/workspaces";

type Mode = "topic" | "remix" | "script";
const MODES: { id: Mode; icon: typeof PenLine; name: string; sub: string }[] = [
  { id: "topic", icon: Sparkles, name: "Make a video", sub: "Pick a topic, get a finished video" },
  { id: "remix", icon: Youtube, name: "Remix a YouTube video", sub: "Same true story, brand-new video" },
  { id: "script", icon: FilePenLine, name: "Write a script", sub: "Script and scene plan only, no video" },
];

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (search: Record<string, unknown>): { mode?: "remix" | "script" } => (search["mode"] === "remix" || search["mode"] === "script" ? { mode: search["mode"] } : {}),
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
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(topicHistoryQuery), context.queryClient.ensureQueryData(discoveryQuery)]),
  component: Create,
});

function Create() {
  const settings = useStore((s) => s.settings);
  const videos = useStore((s) => s.videos);          // every workspace: a topic is never made twice
  const workspaceVideos = useWorkspaceVideos();      // this workspace only: what is shown on the right
  const { active } = useActiveWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode: Mode = search.mode ?? "topic";
  const setMode = (m: Mode) => void navigate({ to: "/", search: m === "topic" ? {} : { mode: m }, replace: true });
  const [format, setFormat] = useState<"long" | "short">("short");
  const [topic, setTopic] = useState("");
  const [arch, setArch] = useState<ArchetypeId>("paradox");
  const [shortSec, setShortSec] = useState(60);
  const [longMin, setLongMin] = useState(8);
    const [style, setStyle] = useState(settings.defaultStyle);
  const [engine, setEngine] = useState<VideoEngine>("advanced");   // Shorts always use the Advanced engine; the older engines stay for long-form only
  const { data: history } = useSuspenseQuery(topicHistoryQuery);
  const checkHistory = useServerFn(getTopicHistory);
  const [checking, setChecking] = useState(false);
  const [topicId, setTopicId] = useState<string | undefined>();
  const [ownScript, setOwnScript] = useState("");
  const [selectedFact, setSelectedFact] = useState<DiscoveredTopic | undefined>();
  const used: TopicUse[] = [...history, ...videos.map((v) => ({ topic: v.input.topic, topicId: v.input.topicId, status: v.status }))];
  // An owner script may remake a finished topic; only a video still in production blocks (no double spend).
  const owned = format === "short" && !!ownScript.trim();
  // Topic history keeps stale "running" marks, so an owner script checks only real videos still running.
  const liveVideos: TopicUse[] = videos.filter((v) => v.status === "running" && !v.removed).map((v) => ({ topic: v.input.topic, topicId: v.input.topicId, status: v.status }));
  const blocking = (list: TopicUse[]) => (owned ? liveVideos : list);
  const unavailable = topicUnavailable(topic, topicId, blocking(used));
  const score = scoreTopic(topic);
  // Owner dismissed this replaced Hannibal attempt; preserve its saved record and checkpoints.
  const inProduction = workspaceVideos.filter((v) => v.status !== "done" && !v.removed && v.id !== "g0anuaym").slice(0, 5);
  const recent = workspaceVideos.filter((v) => v.status === "done").slice(0, 4);
  const busy = videos.some((v) => v.status === "running");

  const generate = async () => {
    if (!topic.trim()) { toast.error("Pick or type a topic first"); return; }
    if (checking) return;
    setChecking(true);
    try {
      const fresh = await checkHistory();
      if (topicUnavailable(topic, topicId, blocking([...fresh, ...used]))) {
        toast.error("This topic already has a video or is being made. Pick a new topic.");
        return;
      }
      const chosen = selectedFact;
      const exact = format === "short" && ownScript.trim() ? ownScript.trim() : undefined;
      startVideo({ topic: topic.trim(), topicId, ...(chosen ? { topicSource: { url: chosen.source, fact: chosen.fact } } : {}), format, durationSec: exact ? exactDuration(exact) : format === "short" ? shortSec : longMin * 60, archetype: arch, style, voice: "onyx", engine, ...(exact ? { exactScript: exact } : {}) });
      setOwnScript("");
      toast.success("Video generation started — you can keep working.");
      setTopic(""); setTopicId(undefined); setSelectedFact(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check your saved topics. Try again.");
    } finally { setChecking(false); }
  };

  return (
    <Page eyebrow={active?.name ?? "Studio"} title="Create a video" desc="Make a video from a topic, remix a YouTube video, or just write the script. Narration, scenes, sound and editing happen automatically.">
      <div role="tablist" aria-label="How do you want to start?" className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)}
            className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${mode === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${mode === m.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}><m.icon className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block text-sm font-bold">{m.name}</span><span className="block truncate text-xs text-muted-foreground">{m.sub}</span></span>
          </button>
        ))}
      </div>
      {mode === "remix" && <RemixPanel />}
      {mode === "script" && <ScriptWriterPanel />}
      {mode === "topic" && <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          {/* 1. Format */}
          <Panel className="p-5">
            <p className={label}>1 · Format</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                ["short", Smartphone, "Short / Reel", "9:16 vertical · 30–90 sec · viral hook formula"],
                ["long", Film, "Long-form", "16:9 YouTube · 3–15 min documentary"],
              ] as const).map(([f, Icon, name, sub]) => (
                <button key={f} onClick={() => { setFormat(f); setEngine(f === "long" ? "own" : "advanced"); if (f === "long") setStyle("Ink explainer"); }}
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
                ? <input aria-label="Short length in seconds" type="range" min={engine === "advanced" ? 10 : 30} max={90} step={engine === "advanced" ? 1 : 5} value={shortSec} onChange={(e) => setShortSec(+e.target.value)} className="mt-2 w-full accent-primary" />
                : <input type="range" min={3} max={15} step={1} value={longMin} onChange={(e) => setLongMin(+e.target.value)} className="mt-2 w-full accent-primary" />}
            </div>
          </Panel>

          {/* 2. Topic */}
          <Panel className="p-5">
            <TopicFinder used={used} selected={topic} format={format} deployment={settings.scriptDeployment} onSelect={(idea) => { setTopic(idea.title); setTopicId(idea.id); setArch(idea.archetype); setSelectedFact({ ...idea, fact: `${idea.fact}\nVerified evidence: ${idea.sources.map(s => `${s.url}: ${s.quote}`).join('\n')}\nQualifications: ${idea.caveat}` }); }} />
            <label htmlFor="custom-topic" className={`${label} mt-5 block`}>Selected topic / custom topic</label>
            <input id="custom-topic" className={`${input} mt-2`} value={topic} onChange={(e) => { setTopic(e.target.value); setTopicId(undefined); setSelectedFact(undefined); }} placeholder="…or type your own topic" />
            {topic && (
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-muted-foreground">
                <span>Viral score <b className="text-foreground">{score.overall}</b></span>
                <span>Topic tests <b className="text-foreground">{scoreTopic5(topic).total}/25</b>{scoreTopic5(topic).pass ? " ✓" : " (needs 18)"}</span>
                {unavailable && <span className="text-warning">Already made or in production — choose a new topic</span>}
                <span>Curiosity {score.curiosity}</span><span>Visual drama {score.visual}</span><span>Retention {score.retention}</span>
              </div>
            )}
          </Panel>

          {format === "short" && (
            <Panel className="p-5">
              <label htmlFor="own-script" className={label}>Your own script (optional)</label>
              <textarea id="own-script" rows={6} className={`${input} mt-2 h-auto py-2`} value={ownScript} onChange={(e) => setOwnScript(e.target.value)} placeholder="Paste a finished narration to use word for word. Leave empty to have the script written for you." />
              {ownScript.trim() && <p className="mt-2 font-mono text-[11px] text-muted-foreground">{ownScript.trim().split(/\s+/).length} words · about {exactDuration(ownScript)}s · spoken exactly as written</p>}
            </Panel>
          )}

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
            <p className={label}>4 · Video model</p>
            {format === "long" ? (
              <>
                <select id="engine" aria-label="Video model" className={`${input} mt-3`} value={engine} onChange={(e) => setEngine(e.target.value as VideoEngine)}>
                  <option value="own">Own model — AI images with camera motion</option>
                  <option value="cartoon">Own cartoon — 3D cartoon + animated maps on Azure</option>
                </select>
                {engine === "cartoon" && <p className="mt-2 text-xs text-muted-foreground">Long-form cartoon: 16:9 documentary with animated relief maps, glowing territory and marching armies, plus cartoon scenes. You approve a preview before the full render.</p>}
              </>
            ) : (
              <div className="mt-3 rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-bold">Advanced Video AI</p>
                <p className="mt-1 text-xs text-muted-foreground">3D worlds and characters in inked sets, depth of field, VFX, music, ambience and sound effects, word-pop captions and on-screen graphics. Renders on Azure GPUs, retries and repairs itself if a step fails — safe to close your browser.</p>
              </div>
            )}
          </Panel>

          <Button onClick={generate} disabled={checking || unavailable} className={`${btnPrimary} h-auto w-full py-4 text-base`}>
            {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} Generate {format === "short" ? "Short" : "long-form video"}
          </Button>
        </div>

        {/* Right column: live jobs */}
        <div className="min-w-0 space-y-4">
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold">{busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />} In production</h2>
              <span className="font-mono text-xs text-muted-foreground">{inProduction.length} job{inProduction.length === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-4 space-y-3">
              {inProduction.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No videos generating. Your next one will show live progress here.</p>}
              {inProduction.map((v) => <VideoJob key={v.id} v={v} />)}
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
      </div>}
    </Page>
  );
}
