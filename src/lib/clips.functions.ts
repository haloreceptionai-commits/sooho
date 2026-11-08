// Gemini Omni image-to-video clips via the Lovable AI Gateway (used only when the
// user picks the "Gemini Omni" engine). One job per scene group; client polls.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const startClip = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: ClipInput) => {
    if (!d.prompt?.trim() || d.prompt.length > 3500) throw new Error("Clip prompt must be 1–3500 characters");
    if (!d.image || d.image.length > 20_000_000) throw new Error("Clip start image missing or too large");
    return { ...d, seconds: Math.max(3, Math.min(10, Math.round(d.seconds))) };
  })
  .handler(async ({ data }) => { const { startClipOperation } = await import('./clips-operations.server'); return startClipOperation({ data }); });

export const pollClip = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(d.id)) throw new Error("Invalid clip id");
    return d;
  })
  .handler(async ({ data }) => { const { pollClipOperation } = await import('./clips-operations.server'); return pollClipOperation({ data }); });

// Finished clips are 4–8 MB; one response that large is dropped by the preview proxy,
// so the browser downloads them in small byte ranges instead.
export const CLIP_CHUNK = 1_500_000;
export const clipChunk = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; offset: number }) => {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(d.id)) throw new Error("Invalid clip id");
    if (!Number.isInteger(d.offset) || d.offset < 0) throw new Error("Invalid offset");
    return d;
  })
  .handler(async ({ data }) => { const { clipChunkOperation } = await import('./clips-operations.server'); return clipChunkOperation({ data }); });
