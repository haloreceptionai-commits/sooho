import { useSyncExternalStore } from "react";

export type Format = "long" | "short";
export type ProjectStatus = "draft" | "queued" | "rendering" | "done";

export interface Project {
  id: string;
  title: string;
  topic: string;
  format: Format;
  duration: number; // seconds
  template: string;
  status: ProjectStatus;
  step: number; // 0-5 pipeline steps complete
  updatedAt: number;
}
export interface Script { id: string; title: string; projectId?: string | undefined; body: string; updatedAt: number }
export interface Voiceover { id: string; title: string; scriptId?: string | undefined; voice: string; speed: number; text: string; status: "pending" | "ready"; createdAt: number }
export interface ImageAsset { id: string; prompt: string; style: string; aspect: "16:9" | "9:16" | "1:1"; hue: number; createdAt: number }
export interface RenderJob { id: string; projectId: string; title: string; format: Format; progress: number; status: "queued" | "rendering" | "done" | "failed"; createdAt: number }
export interface Settings {
  channelName: string;
  azureEndpoint: string;
  scriptDeployment: string;
  ttsDeployment: string;
  imageDeployment: string;
  defaultVoice: string;
  defaultStyle: string;
  longResolution: string;
  shortResolution: string;
  burnCaptions: boolean;
}

export interface State {
  projects: Project[];
  scripts: Script[];
  voiceovers: Voiceover[];
  images: ImageAsset[];
  jobs: RenderJob[];
  settings: Settings;
}

const now = Date.now();
const h = 3600_000;
export const uid = () => Math.random().toString(36).slice(2, 10);

const seed: State = {
  projects: [
    { id: "p1", title: "The Fall of Constantinople, 1453", topic: "Fall of Constantinople", format: "long", duration: 1104, template: "paradox", status: "rendering", step: 4, updatedAt: now - 0.1 * h },
    { id: "p2", title: "Why Romans Never Used Soap", topic: "Roman hygiene", format: "short", duration: 52, template: "lie", status: "done", step: 5, updatedAt: now - 1 * h },
    { id: "p3", title: "The Lost Library of Alexandria", topic: "Library of Alexandria", format: "long", duration: 1330, template: "secret", status: "queued", step: 2, updatedAt: now - 2 * h },
    { id: "p4", title: "Napoleon Was Not Short", topic: "Napoleon's height", format: "short", duration: 45, template: "lie", status: "done", step: 5, updatedAt: now - 26 * h },
    { id: "p5", title: "Rise of the Mongol Empire", topic: "Mongol Empire", format: "long", duration: 900, template: "countdown", status: "draft", step: 1, updatedAt: now - 50 * h },
  ],
  scripts: [
    { id: "s1", title: "The Fall of Constantinople — v2", projectId: "p1", body: "The Fall of Constantinople should have been impossible. And yet — it happened.\n\nFor a thousand years its walls had never been breached…", updatedAt: now - 3 * h },
    { id: "s2", title: "Romans & soap (Short)", projectId: "p2", body: "Everything you learned about Roman hygiene is wrong.\n\nThey didn't use soap. They used oil, a metal scraper, and a public bath…", updatedAt: now - 20 * h },
  ],
  voiceovers: [
    { id: "v1", title: "Constantinople narration", scriptId: "s1", voice: "Narrator · Deep male", speed: 0.95, text: "The Fall of Constantinople should have been impossible.", status: "ready", createdAt: now - 2 * h },
  ],
  images: [
    { id: "i1", prompt: "Theodosian walls at dawn, siege cannons", style: "Oil painting", aspect: "16:9", hue: 30, createdAt: now - 4 * h },
    { id: "i2", prompt: "Ottoman fleet dragged over land", style: "Oil painting", aspect: "16:9", hue: 210, createdAt: now - 4 * h },
    { id: "i3", prompt: "Roman bathhouse, steam, strigil", style: "Fresco", aspect: "9:16", hue: 45, createdAt: now - 21 * h },
    { id: "i4", prompt: "Library scrolls burning", style: "Chiaroscuro", aspect: "16:9", hue: 15, createdAt: now - 30 * h },
  ],
  jobs: [
    { id: "j1", projectId: "p1", title: "The Fall of Constantinople, 1453", format: "long", progress: 62, status: "rendering", createdAt: now - 0.2 * h },
    { id: "j2", projectId: "p3", title: "The Lost Library of Alexandria", format: "long", progress: 0, status: "queued", createdAt: now - 0.1 * h },
    { id: "j3", projectId: "p2", title: "Why Romans Never Used Soap", format: "short", progress: 100, status: "done", createdAt: now - 1 * h },
  ],
  settings: {
    channelName: "Chronicle History",
    azureEndpoint: "",
    scriptDeployment: "gpt-4o",
    ttsDeployment: "tts-hd",
    imageDeployment: "dall-e-3",
    defaultVoice: "Narrator · Deep male",
    defaultStyle: "Oil painting",
    longResolution: "1920x1080",
    shortResolution: "1080x1920",
    burnCaptions: true,
  },
};

