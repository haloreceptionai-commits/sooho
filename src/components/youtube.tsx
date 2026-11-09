import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Youtube, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel, btnDark, btnOutline, btnPrimary, input, label } from "@/components/page";
import { youtubeConnectUrl, youtubeDisconnect, youtubeStartUpload, youtubeStatus } from "@/lib/youtube.functions";
import { getVideoFile } from "@/lib/video-db";
import { actions, useStore, type Video } from "@/lib/store";
import { generateThumbnail, youtubeSetThumbnail } from "@/lib/thumbnail.functions";
import { badgeLayout } from "@/lib/thumbnail-text";
import { supabase } from "@/integrations/supabase/client";

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
  const setThumb_ = useServerFn(youtubeSetThumbnail);
  const short = v.input.format === "short";
  const [title, setTitle] = useState(v.title);
  const [description, setDescription] = useState(v.description ?? "");
  const [tags, setTags] = useState(() => [v.input.topic, short ? "shorts" : "history", "history facts"].filter(Boolean).join(", "));
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("private");
  const [pct, setPct] = useState<number | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

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
      if (thumb) {
        try { await setThumb_({ data: { videoId: id, jpeg: thumb.split(",")[1] ?? "" } }); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Thumbnail upload failed"); }
      }
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
          {!short && <ThumbnailPicker v={v} chosen={thumb} onChoose={setThumb} />}
          <button className={`${btnPrimary} w-full`} disabled={pct !== null || !title.trim()} onClick={() => void publish()}>
            {pct !== null ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {pct}%</> : "Publish"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Draws the clean AI picture at 1280x720 and burns in the exact title + years badges (reference style). */
export async function composeThumbnail(b64: string, labelText: string, years: string): Promise<string> {
  const img = new Image(); img.src = `data:image/jpeg;base64,${b64}`; await img.decode();
  const W = 1280, H = 720, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!; const k = Math.max(W / img.width, H / img.height);
  g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
  const font = (size: number) => `900 ${Math.round(size)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  const measure = (t: string, size: number) => { g.font = font(size); return g.measureText(t).width; };
  for (const b of badgeLayout(labelText, years, W, measure)) {
    g.fillStyle = "#000"; g.fillRect(b.x, b.y, b.w, b.h);
    g.font = font(b.size); g.fillStyle = "#fff"; g.textBaseline = "middle"; g.fillText(b.text, b.x + (b.w - measure(b.text, b.size)) / 2, b.y + b.h / 2 + b.size * 0.04);
  }
  return c.toDataURL("image/jpeg", 0.9);
}

function ThumbnailPicker({ v, chosen, onChoose }: { v: Video; chosen: string | null; onChoose: (d: string) => void }) {
  const gen = useServerFn(generateThumbnail);
  const deployment = useStore((s) => s.settings.imageDeployment);
  const [subject, setSubject] = useState(v.input.topic.slice(0, 80));
  const [labelText, setLabel] = useState(v.input.topic.split(/\s+/).slice(0, 2).join(" ").slice(0, 20));
  const [years, setYears] = useState("");
  const [figure, setFigure] = useState(`the most famous ruler or figure of ${v.input.topic}`.slice(0, 160));
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function make() {
    setBusy(true);
    try {
      const pics = await Promise.all([0, 1].map((variant) => gen({ data: { subject, region: subject, figure, deployment, variant } })));
      const out = await Promise.all(pics.map((p) => composeThumbnail(p.image, labelText, years)));
      setOptions(out); onChoose(out[0]!);
      const { data: u } = await supabase.auth.getUser();
      if (u.user) await Promise.all(out.map((d, i) => fetch(d).then((r) => r.blob()).then((b) => supabase.storage.from("videos").upload(`${u.user!.id}/${v.id}/thumbs/${Date.now()}-${i}.jpg`, b, { contentType: "image/jpeg" }))));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Thumbnail failed"); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-semibold">Thumbnail</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className={label}>Title badge</span><input className={input} maxLength={24} value={labelText} onChange={(e) => setLabel(e.target.value)} placeholder="OTTOMAN" /></label>
        <label className="block"><span className={label}>Years</span><input className={input} maxLength={24} value={years} onChange={(e) => setYears(e.target.value)} placeholder="1299 - 1923" /></label>
      </div>
      <label className="block"><span className={label}>Map territory</span><input className={input} maxLength={80} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="block"><span className={label}>Main figure</span><input className={input} maxLength={160} value={figure} onChange={(e) => setFigure(e.target.value)} /></label>
      <button type="button" className={`${btnOutline} w-full`} disabled={busy || !subject.trim() || !figure.trim()} onClick={() => void make()}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Painting 2 options…</> : options.length ? "Make 2 new options" : "Make 2 thumbnail options"}
      </button>
      {!!options.length && <div className="grid grid-cols-2 gap-2">{options.map((d, i) => (
        <button key={i} type="button" onClick={() => onChoose(d)} className={`overflow-hidden rounded-md border-2 ${chosen === d ? "border-primary" : "border-transparent"}`}><img src={d} alt={`Thumbnail option ${i + 1}`} className="w-full" /></button>
      ))}</div>}
    </div>
  );
}
