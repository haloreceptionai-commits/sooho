import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Facebook } from "lucide-react";
import { toast } from "sonner";
import { Panel, btnDark, btnOutline, input } from "@/components/page";
import { useActiveWorkspace } from "@/lib/workspaces";
import { facebookConnectUrl, facebookDisconnect, facebookSelectPage, facebookStatus } from "@/lib/facebook.functions";

const MESSAGES: Record<string, string> = {
  connected: "Facebook Page connected", cancelled: "Facebook connection cancelled", expired: "That link expired — try again",
  "no-pages": "No Facebook Pages found — make sure you are an admin and ticked the Page", failed: "Facebook connection failed",
};
type Status = Awaited<ReturnType<typeof facebookStatus>>;

export function FacebookPanel() {
  const status = useServerFn(facebookStatus), connect = useServerFn(facebookConnectUrl), disconnect = useServerFn(facebookDisconnect), select = useServerFn(facebookSelectPage);
  const { id: workspaceId, active } = useActiveWorkspace();
  const [s, setS] = useState<Status | null>(null);
  const load = () => { if (!workspaceId) return; setS(null); void status({ data: { workspaceId } }).then(setS).catch(() => setS({ connected: false })); };
  useEffect(() => {
    load();
    const r = new URLSearchParams(window.location.search).get("facebook");
    if (r) { (r === "connected" ? toast.success : toast.error)(MESSAGES[r] ?? MESSAGES["failed"]); window.history.replaceState(null, "", window.location.pathname); }
  }, [workspaceId]);
  const onSite = typeof window !== "undefined" && window.location.hostname === "sooha.io";
  const n = (v: number) => v.toLocaleString();
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold"><Facebook className="h-4 w-4" /> Facebook Page{active ? <span className="font-normal text-muted-foreground"> · {active.name}</span> : null}</h2>
      {!s ? <p className="text-sm text-muted-foreground">Checking…</p> : s.connected ? (
        <>
          <p className="text-sm">Connected to <b>{s.pageName}</b>.</p>
          {s.stats && <p className="text-sm text-muted-foreground">{n(s.stats.followers)} followers · {n(s.stats.likes)} likes</p>}
          {s.error && <p className="text-sm text-warning">{s.error}</p>}
          {s.pages.length > 1 && (
            <select className={input} value={s.pageId} aria-label="Facebook Page"
              onChange={(e) => void select({ data: { workspaceId: workspaceId!, pageId: e.target.value } }).then(() => { toast.success("Page switched"); load(); }).catch((err) => toast.error(String(err?.message ?? err)))}>
              {s.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className={btnOutline} onClick={() => void disconnect({ data: { workspaceId: workspaceId! } }).then(load)}>Disconnect</button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Connect this workspace's own Facebook Page. Other workspaces can use other Pages.</p>
          {onSite ? <button className={btnDark} disabled={!workspaceId} onClick={() => void connect({ data: { workspaceId: workspaceId! } }).then((r) => { window.location.href = r.url; })}>Connect Facebook Page</button>
            : <p className="text-sm text-warning">Open <a className="underline" href="https://sooha.io/settings">sooha.io/settings</a> to connect — Facebook only allows that address.</p>}
        </>
      )}
    </Panel>
  );
}
