import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Sparkles, Clapperboard, Settings, ChevronsLeft, ChevronsRight, Menu, X, Cpu, PlaySquare, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";

type To = "/" | "/videos" | "/settings";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); void navigate({ to: "/auth", replace: true }); };
  const videos = useStore((s) => s.videos);
  const channel = useStore((s) => s.settings.channelName);
  const running = videos.filter((v) => v.status === "running").length;
  const done = videos.filter((v) => v.status === "done").length;

  const items: { to: To; icon: typeof Sparkles; label: string; badge?: number; live?: boolean }[] = [
    { to: "/", icon: Sparkles, label: "Create video", badge: running, live: running > 0 },
    { to: "/videos", icon: PlaySquare, label: "My videos", badge: done },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  const body = (isMobile: boolean) => {
    const c = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col">
        <div className={`flex h-16 items-center border-b ${c ? "justify-center" : "justify-between px-4"}`}>
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Clapperboard className="h-4 w-4" /></div>
            {!c && (
              <div className="leading-tight">
                <p className="text-sm font-extrabold tracking-tight">Chronicle Studio</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI video lab</p>
              </div>
            )}
          </Link>
          {isMobile && <button onClick={() => setMobileOpen(false)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>}
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map((it) => (
            <Link key={it.to} to={it.to} onClick={() => setMobileOpen(false)} activeOptions={{ exact: it.to === "/" }} title={c ? it.label : undefined}
              className={`group relative flex items-center gap-3 rounded-md py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-accent data-[status=active]:font-semibold data-[status=active]:text-accent-foreground ${c ? "justify-center px-0" : "px-3"}`}>
              <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary opacity-0 transition-opacity group-data-[status=active]:opacity-100" />
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
              {!c && <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-semibold">James</p><p className="truncate text-[11px] text-muted-foreground">{channel}</p></div>}
            </div>
            <button onClick={() => void signOut()} title="Sign out" aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="h-4 w-4" /></button>
            {!isMobile && (
              <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand" : "Collapse"} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className={`sticky top-0 hidden h-screen shrink-0 border-r bg-background transition-[width] duration-200 md:block ${collapsed ? "w-[72px]" : "w-60"}`}>{body(false)}</aside>
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
        <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-md border" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <span className="font-bold">Chronicle Studio</span>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r bg-background shadow-xl">{body(true)}</aside>
        </div>
      )}
    </>
  );
}
