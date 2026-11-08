import { FileText, Mic, ImageIcon, Clapperboard, Check, RotateCcw, AlertTriangle, X } from "lucide-react";
import { actions, type Video } from "@/lib/store";
import { runVideo, removeFromQueue } from "@/lib/pipeline";
import { btnOutline } from "@/components/page";
import { Button } from "@/components/ui/button";
import { CartoonReviewPanel } from '@/components/cartoon-review';
import { recoverCartoonReview } from '@/lib/cartoon.functions';
import { useServerFn } from '@tanstack/react-start';
import { syncFromCloud } from '@/lib/store';
import { toast } from 'sonner';

const STAGES = [
  { key: "script", label: "Script", icon: FileText },
  { key: "voice", label: "Voice", icon: Mic },
  { key: "images", label: "Scenes", icon: ImageIcon },
  { key: "render", label: "Render", icon: Clapperboard },
] as const;
const ORDER = ["script", "voice", "images", "render", "saving", "done"];

export function VideoJob({ v }: { v: Video }) {
  const recover = useServerFn(recoverCartoonReview);
  const cur = ORDER.indexOf(v.stage);
  const failed = v.status === "failed";
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start gap-3">
        <div className={`h-14 shrink-0 overflow-hidden rounded-md border bg-muted ${v.input.format === "short" ? "w-9" : "w-24"}`}>
          {v.thumb && <img src={v.thumb} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{v.title}</p>
          <p className="text-xs text-muted-foreground">{v.input.format === "long" ? "Long-form 16:9" : "Short 9:16"} · {v.detail}</p>
        </div>
        <span className="font-mono text-sm font-bold">{v.progress}%</span>
        <button
          aria-label="Remove from queue"
          title="Remove from queue"
          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => { if (window.confirm(`Remove "${v.title}" from the queue? It will stop being made.`)) removeFromQueue(v.id); }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-500 ${failed ? "bg-destructive" : "bg-primary"}`} style={{ width: `${v.progress}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {STAGES.map((s, i) => {
          const done = cur > i || v.status === "done";
          const active = cur === i && !failed;
          return (
            <div key={s.key} className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold ${done ? "border-success/30 bg-success/10 text-success" : active ? "border-primary/40 bg-primary/5 text-primary" : "text-muted-foreground"}`}>
              {done ? <Check className="h-3 w-3" /> : <s.icon className={`h-3 w-3 ${active ? "animate-pulse" : ""}`} />} {s.label}
            </div>
          );
        })}
      </div>
      {failed && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="flex-1 break-words">{v.error}</p>
          {!v.hostedRender && <Button className={`${btnOutline} px-2 py-1 text-xs`} onClick={() => void runVideo(v.id, v.input)}><RotateCcw className="h-3 w-3" /> {v.seedanceCheckpoint || v.assemblyCheckpoint ? "Resume" : "Retry"}</Button>}
          {v.input.engine === 'cartoon' && ['Cloud callback unavailable', 'Owner review does not match locked inputs'].includes(v.error ?? '') && <Button className={`${btnOutline} px-2 py-1 text-xs`} onClick={() => { void recover({ data: { videoId: v.id } }).then(() => syncFromCloud()).catch(e => toast.error(e instanceof Error ? e.message : 'Could not recover preview')); }}><RotateCcw className="h-3 w-3" /> Recover preview</Button>}
        </div>
      )}
      <CartoonReviewPanel video={v} />
    </div>
  );
}
