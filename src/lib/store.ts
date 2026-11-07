import { useSyncExternalStore } from "react";

export type Format = "long" | "short";
export type VideoStatus = "running" | "done" | "failed";
export type Stage = "script" | "voice" | "images" | "render" | "saving" | "done";

export interface VideoInput {
  topic: string;
  format: Format;
  durationSec: number;
  archetype: string;
  style: string;
  voice: string;
  engine?: VideoEngine;
}

/** "own" = stills + camera motion (no AI video); "omni" = Gemini Omni AI-animated clips. */
export type VideoEngine = "own" | "omni";

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
  duration?: number | undefined; // seconds, after render
  mime?: string | undefined;
  size?: number | undefined;
  thumb?: string | undefined; // small jpeg data URL
  sceneCount?: number | undefined;
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
          v.status === "running" ? { ...v, status: "failed", error: "Interrupted — the page was closed while generating.", detail: "Interrupted" } : v,
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
    return id;
  },
  updateVideo(id: string, patch: Partial<Video>) {
    setState((s) => ({ ...s, videos: s.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  },
  removeVideo(id: string) {
    setState((s) => ({ ...s, videos: s.videos.filter((v) => v.id !== id) }));
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
