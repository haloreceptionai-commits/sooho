import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Clapperboard, Eye, Volume2, Copy, Zap, Film, Smartphone } from "lucide-react";
import { BEATS, TEMPLATES, buildStory, fmt, sceneLength, type Format } from "@/lib/story-engine";

export const Route = createFileRoute("/story-generator")({
  head: () => ({
    meta: [
      { title: "5-Beat Story Generator — Chronicle Studio" },
      { name: "description", content: "Engineer viral history videos with a 5-beat structure, pacing control and scene-by-scene breakdown." },
      { property: "og:title", content: "5-Beat Story Generator" },
      { property: "og:description", content: "Paradox Hook, Stakes & Foil, False Defeat, Hidden Turn, Catastrophic Payoff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryGenerator,
});

const BEAT_TINT = ["bg-primary", "bg-foreground", "bg-muted-foreground", "bg-warning", "bg-success"];

function StoryGenerator() {
  const [topic, setTopic] = useState("The Fall of Constantinople");
  const [format, setFormat] = useState<Format>("short");
  const [duration, setDuration] = useState(60);
  const [pacing, setPacing] = useState(60);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const template = TEMPLATES.find((t) => t.id === templateId)!;

  const plan = useMemo(
    () => buildStory({ topic, format, duration, pacing, template }),
    [topic, format, duration, pacing, template],
  );
  const sceneCount = plan.reduce((n, b) => n + b.scenes.length, 0);
  const pacingLabel = pacing < 33 ? "Cinematic" : pacing < 66 ? "Balanced" : "Rapid-fire";

  const switchFormat = (f: Format) => {
    setFormat(f);
    setDuration(f === "short" ? 60 : 900);
  };

  const copyScript = () => {
    const text = plan
      .map((b) => `## ${b.name} (${fmt(b.start)}–${fmt(b.end)})\n` +
        b.scenes.map((s) => `[${fmt(s.start)}] ${s.narration}\n  VISUAL: ${s.visual}\n  SFX: ${s.sfx}`).join("\n"))
      .join("\n\n");
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-16 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="grid h-9 w-9 place-items-center rounded-md border text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground"><Clapperboard className="h-4 w-4" /></div>
          <span className="font-bold tracking-tight">5-Beat Story Generator</span>
        </div>
        <button onClick={copyScript} className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background">
          <Copy className="h-4 w-4" /> Copy script
        </button>
      </header>

      <main className="bg-grid min-h-[calc(100vh-4rem)] p-6 lg:p-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[380px_1fr]">
          {/* Controls */}
          <div className="space-y-6">
            <section className="rounded-lg border bg-background p-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Topic</label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)}
                className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />

              <div className="mt-4 grid grid-cols-2 gap-2">
                {([["short", "Short 9:16", Smartphone], ["long", "Long-form 16:9", Film]] as const).map(([f, label, Icon]) => (
                  <button key={f} onClick={() => switchFormat(f)}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${format === f ? "border-foreground bg-foreground text-background" : "text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>

              <div className="mt-5">
                <div className="flex justify-between text-sm"><span className="font-semibold">Duration</span><span className="font-mono">{fmt(duration)}</span></div>
                <input type="range" className="mt-2 w-full accent-primary"
                  min={format === "short" ? 15 : 300} max={format === "short" ? 90 : 1800} step={format === "short" ? 5 : 60}
                  value={duration} onChange={(e) => setDuration(+e.target.value)} />
              </div>

              <div className="mt-5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">Pacing</span>
                  <span className="inline-flex items-center gap-1 font-mono text-primary"><Zap className="h-3.5 w-3.5" />{pacingLabel}</span>
                </div>
                <input type="range" min={0} max={100} value={pacing} onChange={(e) => setPacing(+e.target.value)} className="mt-2 w-full accent-primary" />
                <div className="flex justify-between text-[11px] text-muted-foreground"><span>Cinematic</span><span>Rapid-fire</span></div>
                <p className="mt-2 text-xs text-muted-foreground">
                  ≈ {sceneLength(format, pacing).toFixed(1)}s per cut · {sceneCount} scenes total
                </p>
              </div>
            </section>

            <section className="rounded-lg border bg-background p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Viral templates</h2>
              <div className="mt-3 space-y-2">
                {TEMPLATES.map((t) => (
                  <button key={t.id} onClick={() => setTemplateId(t.id)}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${t.id === templateId ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.tagline}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Preview */}
          <div className="space-y-6">
            <section className="rounded-lg border bg-background p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Retention timeline</h2>
                <span className="font-mono text-xs text-muted-foreground">0:00 → {fmt(duration)}</span>
              </div>
              <div className="mt-4 flex h-10 overflow-hidden rounded-md border">
                {plan.map((b, i) => (
                  <div key={b.key} style={{ width: `${((b.end - b.start) / duration) * 100}%` }}
                    className={`${BEAT_TINT[i]} flex items-center justify-center border-r border-background text-[10px] font-bold text-background last:border-0`}>
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {plan.map((b, i) => (
                  <div key={b.key} className="text-xs">
                    <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${BEAT_TINT[i]}`} /><span className="font-semibold">{b.name}</span></div>
                    <p className="font-mono text-muted-foreground">{fmt(b.start)}–{fmt(b.end)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Style anchor:</span> {template.style}
              </p>
            </section>

            {plan.map((b, i) => (
              <section key={b.key} className="rounded-lg border bg-background">
                <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold text-background ${BEAT_TINT[i]}`}>{i + 1}</span>
                    <div>
                      <h3 className="font-bold">{b.name}</h3>
                      <p className="text-xs text-muted-foreground">{BEATS[i].purpose}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmt(b.start)}–{fmt(b.end)} · {b.scenes.length} scenes</span>
                </div>
                <ul className="divide-y">
                  {b.scenes.map((s) => (
                    <li key={s.index} className="grid gap-3 px-5 py-3 text-sm md:grid-cols-[90px_1fr_1fr]">
                      <div className="font-mono text-xs">
                        <p className="font-semibold">S{s.index.toString().padStart(2, "0")}</p>
                        <p className="text-muted-foreground">{fmt(s.start)}–{fmt(s.end)}</p>
                      </div>
                      <p className={s.narration.startsWith("[") ? "text-muted-foreground italic" : "font-medium"}>{s.narration}</p>
                      <div className="space-y-1 text-xs">
                        <p className="flex gap-1.5"><Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{s.visual}</p>
                        <p className="flex gap-1.5 text-primary"><Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{s.sfx}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
