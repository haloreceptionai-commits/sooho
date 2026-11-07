import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Plus, Trash2, Save, Mic } from "lucide-react";
import { toast } from "sonner";
import { actions, timeAgo, useStore, VOICES } from "@/lib/store";
import { Page, Panel, Empty, btnPrimary, btnOutline, btnDark, input, label } from "@/components/page";

export const Route = createFileRoute("/scripts")({
  head: () => ({
    meta: [
      { title: "Scripts — Chronicle Studio" },
      { name: "description", content: "Write and edit narration scripts for your history videos." },
      { property: "og:title", content: "Scripts — Chronicle Studio" },
      { property: "og:description", content: "Write and edit narration scripts for your history videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScriptsPage,
});

function ScriptsPage() {
  const scripts = useStore((s) => s.scripts);
  const projects = useStore((s) => s.projects);
  const defaultVoice = useStore((s) => s.settings.defaultVoice);
  const [sel, setSel] = useState<string | null>(null);
  const current = scripts.find((s) => s.id === sel) ?? null;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!sel && scripts[0]) setSel(scripts[0].id);
  }, [sel, scripts]);
  useEffect(() => {
    setTitle(current?.title ?? ""); setBody(current?.body ?? ""); setProjectId(current?.projectId ?? "");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const mins = words / 150;

  const save = () => {
    const id = actions.saveScript({ id: current?.id, title: title || "Untitled script", body, projectId: projectId || undefined });
    setSel(id); toast.success("Script saved");
  };
  const newScript = () => {
    const id = actions.saveScript({ title: "Untitled script", body: "" });
    setSel(id);
  };

  return (
    <Page eyebrow="Assets" title="Scripts" desc="Narration scripts. Azure OpenAI will draft these once connected — you can write or paste them now."
      actions={<button className={btnPrimary} onClick={newScript}><Plus className="h-4 w-4" /> New script</button>}>
      {scripts.length === 0 ? (
        <Empty icon={FileText} title="No scripts yet" desc="Create one here or save one from the Story Generator." action={<button className={btnPrimary} onClick={newScript}>New script</button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Panel className="h-fit divide-y">
            {scripts.map((s) => (
              <button key={s.id} onClick={() => setSel(s.id)} className={`block w-full px-4 py-3 text-left ${s.id === sel ? "bg-accent" : "hover:bg-muted"}`}>
                <p className="truncate text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.body.split(/\s+/).filter(Boolean).length} words · {timeAgo(s.updatedAt)}</p>
              </button>
            ))}
          </Panel>
          {current && (
            <Panel className="p-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
                <div><p className={label}>Title</p><input className={`${input} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                <div>
                  <p className={label}>Linked project</p>
                  <select className={`${input} mt-1.5`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">None</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} placeholder="Write your narration…"
                className={`${input} mt-4 resize-y font-mono leading-relaxed`} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-xs text-muted-foreground">{words} words · ≈ {Math.floor(mins)}m {Math.round((mins % 1) * 60)}s narration @150 wpm</p>
                <div className="flex gap-2">
                  <button className={btnOutline} onClick={() => { actions.deleteScript(current.id); setSel(null); toast("Script deleted"); }}><Trash2 className="h-4 w-4" /></button>
                  <button className={btnOutline} onClick={() => { save(); actions.addVoiceover({ title: `${title} narration`, scriptId: current.id, voice: defaultVoice, speed: 1, text: body }); toast.success("Sent to Voiceovers"); }}>
                    <Mic className="h-4 w-4" /> Make voiceover
                  </button>
                  <button className={btnDark} onClick={save}><Save className="h-4 w-4" /> Save</button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}
      <p className="sr-only">{VOICES.length}</p>
    </Page>
  );
}
