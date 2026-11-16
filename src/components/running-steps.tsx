import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { listRunningSteps, type RunningStep } from '@/lib/step-lock';
import type { Video } from '@/lib/store';

/** Paid steps running right now in any window, so nothing is started twice by accident. */
export function RunningSteps({ videos }: { videos: Video[] }) {
  const [steps, setSteps] = useState<RunningStep[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => void listRunningSteps().then(s => { if (live) setSteps(s); }).catch(() => undefined);
    load(); const t = setInterval(load, 20_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (!steps.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 text-xs">
      <p className="mb-1.5 flex items-center gap-1.5 font-bold"><Activity className="h-3.5 w-3.5 text-primary" /> Running now · paid steps in progress</p>
      <ul className="space-y-1 text-muted-foreground">
        {steps.map(s => (
          <li key={`${s.videoId}-${s.step}`} className="truncate">
            <span className="font-semibold text-foreground">{videos.find(v => v.id === s.videoId)?.title ?? s.videoId}</span>
            {' · '}{s.stage || s.step} · since {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {s.mine ? 'this window' : 'another window'}
          </li>
        ))}
      </ul>
    </div>
  );
}
