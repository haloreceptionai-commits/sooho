import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type Format = "long" | "short";
export type VideoStatus = "running" | "done" | "failed";
export type Stage = "script" | "voice" | "images" | "render" | "saving" | "done";

export interface VideoInput {
  topic: string;
  topicId?: string | undefined;
  topicSource?: { url: string; fact: string };
  reference?: { url: string; transcript: string } | undefined; // remix: transcript of the YouTube Short it is based on
  format: Format;
  durationSec: number;
  archetype: string;
  style: string;
  voice: string;
  engine?: VideoEngine;
}

/** "own" = stills + camera motion (no AI video); "omni" = Gemini Omni AI-animated clips. */
export type VideoEngine = "own" | "omni" | "seedance";

export interface Video {
  id: string;
  title: string;
  description: string;
  input: VideoInput;
  status: VideoStatus;
  stage: Stage;
  progress: number; // 0-100
  detail: string;
  error?: string | undefined;
  removed?: boolean | undefined; // taken out of the queue by the owner; kept in the cloud, hidden from lists
  duration?: number | undefined; // seconds, after render
  mime?: string | undefined;
  size?: number | undefined;
  thumb?: string | undefined; // small jpeg data URL
  sceneCount?: number | undefined;
  seedanceCheckpoint?: import("@/lib/pipeline").SeedanceCheckpoint;
  seedanceClips?: Record<string, { id?: string; path?: string; error?: string }>;
  assemblyCheckpoint?: import("@/lib/pipeline").SeedanceCheckpoint;
  assemblyClips?: { path: string; scenes: number[] }[];
  hostedRender?: { id: string; status: string };
  qa?: { score: number; parts: Record<string, number> } | undefined;
  hooks?: { best: string; runnerUp: string } | undefined;
  facts?: { myth: string; reality: string; claims: number; confidence: number } | undefined;
  checks?: string[] | undefined; // script checker issues left after the rewrite
  ready?: boolean | undefined; // passed the 85-point publish gate
  story?: { premise: string; question: string; hero: string; anchors: string } | undefined;
  judges?: { passA: number; passB: number; passC: boolean; payoff: string; weakest: string } | undefined;
  analytics?: { hookType: string; revealSec: number; castSize: number; shotMix: Record<string, number>; continuity: number } | undefined;
  perf?: { hold3?: number | undefined; ret30?: number | undefined; completion?: number | undefined; replays?: number | undefined } | undefined;
  createdAt: number;
}

export interface Settings {
  channelName: string;
  azureEndpoint: string;
  scriptDeployment: string;
  ttsDeployment: string;
  imageDeployment: string;
  videoDeployment: string;
  defaultVoice: string;
  defaultStyle: string;
  burnCaptions: boolean;
  soundEffects: boolean;
  imageQuality: "low" | "medium";
  styleV?: number;
}

export interface State {
  videos: Video[];
  settings: Settings;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_SETTINGS: Settings = {
  channelName: "Chronicle History",
  azureEndpoint: "https://robiulalamsuleman-5258-resource.services.ai.azure.com/",
  scriptDeployment: "gpt-5",
  ttsDeployment: "gpt-realtime",
  imageDeployment: "gpt-image-1-mini",
  videoDeployment: "gpt-5.1-codex",
  defaultVoice: "onyx",
  defaultStyle: "3D animated cartoon",
  styleV: 2,
  burnCaptions: true,
  soundEffects: true,
  imageQuality: "medium",
};

const seed: State = { videos: [], settings: DEFAULT_SETTINGS };

const KEY = "chronicle-studio-v2";
let state: State = seed;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function hydrateStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      state = {
        settings: (() => { const st = { ...DEFAULT_SETTINGS, ...parsed.settings }; if ((st.styleV ?? 0) < 2) { st.defaultStyle = DEFAULT_SETTINGS.defaultStyle; st.styleV = 2; } return st; })(),
        // jobs that were running when the page closed can't resume
        videos: (parsed.videos ?? []).map((v) =>
          v.status === "running" && !v.hostedRender ? { ...v, status: "failed", error: v.seedanceCheckpoint ? "Saved animation is safe. Click Resume to continue without restarting." : "Interrupted — the page was closed while generating.", detail: v.seedanceCheckpoint ? "Saved · ready to resume" : "Interrupted" } : v,
        ),
      };
    }
    emit();
  } catch {
    /* ignore */
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota — ignore */
  }
}

