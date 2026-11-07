import { useMemo, useState } from "react";
import { Brain, Check, X, Wand2, Volume2, Mic } from "lucide-react";
import { analyzeScript, extractSfx, PACING_MIN, PACING_MAX } from "@/lib/viral-brain";
import { Panel, btnPrimary } from "@/components/page";

function Bar({ v }: { v: number }) {
  const tone = v >= 70 ? "bg-success" : v >= 40 ? "bg-warning" : "bg-destructive";
  return <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone}`} style={{ width: `${v}%` }} /></div>;
}

export function ScoreRing({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  const tone = value >= 70 ? "var(--success)" : value >= 40 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={5} strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-extrabold">{value}</span>
    </div>
  );
}

export function PacingMeter({ words }: { words: number }) {
  const max = 260;
  const status = words < PACING_MIN ? "Too short" : words > PACING_MAX ? "Too long" : "Ideal";
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="font-semibold">Pacing · 60s target</span><span className="font-mono">{words} words · {status}</span></div>
      <div className="relative mt-2 h-2.5 rounded-full bg-muted">
        <div className="absolute inset-y-0 rounded-full bg-success/25" style={{ left: `${(PACING_MIN / max) * 100}%`, width: `${((PACING_MAX - PACING_MIN) / max) * 100}%` }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${status === "Ideal" ? "bg-success" : "bg-warning"}`} style={{ width: `${Math.min(100, (words / max) * 100)}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>0</span><span>{PACING_MIN}–{PACING_MAX}</span><span>{max}+</span></div>
    </div>
  );
}

/** Live Viral Brain analysis for any script. Used on Scripts, Story Generator and Viral Brain pages. */
export function ScriptIntelligence({ text, onOptimize, compact = false }: { text: string; onOptimize?: () => void; compact?: boolean }) {
  const a = useMemo(() => analyzeScript(text), [text]);
  const sfx = useMemo(() => extractSfx(text), [text]);
  const [tab, setTab] = useState<"score" | "sfx">("score");
  const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-center gap-2 text-xs">{ok ? <Check className="h-3.5 w-3.5 text-success" /> : <X className="h-3.5 w-3.5 text-destructive" />}{children}</li>
  );

  return (
    <Panel className="p-5">
      <div className="flex items-center gap-4">
        <ScoreRing value={a.overall} />
        <div className="flex-1">
          <p className="flex items-center gap-1.5 font-bold"><Brain className="h-4 w-4 text-primary" /> Viral Brain score</p>
          <p className="text-xs text-muted-foreground">Checked against the 5-beat high-tension Shorts formula.</p>
        </div>
        {onOptimize && <button className={btnPrimary} onClick={onOptimize}><Wand2 className="h-4 w-4" /> Optimize with Viral Brain</button>}
      </div>

      <div className="mt-4"><PacingMeter words={a.words} /></div>

      <div className="mt-4 flex rounded-md border p-0.5 text-xs font-semibold">
        {(["score", "sfx"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded px-3 py-1.5 ${tab === t ? "bg-foreground text-background" : "text-muted-foreground"}`}>
            {t === "score" ? "Formula check" : `SFX cues (${sfx.hits.length})`}
          </button>
        ))}
      </div>

      {tab === "score" ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center gap-3"><span className="w-44 text-xs font-semibold">0:00 In-Media-Res Hook</span><Bar v={a.hook.score} /><span className="w-8 text-right font-mono text-xs">{a.hook.score}</span></div>
            <ul className="mt-2 space-y-1 pl-1">
              <Row ok={a.hook.underLimit}>Under 12 words ({a.hook.words})</Row>
              <Row ok={a.hook.noFluff}>Zero greetings / fluff</Row>
              <Row ok={a.hook.sensory}>Immediate sensory action</Row>
            </ul>
          </div>
          {a.beats.map((b) => (
            <div key={b.key}>
              <div className="flex items-center gap-3"><span className="w-44 text-xs font-semibold">{b.name}</span><Bar v={b.score} /><span className="w-8 text-right font-mono text-xs">{b.score}</span></div>
              {!compact && b.found.length > 0 && <p className="mt-1 pl-1 font-mono text-[10px] text-muted-foreground">found: {b.found.slice(0, 5).join(", ")}</p>}
            </div>
          ))}
          {a.tips.length > 0 && (
            <ul className="space-y-1.5 rounded-md bg-accent p-3 text-xs text-accent-foreground">
              {a.tips.slice(0, compact ? 3 : 8).map((t) => <li key={t}>• {t}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="max-h-56 overflow-y-auto rounded-md border p-3 text-sm leading-relaxed">
            {sfx.tokens.map((t, i) => t.cue
              ? <mark key={i} title={t.cue} className="rounded bg-primary/15 px-0.5 font-semibold text-primary">{t.text}</mark>
              : <span key={i}>{t.text}</span>)}
          </p>
          <ul className="divide-y rounded-md border">
            {sfx.hits.length === 0 && <li className="p-3 text-xs text-muted-foreground">No impact words yet — add verbs like snapped, creaked, sank.</li>}
            {sfx.hits.map((h) => (
              <li key={h.index} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="w-10 font-mono text-muted-foreground">{h.time.toFixed(1)}s</span>
                <span className="flex-1 font-semibold">“{h.word}”</span>
                <span className="inline-flex items-center gap-1 text-primary"><Volume2 className="h-3 w-3" />{h.cue}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Mic className="h-3 w-3" /> Timings assume Azure Onyx at ~205 wpm.</p>
        </div>
      )}
    </Panel>
  );
}
