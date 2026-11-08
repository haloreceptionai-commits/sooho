// Gemini Omni image-to-video clips via the Lovable AI Gateway (used only when the
// user picks the "Gemini Omni" engine). One job per scene group; client polls.

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "google/gemini-omni-1.1-flash";

function key() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("[401] AI is not configured");
  return k;
}

async function err(res: Response, what: string): Promise<never> {
  const t = (await res.text()).slice(0, 400);
  console.error(`${what} failed [${res.status}]: ${t}`);
  let msg = t;
  try { const j = JSON.parse(t); msg = j?.error?.message ?? j?.message ?? t; } catch { /* raw */ }
  throw new Error(`[${res.status}] ${what}: ${msg}`);
}

export interface ClipInput { prompt: string; image: string; aspect: "portrait" | "landscape"; seconds: number }

export const startClipOperation = async ({ data }: { data: ClipInput }): Promise<{ id: string }> => {
    const res = await fetch(`${GATEWAY}/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { type: "image", data: data.image, mime_type: "image/jpeg" },
          { type: "text", text: `<FIRST_FRAME> ${data.prompt}` },
        ],
        response_format: { type: "video", resolution: "720p", duration: `${data.seconds}s`, aspect_ratio: data.aspect === "portrait" ? "9:16" : "16:9" },
      }),
    });
    if (!res.ok) await err(res, "AI video");
    const j = (await res.json()) as { id: string };
    return { id: j.id };
  };

export const pollClipOperation = async ({ data }: { data: {id:string} }): Promise<{ status: string; error?: string }> => {
    const res = await fetch(`${GATEWAY}/videos/${encodeURIComponent(data.id)}`, { headers: { Authorization: `Bearer ${key()}` } });
    if (!res.ok) await err(res, "AI video status");
    const j = (await res.json()) as { status: string; error?: { code: string; message: string } };
    if (j.status === "failed") return { status: "failed", error: j.error?.message ?? "AI video failed" };
    return { status: j.status };
  };

// Finished clips are 4–8 MB; one response that large is dropped by the preview proxy,
// so the browser downloads them in small byte ranges instead.
export const CLIP_CHUNK = 1_500_000;
export const clipChunkOperation = async ({ data }: { data: {id:string;offset:number} }): Promise<{ data: string; total: number }> => {
    const url = `${GATEWAY}/videos/${encodeURIComponent(data.id)}/content`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key()}` }, redirect: "manual" });
    const loc = r.headers.get("location");
    const dl = loc
      ? await fetch(loc, { headers: { Range: `bytes=${data.offset}-${data.offset + CLIP_CHUNK - 1}` } })
      : r;
    if (!dl.ok) await err(dl, "AI video download");
    let bytes = new Uint8Array(await dl.arrayBuffer());
    let total = Number(dl.headers.get("content-range")?.split("/")[1] ?? 0);
    if (dl.status !== 206) { total = bytes.length; bytes = bytes.subarray(data.offset, data.offset + CLIP_CHUNK); }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { data: btoa(bin), total };
  };
