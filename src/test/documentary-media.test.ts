import { describe, expect, it, vi } from 'vitest';
import { documentaryMediaPaths } from '@/lib/documentary/media-paths';
import { validRenderAssets } from '@/lib/hosted-render';
import { documentaryInput } from '@/lib/documentary/documentary-submit.server';
import type { Database, Json } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('documentary media grants', () => {
  const base = 'owner/video/media/';
  const doc = { images: [base + 'scene.jpg'], cutouts: [base + 'cast.png'], voice: [{ path: base + 'voice.wav' }] };
  it('includes and deduplicates every worker-read file', () => {
    expect(documentaryMediaPaths({ ...doc, images: [...doc.images, ...doc.images] })).toEqual([base + 'scene.jpg', base + 'cast.png', base + 'voice.wav']);
    expect(documentaryMediaPaths({ images: doc.images, voice: doc.voice })).toEqual([base + 'scene.jpg', base + 'voice.wav']);
  });
  it('rejects a cutout outside the owned video', () => {
    expect(validRenderAssets('owner', 'video', documentaryMediaPaths({ ...doc, cutouts: ['other/video/media/cast.png'] }))).toBe(false);
  });
  it('signs character cutouts on both initial start and recovery', async () => {
    const createSignedUrl = vi.fn(async (p: string) => ({ data: { signedUrl: `https://example.test/${p}` }, error: null }));
    const createSignedUploadUrl = vi.fn(async () => ({ data: { signedUrl: 'https://example.test/output' }, error: null }));
    const db = { storage: { from: () => ({ createSignedUrl, createSignedUploadUrl }) } } as unknown as SupabaseClient<Database>;
    const job = { id: 'job', user_id: 'owner', video_id: 'video', manifest: { kind: 'documentary', doc } as unknown as Json, output_path: 'owner/video/output.mp4' };
    for (const token of ['initial', 'recovery']) {
      const input = await documentaryInput(db, job, token);
      expect(Object.keys(input.signed)).toEqual(documentaryMediaPaths(doc));
      expect(input.signed[base + 'cast.png']).toBe('https://example.test/owner/video/media/cast.png');
    }
    expect(createSignedUrl).toHaveBeenCalledTimes(6);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(2);
  });
});