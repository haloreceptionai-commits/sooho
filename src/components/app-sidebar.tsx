import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Sparkles, Clapperboard, Settings, ChevronDown, Menu, X, Cpu, PlaySquare, LogOut, BarChart3, Plus, Loader2, PanelLeftClose, PanelLeftOpen, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createWorkspace, NAME_MAX, setActiveWorkspace, useActiveWorkspace, useWorkspaceVideos, type Workspace } from "@/lib/workspaces";

type To = "/create" | "/videos" | "/settings" | "/analytics";

// A small, stable colour per workspace so channels are easy to tell apart at a glance.
const TINTS = ["bg-primary text-primary-foreground", "bg-accent text-accent-foreground", "bg-success/15 text-success", "bg-warning/15 text-warning", "bg-muted text-foreground"];
const tint = (w: Workspace, i: number) => TINTS[(i + w.name.length) % TINTS.length] ?? TINTS[0];
const initial = (w: Workspace) => (w.name.trim()[0] ?? "W").toUpperCase();

// The nav remembers whether the owner left it as a thin icon rail or a full panel.
const RAIL_KEY = "chronicle-sidebar-rail";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openWorkspaceId, setOpenWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(RAIL_KEY) === "1"); } catch { /* private mode: just start expanded */ }
  }, []);
  const toggleRail = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem(RAIL_KEY, next ? "1" : "0"); } catch { /* private mode: the choice just is not kept */ }
    return next;
  });
  const navigate = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); void navigate({ to: "/auth", replace: true }); };
  const { list, active, ready, error } = useActiveWorkspace();
  const videos = useWorkspaceVideos();
  const running = videos.filter((v) => v.status === "running").length;
  const done = videos.filter((v) => v.status === "done").length;

  const items: { to: To; icon: typeof Sparkles; label: string; badge?: number; live?: boolean }[] = [
    { to: "/create", icon: Sparkles, label: "Create video", badge: running, live: running > 0 },
    { to: "/videos", icon: PlaySquare, label: "My videos", badge: done },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  const pick = (w: Workspace, isMobile: boolean) => {
    setOpenWorkspaceId((id) => id === w.id ? null : w.id);
    setActiveWorkspace(w.id);
    if (collapsed && !isMobile) {
      setCollapsed(false);
      try { localStorage.setItem(RAIL_KEY, "0"); } catch { /* private mode */ }
    }
  };

  const body = (isMobile: boolean) => {
    const c = collapsed && !isMobile;
    const links = (w: Workspace) => (
      <div id={`workspace-links-${isMobile ? "mobile" : "desktop"}-${w.id}`} className={c ? "space-y-1" : "ml-[18px] space-y-0.5 border-l pl-3"}>
        {items.map((it) => (
          <Link key={it.to} to={it.to} onClick={() => { setActiveWorkspace(w.id); setMobileOpen(false); }} activeOptions={{ exact: true }} title={c ? it.label : undefined}
            className={`group relative flex items-center gap-2.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-accent data-[status=active]:font-semibold data-[status=active]:text-accent-foreground ${c ? "justify-center px-0" : "px-2.5"}`}>
            <it.icon className="h-4 w-4 shrink-0" />
            {!c && <span className="flex-1">{it.label}</span>}
            {!c && !!it.badge && (
              <span className={`inline-flex min-w-5 items-center justify-center gap-1 rounded-full px-1.5 font-mono text-[10px] ${it.live ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {it.live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" />}{it.badge}
              </span>
            )}
            {c && it.live && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
          </Link>
        ))}
      </div>
    );
    return (
      <div className="flex h-full flex-col">
        <div className={`flex items-center border-b ${c ? "flex-col gap-1 py-2" : "h-16 justify-between px-4"}`}>
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Clapperboard className="h-4 w-4" /></div>
            {!c && (
              <div className="leading-tight">
                <p className="text-sm font-extrabold tracking-tight">Chronicle Studio</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI video lab</p>
              </div>
            )}
          </Link>
          {isMobile
            ? <button onClick={() => setMobileOpen(false)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
            : <button onClick={toggleRail} aria-label={collapsed ? "Open the workspace panel" : "Close the workspace panel"} title={collapsed ? "Open the workspace panel" : "Close the workspace panel"} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>}
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="Workspaces">
          <Link to="/" activeOptions={{ exact: true }} onClick={() => setMobileOpen(false)} title={c ? "Dashboard" : undefined}
            className={`mb-4 flex items-center gap-2.5 rounded-md py-2 text-sm font-semibold hover:bg-muted data-[status=active]:bg-accent data-[status=active]:text-accent-foreground ${c ? "justify-center" : "px-2.5"}`}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />{!c && "Dashboard"}
          </Link>
          {!c && <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Workspaces</p>}
          {!ready && <p className="px-2 py-3 text-xs text-muted-foreground">Loading workspaces…</p>}
          {ready && error && <p className="px-2 py-3 text-xs text-destructive">{error}</p>}
          <div className="space-y-1">
            {list.map((w, i) => {
              const open = w.id === openWorkspaceId;
              return (
                <div key={w.id}>
                  <Button variant="ghost" onClick={() => pick(w, isMobile)} aria-label={w.name} aria-expanded={open} aria-controls={`workspace-links-${isMobile ? "mobile" : "desktop"}-${w.id}`} title={c ? w.name : undefined}
                    className={`flex h-auto w-full items-center gap-2.5 rounded-md py-2 text-left transition-colors hover:bg-muted ${open ? "bg-muted/60" : ""} ${c ? "justify-center px-0" : "px-2"}`}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold ${tint(w, i)}`}>{initial(w)}</span>
                    {!c && <>
                      <span className={`min-w-0 flex-1 truncate text-sm ${open ? "font-bold" : "font-medium text-muted-foreground"}`}>{w.name}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
                    </>}
                  </Button>
                  {open && <div className="mt-1 pb-2">{links(w)}</div>}
                </div>
              );
            })}
          </div>
          <button onClick={() => setAdding(true)} title={c ? "Add workspace" : undefined}
            className={`mt-2 flex w-full items-center gap-2.5 rounded-md border border-dashed py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary ${c ? "justify-center px-0" : "px-2.5"}`}>
            <Plus className="h-4 w-4 shrink-0" />{!c && "Add workspace"}
          </button>
        </nav>

        <div className="space-y-2 border-t p-3">
          {!c && (
            <Link to="/settings" onClick={() => setMobileOpen(false)} className="block rounded-lg border p-3 hover:bg-muted">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold"><Cpu className="h-3.5 w-3.5" /> Azure OpenAI</span>
                <span className="h-2 w-2 rounded-full bg-success" />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Connected</p>
            </Link>
          )}
          <div className={`flex items-center gap-2 ${c ? "flex-col" : ""}`}>
            <div className={`flex flex-1 items-center gap-2.5 p-1.5 ${c ? "justify-center" : ""}`}>
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">J</div>
              {!c && <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-semibold">James</p><p className="truncate text-[11px] text-muted-foreground">{active?.name ?? "No workspace"}</p></div>}
            </div>
            <button onClick={() => void signOut()} title="Sign out" aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className={`sticky top-0 hidden h-screen shrink-0 border-r bg-background transition-[width] duration-200 md:block ${collapsed ? "w-[72px]" : "w-64"}`}>{body(false)}</aside>
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
        <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-md border" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <span className="font-bold">Chronicle Studio</span>
        {active && <span className="ml-auto max-w-[45%] truncate rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{active.name}</span>}
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r bg-background shadow-xl">{body(true)}</aside>
        </div>
      )}
      <AddWorkspaceDialog open={adding} onClose={() => setAdding(false)} onCreated={() => { setMobileOpen(false); void navigate({ to: "/settings" }); }} />
    </>
  );
}

function AddWorkspaceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const submit = async () => {
    if (busy) return;
    setBusy(true); setProblem("");
    try {
      const ws = await createWorkspace(name);
      toast.success(`Workspace “${ws.name}” created — connect its YouTube channel in Settings.`);
      setName(""); onClose(); onCreated();
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not create the workspace"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) { onClose(); setProblem(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a workspace</DialogTitle>
          <DialogDescription>A workspace has its own videos, analytics and settings, and can be connected to a different YouTube channel or automation.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
          <label htmlFor="workspace-name" className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Workspace name</label>
          <input id="workspace-name" autoFocus maxLength={NAME_MAX} value={name} onChange={(e) => { setName(e.target.value); setProblem(""); }} placeholder="e.g. Space Facts channel"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-md border px-4 text-sm font-semibold hover:bg-muted">Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create workspace
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
