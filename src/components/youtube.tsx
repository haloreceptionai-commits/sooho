import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Youtube, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel, btnDark, btnOutline, btnPrimary, input, label } from "@/components/page";
import { youtubeConnectUrl, youtubeDisconnect, youtubeStartUpload, youtubeStatus } from "@/lib/youtube.functions";
import { getVideoFile } from "@/lib/video-db";
import { actions, type Video } from "@/lib/store";

const MESSAGES: Record<string, string> = {
  connected: "YouTube channel connected", cancelled: "YouTube connection cancelled", expired: "Connection link expired — try again",
  "no-refresh": "Google didn't grant lasting access — remove the app at myaccount.google.com/permissions and connect again", failed: "YouTube connection failed",
};

export function YouTubePanel() {
  const status = useServerFn(youtubeStatus), connect = useServerFn(youtubeConnectUrl), disconnect = useServerFn(youtubeDisconnect);
  const [s, setS] = useState<{ connected: boolean; channel: string | null } | null>(null);
  const load = () => void status().then(setS).catch(() => setS({ connected: false, channel: null }));
  useEffect(() => {
    load();
    const r = new URLSearchParams(window.location.search).get("youtube");
    if (r) { (r === "connected" ? toast.success : toast.error)(MESSAGES[r] ?? "YouTube connection failed"); window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  const onSite = typeof window !== "undefined" && window.location.hostname === "sooha.io";
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold"><Youtube className="h-4 w-4" /> YouTube</h2>
      {!s ? <p className="text-sm text-muted-foreground">Checking…</p> : s.connected ? (
        <>
          <p className="text-sm">Connected to <b>{s.channel ?? "your channel"}</b>. Use “Publish” on any finished video.</p>
          <button className={btnOutline} onClick={() => void disconnect().then(load)}>Disconnect</button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Connect your channel to publish videos and Shorts straight from My videos.</p>
          {onSite ? <button className={btnDark} onClick={() => void connect().then((r) => { window.location.href = r.url; })}>Connect YouTube</button>
            : <p className="text-sm text-warning">Open <a className="underline" href="https://sooha.io/settings">sooha.io/settings</a> to connect — Google only allows that address.</p>}
        </>
      )}
    </Panel>
  );
}

export function PublishButton({ v, className }: { v: Video; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className={className ?? btnOutline} onClick={() => setOpen(true)}><Youtube className="h-3.5 w-3.5" /> {v.youtubeId ? "Published" : "Publish"}</button>
    {open && <PublishDialog v={v} onClose={() => setOpen(false)} />}
  </>;
}

function PublishDialog({ v, onClose }: { v: Video; onClose: () => void }) {
  const start = useServerFn(youtubeStartUpload);
  const short = v.input.format === "short";
  const [title, setTitle] = useState(v.title);
  const [description, setDescription] = useState(v.description ?? "");
  const [tags, setTags] = useState(() => [v.input.topic, short ? "shorts" : "history", "history facts"].filter(Boolean).join(", "));
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("private");
  const [pct, setPct] = useState<number | null>(null);

  async function publish() {
    try {
      const blob = await getVideoFile(v.id);
      if (!blob) throw new Error("Video file not found on this device");
      setPct(0);
      const mime = v.mime ?? blob.type ?? "video/mp4";
      const { uploadUrl } = await start({ data: { title, description, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), privacy, short, size: blob.size, mime: mime.split(";")[0] ?? "video/mp4", origin: window.location.origin } });
      const id = await new Promise<string>((res, rej) => {
        const x = new XMLHttpRequest();
        x.open("PUT", uploadUrl);
        x.setRequestHeader("Content-Type", mime.split(";")[0] ?? "video/mp4");
        x.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
        x.onload = () => { if (x.status >= 200 && x.status < 300) { try { res((JSON.parse(x.responseText) as { id: string }).id); } catch { rej(new Error("Unexpected YouTube reply")); } } else rej(new Error(`YouTube upload failed [${x.status}]: ${x.responseText.slice(0, 300)}`)); };
        x.onerror = () => rej(new Error("Upload interrupted — check your connection and try again"));
        x.send(blob);
      });
      actions.updateVideo(v.id, { youtubeId: id });
      toast.success("Published to YouTube", { action: { label: "Open", onClick: () => window.open(short ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`, "_blank") } });
      onClose();
    } catch (e) {
      setPct(null);
      toast.error(e instanceof Error ? e.message : "Publish failed");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && pct === null && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Publish to YouTube{short ? " Shorts" : ""}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block"><span className={label}>Title ({title.length}/100)</span><input className={input} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="block"><span className={label}>Description</span><textarea className={`${input} min-h-28`} maxLength={4900} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className="block"><span className={label}>Tags (comma separated)</span><input className={input} value={tags} onChange={(e) => setTags(e.target.value)} /></label>
          <label className="block"><span className={label}>Visibility</span>
            <select className={input} value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
              <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
            </select>
          </label>
          {short && <p className="text-xs text-muted-foreground">#Shorts is added automatically.</p>}
          <button className={`${btnPrimary} w-full`} disabled={pct !== null || !title.trim()} onClick={() => void publish()}>
            {pct !== null ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {pct}%</> : "Publish"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
