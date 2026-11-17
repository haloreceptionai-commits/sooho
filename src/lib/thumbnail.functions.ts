import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const text = (n: number) => z.string().trim().min(1).max(n);

export const generateThumbnail = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { subject: string; region: string; figure: string; deployment: string; variant: number }) =>
    z.object({ subject: text(80), region: text(80), figure: text(160), deployment: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/), variant: z.number().int().min(0).max(5) }).parse(d))
  .handler(async ({ data }) => {
    const { thumbnailImageOperation } = await import('./pipeline-operations.server');
    return thumbnailImageOperation(data);
  });

/** Sets the custom thumbnail on an uploaded video (YouTube requires a verified channel for this). */
export const youtubeSetThumbnail = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { videoId: string; jpeg: string; workspaceId: string }) => z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/), jpeg: z.string().min(100).max(2_800_000), workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: conn } = await supabaseAdmin.from('youtube_connections').select('refresh_token').eq('user_id', context.userId).eq('workspace_id', data.workspaceId).maybeSingle();
    if (!conn) throw new Error('Connect this workspace\'s YouTube channel in Settings first');
    const yt = await import('./youtube.server');
    const access = await yt.refreshAccess(conn.refresh_token);
    const bin = Uint8Array.from(atob(data.jpeg), c => c.charCodeAt(0));
    if (bin.length > 2 * 1024 * 1024) throw new Error('Thumbnail must be under 2 MB');
    const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${data.videoId}`, { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'image/jpeg' }, body: bin });
    if (!res.ok) {
      const t = (await res.text()).slice(0, 300);
      throw new Error(res.status === 403 ? 'YouTube refused the custom thumbnail — the channel must be verified (youtube.com/verify) to use custom thumbnails.' : `Thumbnail upload failed [${res.status}]: ${t}`);
    }
    return { ok: true };
  });
