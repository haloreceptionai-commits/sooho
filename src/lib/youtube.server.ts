// Server-only YouTube helpers. Refresh tokens never leave the server.
export const YT_REDIRECT = "https://sooha.io/api/public/youtube/callback";
export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

async function hmac(text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("YOUTUBE_STATE_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => (c === "+" ? "-" : c === "/" ? "_" : ""));
}

/** Signed, 10-minute state binding the OAuth round-trip to the signed-in owner. */
export async function makeState(userId: string) {
  const body = `${userId}.${Date.now() + 600_000}`;
  return `${body}.${await hmac(body)}`;
}

export async function readState(state: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  if (Number(exp) < Date.now()) return null;
  if ((await hmac(`${userId}.${exp}`)) !== sig) return null;
  return /^[0-9a-f-]{36}$/.test(userId) ? userId : null;
}

export function authUrl(state: string) {
  const q = new URLSearchParams({
    client_id: env("YOUTUBE_CLIENT_ID"), redirect_uri: YT_REDIRECT, response_type: "code",
    scope: YT_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenCall(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("YOUTUBE_CLIENT_ID"), client_secret: env("YOUTUBE_CLIENT_SECRET"), ...params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token request failed [${res.status}]: ${text}`);
  return JSON.parse(text) as { access_token: string; refresh_token?: string };
}

export const exchangeCode = (code: string) => tokenCall({ code, grant_type: "authorization_code", redirect_uri: YT_REDIRECT });
export const refreshAccess = async (refresh: string) => (await tokenCall({ refresh_token: refresh, grant_type: "refresh_token" })).access_token;

export async function myChannel(access: string) {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${access}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube channel lookup failed [${res.status}]: ${text}`);
  const ch = (JSON.parse(text) as { items?: { id: string; snippet: { title: string } }[] }).items?.[0];
  return ch ? { id: ch.id, title: ch.snippet.title } : null;
}

export type UploadMeta = { title: string; description: string; tags: string[]; privacy: "private" | "unlisted" | "public"; short: boolean; size: number; mime: string; origin: string };

/** Starts a resumable upload; the browser PUTs the file straight to the returned URL. */
export async function startUpload(access: string, m: UploadMeta) {
  let title = m.title.trim().slice(0, 100);
  let description = m.description.slice(0, 4900);
  if (m.short && !/#shorts/i.test(title + description)) {
    if (title.length <= 92) title = `${title} #Shorts`; else description = `${description}\n\n#Shorts`;
  }
  const res = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`, "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(m.size), "X-Upload-Content-Type": m.mime, Origin: m.origin,
    },
    body: JSON.stringify({
      snippet: { title, description, tags: m.tags.slice(0, 30), categoryId: "27" },
      status: { privacyStatus: m.privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    }),
  });
  if (!res.ok) throw new Error(`YouTube upload start failed [${res.status}]: ${await res.text()}`);
  const url = res.headers.get("location");
  if (!url) throw new Error("YouTube did not return an upload address");
  return url;
}
