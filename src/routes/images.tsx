import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ImageIcon, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { actions, timeAgo, useStore, STYLES } from "@/lib/store";
import { Page, Panel, Empty, btnPrimary, btnOutline, input, label } from "@/components/page";

export const Route = createFileRoute("/images")({
  head: () => ({
    meta: [
      { title: "Image library — Chronicle Studio" },
      { name: "description", content: "Scene images for your history videos, organised by style." },
      { property: "og:title", content: "Image library — Chronicle Studio" },
      { property: "og:description", content: "Scene images for your history videos, organised by style." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImagesPage,
});

const ASPECT = { "16:9": "aspect-video", "9:16": "aspect-[9/16]", "1:1": "aspect-square" } as const;

function ImagesPage() {
  const images = useStore((s) => s.images);
  const defStyle = useStore((s) => s.settings.defaultStyle);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(defStyle);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [count, setCount] = useState(2);
  const [filter, setFilter] = useState("All");

  const gen = () => {
    if (!prompt.trim()) { toast.error("Describe the scene"); return; }
    actions.addImages(Array.from({ length: count }, () => ({ prompt, style, aspect, hue: Math.floor(Math.random() * 360) })));
    toast.success(`${count} placeholder${count > 1 ? "s" : ""} added — real images arrive once Azure image generation is connected`);
    setPrompt("");
  };
  const shown = images.filter((i) => filter === "All" || i.style === filter);

  return (
    <Page eyebrow="Assets" title="Image library" desc="Scene stills that get animated (pan, zoom, parallax) and stitched into your videos.">
      <Panel className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_200px_160px_120px_auto] lg:items-end">
          <div><p className={label}>Scene prompt</p><input className={`${input} mt-1.5`} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Viking longships emerging from fog, 793 AD" onKeyDown={(e) => e.key === "Enter" && gen()} /></div>
          <div><p className={label}>Style</p><select className={`${input} mt-1.5`} value={style} onChange={(e) => setStyle(e.target.value)}>{STYLES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><p className={label}>Aspect</p><select className={`${input} mt-1.5`} value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)}><option>16:9</option><option>9:16</option><option>1:1</option></select></div>
          <div><p className={label}>Count</p><select className={`${input} mt-1.5`} value={count} onChange={(e) => setCount(+e.target.value)}>{[1, 2, 4].map((n) => <option key={n}>{n}</option>)}</select></div>
          <button className={btnPrimary} onClick={gen}><Sparkles className="h-4 w-4" /> Generate</button>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        {["All", ...STYLES].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === s ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"}`}>{s}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty icon={ImageIcon} title="No images" desc="Generate scene stills above." />
      ) : (
        <div className="columns-2 gap-4 md:columns-3 xl:columns-4">
          {shown.map((img) => (
            <div key={img.id} className="group mb-4 break-inside-avoid overflow-hidden rounded-lg border bg-background">
              <div className={`relative ${ASPECT[img.aspect]}`} style={{ background: `linear-gradient(135deg, oklch(0.75 0.08 ${img.hue}), oklch(0.4 0.06 ${img.hue + 40}))` }}>
                <ImageIcon className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-background/70" />
                <button onClick={() => actions.deleteImage(img.id)} className={`${btnOutline} absolute right-2 top-2 px-2 py-1 opacity-0 group-hover:opacity-100`}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium">{img.prompt}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{img.style} · {img.aspect} · {timeAgo(img.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
