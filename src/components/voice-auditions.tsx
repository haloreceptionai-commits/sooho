import { useRef } from "react";
import { Headphones } from "lucide-react";
import { VOICE_TRIALS, VOICE_TRIAL_TEXT } from "@/lib/voice-trials";

export function VoiceAuditions() {
  const players = useRef(new Map<string, HTMLAudioElement>());

  return (
    <section aria-labelledby="voice-auditions-title" className="border-y border-border bg-background py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="voice-auditions-title" className="flex items-center gap-2 text-lg font-bold">
          <Headphones className="h-5 w-5 text-primary" /> Narrator auditions
        </h2>
        <span className="text-xs text-muted-foreground">5 saved samples · Awaiting your choice</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {VOICE_TRIALS.map((trial, i) => (
          <article key={trial.id} className="min-w-0 rounded-lg border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-bold"><span className="mr-2 font-mono text-xs text-muted-foreground">0{i + 1}</span>{trial.name}</h3>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{Math.round(trial.duration)}s</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-primary">{trial.tone}</p>
            <p className="mt-1 text-xs text-muted-foreground">{trial.measuredWpm} words/min · Natural pauses</p>
            <audio
              ref={(el) => { if (el) players.current.set(trial.id, el); else players.current.delete(trial.id); }}
              aria-label={`Play ${trial.name} narrator sample`}
              controls
              preload="metadata"
              src={trial.audioUrl}
              className="mt-3 h-10 w-full min-w-0"
              onPlay={() => {
                players.current.forEach((player, id) => { if (id !== trial.id) player.pause(); });
                // Stop any existing narrator preview before an audition starts.
                document.querySelectorAll<HTMLMediaElement>("audio, video").forEach((player) => {
                  if (player !== players.current.get(trial.id)) player.pause();
                });
              }}
            />
          </article>
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="w-fit cursor-pointer font-semibold text-muted-foreground">Storm Oil · sample script</summary>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">{VOICE_TRIAL_TEXT}</p>
      </details>
    </section>
  );
}