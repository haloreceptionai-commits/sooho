import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, RotateCcw, ShieldCheck } from "lucide-react";
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
          <div className="grid grid-cols-3 gap-3">
            <Field name="Script model"><input className={input} value={f.scriptDeployment} onChange={(e) => set("scriptDeployment", e.target.value)} /></Field>
            <Field name="Voice model"><input className={input} value={f.ttsDeployment} onChange={(e) => set("ttsDeployment", e.target.value)} /></Field>
            <Field name="Image model"><input className={input} value={f.imageDeployment} onChange={(e) => set("imageDeployment", e.target.value)} /></Field>
          </div>
          <p className="flex gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            Your API key is never entered here. It will be stored securely on the server when we connect the APIs.
          </p>
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
