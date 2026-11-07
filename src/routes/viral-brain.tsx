import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Brain, Lightbulb, FileSearch, Mic, Plus, Shuffle, Copy, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { actions } from "@/lib/store";
import { ARCHETYPES, ONYX_GUIDE, optimizeScript, scoreTopic, toVoiceText, type ArchetypeId } from "@/lib/viral-brain";
import { Page, Panel, btnPrimary, btnOutline, btnDark, input, label } from "@/components/page";
import { ScriptIntelligence, ScoreRing } from "@/components/script-intelligence";

export const Route = createFileRoute("/viral-brain")({
  head: () => ({
    meta: [
      { title: "Viral Brain — Chronicle Studio" },
      { name: "description", content: "Script intelligence engine: viral topic brainstormer, script analyzer and voice & foley director." },
      { property: "og:title", content: "Viral Brain — Script Intelligence Engine" },
      { property: "og:description", content: "Score topics, analyze scripts against a proven Shorts formula and extract SFX cues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ViralBrain,
});

const SAMPLE = "Railroad tracks have small gaps between each rail. These gaps exist because steel expands when it gets hot. Without them, the rails would bend in the summer.";

function Meter({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-20 text-muted-foreground">{k}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} /></div>
      <span className="w-6 text-right font-mono">{v}</span>
    </div>
  );
}

function ViralBrain() {
  const [tab, setTab] = useState<"brainstorm" | "analyze" | "voice">("brainstorm");
  const [arch, setArch] = useState<ArchetypeId | "all">("all");
  const [custom, setCustom] = useState("");
  const [seed, setSeed] = useState(0);
  const [script, setScript] = useState(SAMPLE);
  const [speaking, setSpeaking] = useState(false);
  const navigate = useNavigate();

  const ideas = useMemo(() => {
    const list = ARCHETYPES.filter((a) => arch === "all" || a.id === arch).flatMap((a) => a.topics.map((t) => ({ t, a })));
    const rot = seed % Math.max(1, list.length);
    return [...list.slice(rot), ...list.slice(0, rot)].map((x) => ({ ...x, s: scoreTopic(x.t) })).sort((a, b) => b.s.overall - a.s.overall);
  }, [arch, seed]);
  const customScore = scoreTopic(custom);

  const toScript = (title: string) => {
    actions.saveScript({ title, body: optimizeScript("", title) });
    toast.success("Draft script created");
    navigate({ to: "/scripts" });
  };
  const voiceText = toVoiceText(script);
  const speak = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(voiceText);
    u.rate = ONYX_GUIDE.speed; u.pitch = 0.7; u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u); setSpeaking(true);
  };

  const tabs = [
    { id: "brainstorm", label: "Topic Brainstormer", icon: Lightbulb },
    { id: "analyze", label: "Script Analyzer", icon: FileSearch },
    { id: "voice", label: "Voice & Foley", icon: Mic },
  ] as const;

  return (
    <Page eyebrow="Script intelligence engine" title="Viral Brain"
      desc="Built from patterns in top history Shorts (7.8M+ avg views): engineering paradoxes, historical exploits, ordinary objects and high-stakes experiments.">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold ${tab === t.id ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "brainstorm" && (
        <>
          <Panel className="p-5">
            <p className={label}>Score your own topic live</p>
            <div className="mt-2 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <input className={input} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Why Lighthouses Were Painted Black And White" />
              <div className="flex items-center gap-4">
                <ScoreRing value={custom ? customScore.overall : 0} size={56} />
                <div className="w-56 space-y-1">
                  <Meter k="Curiosity gap" v={custom ? customScore.curiosity : 0} />
                  <Meter k="Visual drama" v={custom ? customScore.visual : 0} />
                  <Meter k="Retention" v={custom ? customScore.retention : 0} />
                </div>
                <button className={btnDark} disabled={!custom.trim()} onClick={() => toScript(custom)}><Plus className="h-4 w-4" /> Draft</button>
              </div>
            </div>
          </Panel>

          <div className="flex flex-wrap items-center gap-2">
            {[{ id: "all" as const, name: "All archetypes" }, ...ARCHETYPES].map((a) => (
              <button key={a.id} onClick={() => setArch(a.id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${arch === a.id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{a.name}</button>
            ))}
            <button className={`${btnOutline} ml-auto px-3 py-1.5 text-xs`} onClick={() => setSeed((s) => s + 3)}><Shuffle className="h-3.5 w-3.5" /> Shuffle</button>
          </div>

          {arch !== "all" && (() => { const a = ARCHETYPES.find((x) => x.id === arch)!; return (
            <p className="rounded-md border bg-background px-4 py-3 text-sm"><span className="font-bold">{a.name}:</span> {a.formula}. <span className="text-muted-foreground">Proven example: “{a.example}”.</span></p>
          ); })()}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ideas.map(({ t, a, s }) => (
              <Panel key={t} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-primary">{a.name}</p>
                    <p className="mt-1 font-bold leading-snug">{t}</p>
                  </div>
                  <ScoreRing value={s.overall} size={48} />
                </div>
                <div className="mt-3 space-y-1">
                  <Meter k="Curiosity gap" v={s.curiosity} />
                  <Meter k="Visual drama" v={s.visual} />
                  <Meter k="Retention" v={s.retention} />
                </div>
                <div className="mt-4 flex gap-2">
                  <button className={`${btnOutline} flex-1 text-xs`} onClick={() => { setScript(optimizeScript("", t)); setTab("analyze"); }}>Analyze draft</button>
                  <button className={`${btnPrimary} flex-1 text-xs`} onClick={() => toScript(t)}><Plus className="h-3.5 w-3.5" /> Create script</button>
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}

      {tab === "analyze" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
          <Panel className="p-5">
            <p className={label}>Paste any script or flat facts</p>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={20} className={`${input} mt-2 resize-y font-mono leading-relaxed`} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={btnOutline} onClick={() => { navigator.clipboard?.writeText(script); toast("Copied"); }}><Copy className="h-4 w-4" /> Copy</button>
              <button className={btnDark} onClick={() => { actions.saveScript({ title: script.split(/\s+/).slice(0, 6).join(" ").replace(/\[[^\]]*\]/g, "").trim() || "Viral Brain script", body: script }); toast.success("Saved to Scripts"); }}>Save to Scripts</button>
            </div>
          </Panel>
          <ScriptIntelligence text={script} onOptimize={() => { setScript(optimizeScript(script)); toast.success("Rewritten into the 5-beat tension formula"); }} />
        </div>
      )}

      {tab === "voice" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-foreground text-background"><Mic className="h-4 w-4" /></div>
              <div><p className="font-bold">Azure Onyx — style guide</p><p className="font-mono text-xs text-muted-foreground">voice: {ONYX_GUIDE.voice} · speed {ONYX_GUIDE.speed}×</p></div>
            </div>
            <ul className="mt-4 divide-y rounded-md border">
              {ONYX_GUIDE.rules.map((r) => (
                <li key={r.label} className="grid grid-cols-[110px_1fr] gap-3 px-3 py-2.5 text-sm"><span className="font-semibold">{r.label}</span><span className="text-muted-foreground">{r.text}</span></li>
              ))}
            </ul>
            <p className={`${label} mt-5`}>Voice-ready text (pauses inserted)</p>
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed">{voiceText}</pre>
            <div className="mt-3 flex gap-2">
              <button className={btnOutline} onClick={speak}>{speaking ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />} Rough preview</button>
              <button className={btnOutline} onClick={() => { navigator.clipboard?.writeText(voiceText); toast("Voice text copied"); }}><Copy className="h-4 w-4" /> Copy</button>
            </div>
          </Panel>
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><Brain className="h-4 w-4 text-primary" /> Foley cues from the current script</p>
            <ScriptIntelligence text={script} />
          </div>
        </div>
      )}
    </Page>
  );
}