export function setState(fn: (s: State) => State) {
  state = fn(state);
  persist();
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

export const actions = {
  addVideo(input: VideoInput) {
    const id = uid();
    const v: Video = { id, title: input.topic, description: "", input, status: "running", stage: "script", progress: 1, detail: "Writing script…", createdAt: Date.now() };
    setState((s) => ({ ...s, videos: [v, ...s.videos] }));
    void flushVideo(id);
    return id;
  },
  updateVideo(id: string, patch: Partial<Video>) {
    setState((s) => ({ ...s, videos: s.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
    if (patch.status && patch.status !== "running") void flushVideo(id);
    else queueSync(id);
  },
  saveSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
};

export { STYLES } from "@/lib/styles";

export function timeAgo(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `${hh} h ago`;
  const d = Math.round(hh / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

// ---- Cloud sync: every video record is saved to the signed-in owner's cloud library.
// There is intentionally no delete path (no DELETE policy either) so videos are never lost.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function queueSync(id: string) {
  if (timers.has(id)) return;
  timers.set(id, setTimeout(() => { timers.delete(id); void flushVideo(id); }, 2000));
}

export async function flushVideo(id: string) {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  const v = state.videos.find((x) => x.id === id);
  if (!v) return;
  if (v.hostedRender) return; // Once handed off, only the hosted service owns progress and completion.
  // Never let a delayed browser snapshot erase provider IDs or durable clips saved by the server.
  let data = v;
  if (v.input.engine === "seedance") {
    const { data: row } = await supabase.from("videos").select("data").eq("id", id).maybeSingle();
    const remote = row?.data as unknown as Video | undefined;
    const clips = { ...v.seedanceClips };
    for (const [index, run] of Object.entries(remote?.seedanceClips ?? {})) clips[index] = { ...clips[index], ...run };
    data = { ...v, seedanceClips: clips };
  }
  const { error } = await supabase.from("videos").upsert({ id: v.id, data: data as unknown as Json, updated_at: new Date().toISOString() });
  if (error) console.warn("Cloud sync failed", error.message);
}

let syncing = false;
export async function syncFromCloud() {
  if (syncing) return;
  syncing = true;
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase.from("videos").select("id, data, file_path").order("created_at", { ascending: false });
    if (error) throw error;
    const cloud = (data ?? []).map((r) => {
      const v = r.data as unknown as Video;
      const running = v.status === "running" && !v.hostedRender && !state.videos.some((x) => x.id === v.id && x.status === "running");
      return running ? { ...v, status: "failed" as const, error: v.seedanceCheckpoint ? "Saved animation is safe. Click Resume to continue without restarting." : "Interrupted — the page was closed while generating.", detail: v.seedanceCheckpoint ? "Saved · ready to resume" : "Interrupted" } : v;
    });
    const ids = new Set(cloud.map((v) => v.id));
    const localOnly = state.videos.filter((v) => !ids.has(v.id));
    const live = new Map(state.videos.filter((v) => v.status === "running" && !v.hostedRender).map((v) => [v.id, v]));
    state = { ...state, videos: [...localOnly, ...cloud.map((v) => v.hostedRender ? v : live.get(v.id) ?? v)].sort((a, b) => b.createdAt - a.createdAt) };
    persist(); emit();
    // Move videos that only existed in this browser into the cloud library.
    const { getLocalVideoFile, uploadVideoFile } = await import("@/lib/video-db");
    for (const v of localOnly) {
      await flushVideo(v.id);
      if (v.status === "done") {
        const blob = await getLocalVideoFile(v.id);
        if (blob) await uploadVideoFile(v.id, blob).catch((e) => console.warn(e));
      }
    }
    for (const r of data ?? []) {
      if (r.file_path) continue;
      const v = r.data as unknown as Video;
      if (v.status !== "done") continue;
      const blob = await getLocalVideoFile(v.id);
      if (blob) await uploadVideoFile(v.id, blob).catch((e) => console.warn(e));
    }
  } catch (e) {
    console.warn("Cloud load failed", e);
  } finally {
    syncing = false;
  }
}

export function clearVideos() {
  state = { ...state, videos: [] };
  persist(); emit();
}
