import type { ReactNode } from "react";
import { CheckCircle2, Loader2, Clock, CircleDashed, XCircle } from "lucide-react";

export function Page({ eyebrow, title, desc, actions, children }: { eyebrow?: string; title: string; desc?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="bg-grid min-h-screen p-6 pt-20 md:pt-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow && <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</p>}
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h1>
            {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </main>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border bg-background ${className}`}>{children}</section>;
}

export function Empty({ icon: Icon, title, desc, action }: { icon: typeof Clock; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-background px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted"><Icon className="h-5 w-5 text-muted-foreground" /></div>
      <p className="mt-4 font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const ST = {
  done: { label: "Ready", cls: "text-success bg-success/10", Icon: CheckCircle2 },
  ready: { label: "Ready", cls: "text-success bg-success/10", Icon: CheckCircle2 },
  rendering: { label: "Rendering", cls: "text-primary bg-primary/10", Icon: Loader2 },
  queued: { label: "Queued", cls: "text-warning bg-warning/15", Icon: Clock },
  pending: { label: "Awaiting API", cls: "text-warning bg-warning/15", Icon: Clock },
  draft: { label: "Draft", cls: "text-muted-foreground bg-muted", Icon: CircleDashed },
  failed: { label: "Failed", cls: "text-destructive bg-destructive/10", Icon: XCircle },
} as const;

export function StatusPill({ status }: { status: keyof typeof ST }) {
  const s = ST[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      <s.Icon className={`h-3 w-3 ${status === "rendering" ? "animate-spin" : ""}`} /> {s.label}
    </span>
  );
}

export const btn = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50";
export const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
export const btnDark = `${btn} bg-foreground text-background hover:opacity-90`;
export const btnOutline = `${btn} border bg-background hover:bg-muted`;
export const input = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";
export const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
