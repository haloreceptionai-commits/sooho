// Pure workspace rules (no Supabase), shared by the store, the pages and the tests.
export const NAME_MAX = 60;
/** Collapses whitespace and trims; the database allows 1-60 characters. */
export const cleanName = (raw: string) => raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

/** True when a video belongs to the workspace: it names it, or it predates workspaces and the workspace is the first one. */
export function inWorkspace(v: { workspaceId?: string | undefined }, workspaceId: string | null, firstId: string | null) {
  return (v.workspaceId ?? firstId) === workspaceId;
}

/** A name is free when no other workspace already uses it (case-insensitive). */
export const nameTaken = (list: { id: string; name: string }[], name: string, exceptId?: string) =>
  list.some((w) => w.id !== exceptId && w.name.toLowerCase() === name.toLowerCase());
