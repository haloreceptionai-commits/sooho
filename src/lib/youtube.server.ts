// Server-only YouTube helpers. Refresh tokens never leave the server.
export const YT_REDIRECT = "https://sooha.io/api/public/youtube/callback";
export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

async function ytGet<T>(access: string, path: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { Authorization: `Bearer ${access}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube request failed [${res.status}]: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export type YtVideo = { id: string; title: string; thumb: string; published: string; views: number; likes: number; comments: number; duration: string };

/** Channel totals plus the latest 50 uploads with their public stats. */
export async function channelAnalytics(access: string) {
  const ch = await ytGet<{ items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } }; statistics: Record<string, string>; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    access, "channels?part=snippet,statistics,contentDetails&mine=true");
  const c = ch.items?.[0];
  if (!c) throw new Error("No YouTube channel found on this account");
  const pl = await ytGet<{ items?: { contentDetails: { videoId: string } }[] }>(access, `playlistItems?part=contentDetails&maxResults=50&playlistId=${c.contentDetails.relatedPlaylists.uploads}`);
  const ids = (pl.items ?? []).map((i) => i.contentDetails.videoId);
  let videos: YtVideo[] = [];
  if (ids.length) {
    const v = await ytGet<{ items?: { id: string; snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string } } }; statistics: Record<string, string>; contentDetails: { duration: string } }[] }>(
      access, `videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}`);
    videos = (v.items ?? []).map((x) => ({
      id: x.id, title: x.snippet.title, thumb: x.snippet.thumbnails?.medium?.url ?? "", published: x.snippet.publishedAt,
      views: Number(x.statistics["viewCount"] ?? 0), likes: Number(x.statistics["likeCount"] ?? 0), comments: Number(x.statistics["commentCount"] ?? 0),
      duration: x.contentDetails.duration,
    }));
  }
  return {
    channel: { id: c.id, title: c.snippet.title, thumb: c.snippet.thumbnails?.default?.url ?? "",
      subscribers: Number(c.statistics["subscriberCount"] ?? 0), views: Number(c.statistics["viewCount"] ?? 0), videos: Number(c.statistics["videoCount"] ?? 0) },
    videos,
  };
}

export type YtComment = { id: string; videoId: string; author: string; authorThumb: string; text: string; published: string; likes: number; replied: boolean };

/** Recent top-level comments across the channel; `replied` = channel owner already answered. */
export async function recentComments(access: string, channelId: string): Promise<YtComment[]> {
  const r = await ytGet<{ items?: { id: string; snippet: { videoId: string; topLevelComment: { snippet: { authorDisplayName: string; authorProfileImageUrl: string; textOriginal: string; publishedAt: string; likeCount: number; authorChannelId?: { value: string } } } }; replies?: { comments: { snippet: { authorChannelId?: { value: string } } }[] } }[] }>(
    access, `commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${channelId}&maxResults=100&order=time`);
  return (r.items ?? [])
    .filter((t) => t.snippet.topLevelComment.snippet.authorChannelId?.value !== channelId)
    .map((t) => {
      const s = t.snippet.topLevelComment.snippet;
      return { id: t.id, videoId: t.snippet.videoId, author: s.authorDisplayName, authorThumb: s.authorProfileImageUrl, text: s.textOriginal,
        published: s.publishedAt, likes: s.likeCount, replied: !!t.replies?.comments.some((c) => c.snippet.authorChannelId?.value === channelId) };
    });
}

export async function postReply(access: string, parentId: string, text: string) {
  const res = await fetch("https://www.googleapis.com/youtube/v3/comments?part=snippet", {
    method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { parentId, textOriginal: text } }),
  });
  if (!res.ok) throw new Error(`YouTube reply failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
}

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
export async function makeState(userId: string, workspaceId: string) {
  const body = `${userId}.${workspaceId}.${Date.now() + 600_000}`;
  return `${body}.${await hmac(body)}`;
}

/** Verifies the signed state. `workspaceId` is null only for links made before workspaces existed. */
export async function readState(state: string): Promise<{ userId: string; workspaceId: string | null } | null> {
  const parts = state.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const sig = parts.at(-1)!, exp = parts.at(-2)!, signed = parts.slice(0, -1).join(".");
  if (Number(exp) < Date.now()) return null;
  if ((await hmac(signed)) !== sig) return null;
  const userId = parts[0]!, workspaceId = parts.length === 4 ? parts[1]! : null;
  const uuid = /^[0-9a-f-]{36}$/;
  if (!uuid.test(userId) || (workspaceId !== null && !uuid.test(workspaceId))) return null;
  return { userId, workspaceId };
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
