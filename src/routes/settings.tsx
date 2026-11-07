import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, RotateCcw, KeyRound, Brain, Mic, ImageIcon, Clapperboard } from "lucide-react";

const MODELS = [
  { key: "scriptDeployment", name: "Script & Viral Brain", role: "Writes scripts, brainstorms topics, optimizes hooks", icon: Brain },
  { key: "ttsDeployment", name: "Voice & Narration", role: "Onyx narration with suspense pauses", icon: Mic },
  { key: "imageDeployment", name: "Image Generation", role: "Scene stills in your visual style", icon: ImageIcon },
  { key: "videoDeployment", name: "Video Assembly & Automation", role: "Builds the stitching / render steps", icon: Clapperboard },
] as const;
import { toast } from "sonner";
import { actions, useStore, VOICES, STYLES, type Settings } from "@/lib/store";
import { Page, Panel, btnDark, btnOutline, input, label } from "@/components/page";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Chronicle Studio" },
      { name: "description", content: "Channel, Azure OpenAI and render settings." },
      { property: "og:title", content: "Settings — Chronicle Studio" },
      { property: "og:description", content: "Channel, Azure OpenAI and render settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Field({ name, children, hint }: { name: string; children: React.ReactNode; hint?: string }) {
  return <div><p className={label}>{name}</p><div className="mt-1.5">{children}</div>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</div>;
}

function SettingsPage() {
  const saved = useStore((s) => s.settings);
  const [f, setF] = useState<Settings>(saved);
  useEffect(() => setF(saved), [saved]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Page eyebrow="System" title="Settings"
      actions={<><button className={btnOutline} onClick={() => { if (confirm("Reset all projects, scripts and settings to the sample data?")) { actions.resetAll(); toast("Workspace reset"); } }}><RotateCcw className="h-4 w-4" /> Reset sample data</button>
        <button className={btnDark} onClick={() => { actions.saveSettings(f); toast.success("Settings saved"); }}><Save className="h-4 w-4" /> Save changes</button></>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="space-y-4 p-5">
          <h2 className="font-bold">Channel</h2>
          <Field name="Channel name"><input className={input} value={f.channelName} onChange={(e) => set("channelName", e.target.value)} /></Field>
          <Field name="Default voice"><select className={input} value={f.defaultVoice} onChange={(e) => set("defaultVoice", e.target.value)}>{VOICES.map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field name="Default visual style"><select className={input} value={f.defaultStyle} onChange={(e) => set("defaultStyle", e.target.value)}>{STYLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
        </Panel>

        <Panel className="space-y-4 p-5">
          <h2 className="font-bold">Azure OpenAI</h2>
          <Field name="Endpoint" hint="e.g. https://your-resource.openai.azure.com"><input className={input} value={f.azureEndpoint} onChange={(e) => set("azureEndpoint", e.target.value)} placeholder="https://…openai.azure.com" /></Field>
          <Field name="API key" hint="Stored server-side only — never saved in your browser or the app code.">
            <div className="flex items-center gap-2">
              <input className={input} type="password" disabled value="" placeholder="Saved securely when the backend is connected" />
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-xs font-semibold text-warning"><KeyRound className="h-3 w-3" /> Not set</span>
            </div>
          </Field>
          <div>
            <p className={label}>Model deployments</p>
            <ul className="mt-2 divide-y rounded-md border">
              {MODELS.map((m) => (
                <li key={m.key} className="grid items-center gap-3 px-3 py-3 sm:grid-cols-[1fr_200px]">
                  <div className="flex items-start gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border"><m.icon className="h-4 w-4" /></div>
                    <div><p className="text-sm font-semibold">{m.name}</p><p className="text-xs text-muted-foreground">{m.role}</p></div>
                  </div>
                  <input className={`${input} font-mono`} value={f[m.key]} onChange={(e) => set(m.key, e.target.value)} aria-label={`${m.name} deployment`} />
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel className="space-y-4 p-5 lg:col-span-2">
          <h2 className="font-bold">Render output</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="Long-form resolution"><select className={input} value={f.longResolution} onChange={(e) => set("longResolution", e.target.value)}><option>1920x1080</option><option>2560x1440</option><option>3840x2160</option></select></Field>
            <Field name="Shorts resolution"><select className={input} value={f.shortResolution} onChange={(e) => set("shortResolution", e.target.value)}><option>1080x1920</option><option>720x1280</option></select></Field>
            <Field name="Captions">
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" className="accent-primary" checked={f.burnCaptions} onChange={(e) => set("burnCaptions", e.target.checked)} /> Burn-in animated captions
              </label>
            </Field>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
