// Finished video files live in private cloud storage (one folder per signed-in user);
// IndexedDB is only a local cache / legacy source.
import { supabase } from "@/integrations/supabase/client";

const DB = "chronicle-videos";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const localGet = (id: string) => tx<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>).catch(() => undefined);
const localPut = (id: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, id)).catch(() => undefined);

async function pathFor(id: string, type: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return `${data.user.id}/${id}.${type.includes("mp4") ? "mp4" : "webm"}`;
}

/** Uploads the file to cloud storage and records its path on the video row. */
export async function uploadVideoFile(id: string, blob: Blob) {
  const path = await pathFor(id, blob.type);
  const { error } = await supabase.storage.from("videos").upload(path, blob, { upsert: true, contentType: blob.type || "video/webm" });
  if (error) throw new Error(`Cloud save failed: ${error.message}`);
  const { error: e2 } = await supabase.from("videos").update({ file_path: path }).eq("id", id);
  if (e2) throw new Error(`Cloud save failed: ${e2.message}`);
}

export async function saveVideoFile(id: string, blob: Blob) {
  await localPut(id, blob);
  const { flushVideo } = await import("@/lib/store");
  await flushVideo(id);
  await uploadVideoFile(id, blob);
}

export async function getVideoFile(id: string): Promise<Blob | undefined> {
  const cached = await localGet(id);
  if (cached) return cached;
  const { data: row } = await supabase.from("videos").select("file_path").eq("id", id).maybeSingle();
  if (!row?.file_path) return undefined;
  const { data, error } = await supabase.storage.from("videos").download(row.file_path);
  if (error || !data) return undefined;
  void localPut(id, data);
  return data;
}

export { localGet as getLocalVideoFile };
