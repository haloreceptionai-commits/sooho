import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mic, Play, Square, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { actions, timeAgo, useStore, VOICES } from "@/lib/store";
import { Page, Panel, Empty, StatusPill, btnPrimary, btnOutline, input, label } from "@/components/page";

export const Route = createFileRoute("/voiceovers")({
  head: () => ({
    meta: [
      { title: "Voiceovers — Chronicle Studio" },
      { name: "description", content: "Narration tracks for your videos, generated from scripts." },
      { property: "og:title", content: "Voiceovers — Chronicle Studio" },
      { property: "og:description", content: "Narration tracks for your videos, generated from scripts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoiceoversPage,
});

function VoiceoversPage() {
  const list = useStore((s) => s.voiceovers);
  const scripts = useStore((s) => s.scripts);
  const defVoice = useStore((s) => s.settings.defaultVoice);
  const [scriptId, setScriptId] = useState("");
  const [voice, setVoice] = useState(defVoice);
  const [speed, setSpeed] = useState(1);
  const [text, setText] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);

  const pickScript = (id: string) => {
    setScriptId(id);
    setText(scripts.find((s) => s.id === id)?.body ?? "");
  };

  const preview = (id: string, t: string, rate: number) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return toast.error("Preview not supported in this browser");
    window.speechSynthesis.cancel();
    if (playing === id) return setPlaying(null);
    const u = new SpeechSynthesisUtterance(t.slice(0, 600));
    u.rate = rate;
    u.onend = () => setPlaying(null);
    window.speechSynthesis.speak(u);
    setPlaying(id);
  };

  const create = () => {
    if (!text.trim()) return toast.error("Add narration text or pick a script");
    const sc = scripts.find((s) => s.id === scriptId);
    actions.addVoiceover({ title: sc ? `${sc.title} narration` : text.slice(0, 40), scriptId: scriptId || undefined, voice, speed, text });
    toast.success("Voiceover queued — will generate when Azure TTS is connected");
    setText(""); setScriptId("");
  };

  return (
    <Page eyebrow="Assets" title="Voiceovers" desc="Pick a script and voice. Preview uses your browser's voice; final audio comes from Azure text-to-speech.">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Panel className="h-fit space-y-4 p-5">
          <div>
            <p className={label}>From script</p>
            <select className={`${input} mt-1.5`} value={scriptId} onChange={(e) => pickScript(e.target.value)}>
              <option value="">— Paste text instead —</option>
              {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div>
            <p className={label}>Voice</p>
            <div className="mt-1.5 grid gap-1.5">
              {VOICES.map((v) => (
                <button key={v} onClick={() => setVoice(v)} className={`rounded-md border px-3 py-2 text-left text-sm ${voice === v ? "border-primary bg-primary/5 font-semibold" : "hover:bg-muted"}`}>{v}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between"><p className={label}>Speed</p><span className="font-mono text-xs">{speed.toFixed(2)}×</span></div>
            <input type="range" min={0.7} max={1.3} step={0.05} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="mt-2 w-full accent-primary" />
          </div>
          <textarea className={`${input} resize-y`} rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Narration text…" />
          <div className="flex gap-2">
            <button className={btnOutline} onClick={() => preview("draft", text, speed)} disabled={!text}>{playing === "draft" ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />} Preview</button>
            <button className={`${btnPrimary} flex-1`} onClick={create}><Plus className="h-4 w-4" /> Create voiceover</button>
          </div>
        </Panel>

        {list.length === 0 ? (
          <Empty icon={Mic} title="No voiceovers yet" desc="Create your first narration track on the left." />
        ) : (
          <Panel className="h-fit divide-y">
            {list.map((v) => (
              <div key={v.id} className="flex items-center gap-4 px-5 py-4">
                <button onClick={() => preview(v.id, v.text, v.speed)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground text-background">
                  {playing === v.id ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.title}</p>
                  <p className="text-xs text-muted-foreground">{v.voice} · {v.speed.toFixed(2)}× · {v.text.split(/\s+/).length} words · {timeAgo(v.createdAt)}</p>
                  <div className="mt-2 flex h-5 items-end gap-0.5">
                    {Array.from({ length: 48 }, (_, i) => (
                      <span key={i} className={`w-1 rounded-sm ${playing === v.id ? "bg-primary" : "bg-border"}`} style={{ height: `${20 + Math.abs(Math.sin(i * 1.7 + v.id.length)) * 80}%` }} />
                    ))}
                  </div>
                </div>
                <StatusPill status={v.status} />
                <button className={`${btnOutline} px-2.5`} onClick={() => actions.deleteVoiceover(v.id)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </Page>
  );
}
