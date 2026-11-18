// Server-only Facebook Page helpers. Tokens never leave the server.
export const FB_REDIRECT = "https://sooha.io/api/public/facebook/callback";
const GRAPH = "https://graph.facebook.com/v21.0";
export const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement", "read_insights"];

const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} is not configured`); return v; };

async function hmac(body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("FACEBOOK_STATE_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeState(userId: string, workspaceId: string) {
  const body = `${userId}.${workspaceId}.${Date.now() + 600_000}`;
  return `${body}.${await hmac(body)}`;
}

export async function readState(state: string): Promise<{ userId: string; workspaceId: string } | null> {
  const p = state.split(".");
  if (p.length !== 4) return null;
  const [userId, workspaceId, exp, sig] = p as [string, string, string, string];
  if (Number(exp) < Date.now()) return null;
  if ((await hmac(`${userId}.${workspaceId}.${exp}`)) !== sig) return null;
  const uuid = /^[0-9a-f-]{36}$/;
  return uuid.test(userId) && uuid.test(workspaceId) ? { userId, workspaceId } : null;
}

export function authUrl(state: string) {
  const q = new URLSearchParams({ client_id: env("FACEBOOK_APP_ID"), redirect_uri: FB_REDIRECT, state, response_type: "code", scope: FB_SCOPES.join(",") });
  return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}?${new URLSearchParams(params)}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Facebook request failed [${res.status}]: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** Code -> short token -> 60-day user token. */
export async function exchangeCode(code: string) {
  const id = env("FACEBOOK_APP_ID"), secret = env("FACEBOOK_APP_SECRET");
  const short = await graph<{ access_token: string }>("oauth/access_token", { client_id: id, client_secret: secret, redirect_uri: FB_REDIRECT, code });
  const long = await graph<{ access_token: string }>("oauth/access_token", { grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token });
  return long.access_token;
}

export type FbPage = { id: string; name: string; access_token: string };
/** Pages the user manages, each with a non-expiring Page token (from a long-lived user token). */
export async function listPages(userToken: string): Promise<FbPage[]> {
  const r = await graph<{ data?: FbPage[] }>("me/accounts", { access_token: userToken, fields: "id,name,access_token", limit: "100" });
  return r.data ?? [];
}

export async function pageStats(pageToken: string, pageId: string) {
  const p = await graph<{ name: string; followers_count?: number; fan_count?: number; picture?: { data?: { url?: string } } }>(pageId, { access_token: pageToken, fields: "name,followers_count,fan_count,picture" });
  return { name: p.name, followers: p.followers_count ?? 0, likes: p.fan_count ?? 0, picture: p.picture?.data?.url ?? null };
}
