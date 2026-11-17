// Workspaces: each one has its own videos, analytics and settings, and its own YouTube channel. The list lives in the cloud
// (public.workspaces); the active one is remembered per browser. A video belongs to the workspace saved inside its record
// (videos.data.workspaceId); older videos without one belong to the first workspace.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bindActiveWorkspace, useStore, type Video } from "@/lib/store";
import { cleanName, inWorkspace, nameTaken, NAME_MAX } from "@/lib/workspace-rules";

export interface Workspace { id: string; name: string; createdAt: string }
interface WsState { list: Workspace[]; activeId: string | null; ready: boolean; error: string | null }

const KEY = "chronicle-active-workspace";
let state: WsState = { list: [], activeId: null, ready: false, error: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<WsState>) => { state = { ...state, ...patch }; emit(); };

function remembered() { try { return localStorage.getItem(KEY); } catch { return null; } }
function remember(id: string) { try { localStorage.setItem(KEY, id); } catch { /* private mode: the choice just is not kept */ } }

export { NAME_MAX, cleanName, inWorkspace };

/** Loads the owner's workspaces, creating the first one ("Main workspace") on the very first visit. */
export async function loadWorkspaces() {
  try {
    const { data: first, error: e1 } = await supabase.rpc("ensure_default_workspace");
    if (e1) throw e1;
    const { data, error } = await supabase.from("workspaces").select("id,name,created_at").order("created_at", { ascending: true }).order("id", { ascending: true });
    if (error) throw error;
    const list = (data ?? []).map((w) => ({ id: w.id, name: w.name, createdAt: w.created_at }));
    if (!list.length && first) list.push({ id: first, name: "Main workspace", createdAt: new Date().toISOString() });
    const keep = remembered();
    const activeId = list.some((w) => w.id === keep) ? keep : (list[0]?.id ?? null);
    set({ list, activeId, ready: true, error: null });
  } catch (e) {
    set({ ready: true, error: e instanceof Error ? e.message : "Workspaces could not be loaded" });
  }
}

export function clearWorkspaces() { set({ list: [], activeId: null, ready: false, error: null }); }

export async function createWorkspace(rawName: string): Promise<Workspace> {
  const name = cleanName(rawName);
  if (!name) throw new Error("Give the workspace a name");
  if (nameTaken(state.list, name)) throw new Error("You already have a workspace with that name");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please sign in again");
  const { data, error } = await supabase.from("workspaces").insert({ name, user_id: u.user.id }).select("id,name,created_at").single();
  if (error) throw new Error(error.message);
  const ws = { id: data.id, name: data.name, createdAt: data.created_at };
  set({ list: [...state.list, ws], activeId: ws.id }); remember(ws.id);
  return ws;
}

export async function renameWorkspace(id: string, rawName: string) {
  const name = cleanName(rawName);
  if (!name) throw new Error("Give the workspace a name");
  if (nameTaken(state.list, name, id)) throw new Error("You already have a workspace with that name");
  const { error } = await supabase.from("workspaces").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  set({ list: state.list.map((w) => (w.id === id ? { ...w, name } : w)) });
}

export function setActiveWorkspace(id: string) {
  if (!state.list.some((w) => w.id === id)) return;
  remember(id); set({ activeId: id });
}

bindActiveWorkspace(() => state.activeId);
export const getActiveWorkspaceId = () => state.activeId;
export const getDefaultWorkspaceId = () => state.list[0]?.id ?? null;

const seed: WsState = { list: [], activeId: null, ready: false, error: null };
export function useWorkspaceState() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => seed);
}

export function useActiveWorkspace() {
  const s = useWorkspaceState();
  const active = s.list.find((w) => w.id === s.activeId) ?? null;
  return { ...s, active, id: active?.id ?? null, firstId: s.list[0]?.id ?? null };
}

/** The videos of the active workspace only. */
export function useWorkspaceVideos(): Video[] {
  const all = useStore((s) => s.videos);
  const { id, firstId } = useActiveWorkspace();
  return id ? all.filter((v) => inWorkspace(v, id, firstId)) : all;
}