const KEY = "chronicle-studio-v1";
let state: State = seed;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function hydrateStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...seed, ...JSON.parse(raw) };
    emit();
  } catch {
    /* ignore */
  }
}

export function setState(fn: (s: State) => State) {
  state = fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  emit();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
    () => sel(seed),
  );
}

export const getState = () => state;

// ---------- actions ----------
export const actions = {
  addProject(p: Omit<Project, "id" | "updatedAt" | "status" | "step">) {
    const id = uid();
    setState((s) => ({ ...s, projects: [{ ...p, id, status: "draft", step: 0, updatedAt: Date.now() }, ...s.projects] }));
    return id;
  },
  updateProject(id: string, patch: Partial<Project>) {
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) }));
  },
  deleteProject(id: string) {
    setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id), jobs: s.jobs.filter((j) => j.projectId !== id) }));
  },
  queueRender(projectId: string) {
    const p = state.projects.find((x) => x.id === projectId);
    if (!p) return;
    setState((s) => ({
      ...s,
      projects: s.projects.map((x) => (x.id === projectId ? { ...x, status: "queued", updatedAt: Date.now() } : x)),
      jobs: [{ id: uid(), projectId, title: p.title, format: p.format, progress: 0, status: "queued", createdAt: Date.now() }, ...s.jobs.filter((j) => !(j.projectId === projectId && j.status !== "done"))],
    }));
  },
  cancelJob(id: string) {
    setState((s) => {
      const job = s.jobs.find((j) => j.id === id);
      return {
        ...s,
        jobs: s.jobs.filter((j) => j.id !== id),
        projects: s.projects.map((p) => (job && p.id === job.projectId && p.status !== "done" ? { ...p, status: "draft" } : p)),
      };
    });
  },
  clearFinished() {
    setState((s) => ({ ...s, jobs: s.jobs.filter((j) => j.status !== "done" && j.status !== "failed") }));
  },
  /** Simulated render worker: advances the first active job. Replaced by Python worker later. */
  tickRender() {
    const active = state.jobs.find((j) => j.status === "rendering") ?? state.jobs.find((j) => j.status === "queued");
    if (!active) return;
    const progress = Math.min(100, active.progress + 4);
    const done = progress >= 100;
    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === active.id ? { ...j, progress, status: done ? "done" : "rendering" } : j)),
      projects: s.projects.map((p) =>
        p.id === active.projectId ? { ...p, status: done ? "done" : "rendering", step: done ? 5 : Math.max(p.step, 4), updatedAt: Date.now() } : p,
      ),
    }));
  },
  saveScript(sc: Omit<Script, "id" | "updatedAt"> & { id?: string | undefined }) {
    const id = sc.id ?? uid();
    setState((s) => {
      const exists = s.scripts.some((x) => x.id === id);
      const next = { ...sc, id, updatedAt: Date.now() } as Script;
      return { ...s, scripts: exists ? s.scripts.map((x) => (x.id === id ? next : x)) : [next, ...s.scripts] };
    });
    if (sc.projectId) {
      const p = state.projects.find((x) => x.id === sc.projectId);
      if (p && p.step < 1) actions.updateProject(p.id, { step: 1 });
    }
    return id;
  },
  deleteScript(id: string) {
    setState((s) => ({ ...s, scripts: s.scripts.filter((x) => x.id !== id) }));
  },
  addVoiceover(v: Omit<Voiceover, "id" | "createdAt" | "status">) {
    setState((s) => ({ ...s, voiceovers: [{ ...v, id: uid(), status: "pending", createdAt: Date.now() }, ...s.voiceovers] }));
  },
  deleteVoiceover(id: string) {
    setState((s) => ({ ...s, voiceovers: s.voiceovers.filter((x) => x.id !== id) }));
  },
  addImages(imgs: Omit<ImageAsset, "id" | "createdAt">[]) {
    setState((s) => ({ ...s, images: [...imgs.map((i) => ({ ...i, id: uid(), createdAt: Date.now() })), ...s.images] }));
  },
  deleteImage(id: string) {
    setState((s) => ({ ...s, images: s.images.filter((x) => x.id !== id) }));
  },
  saveSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
  resetAll() {
    setState(() => seed);
  },
};

export const VOICES = ["Narrator · Deep male", "Narrator · Warm female", "Documentary · Calm", "Storyteller · Dramatic", "Shorts · Energetic"];
export const STYLES = ["Oil painting", "Fresco", "Chiaroscuro", "Parchment ink", "Blueprint sepia", "Cinematic photoreal"];

export function timeAgo(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `${hh} h ago`;
  const d = Math.round(hh / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}
