import { afterEach, describe, expect, it, vi } from 'vitest';
import { startUpload, type UploadMeta } from '@/lib/youtube.server';
import { automationUploadTiming } from '@/lib/automation';

afterEach(() => vi.unstubAllGlobals());
function uploadApi() {
  const request = vi.fn(async (_url: string, _init: RequestInit) => new Response('', { status: 200, headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test-only' } }));
  vi.stubGlobal('fetch', request);
  return request;
}
const meta: UploadMeta = { title: 'Test documentary', description: '', tags: ['history'], privacy: 'private', short: false, size: 1048576, mime: 'video/mp4', origin: 'https://sooha.io' };
describe('automation YouTube publication contract', () => {
  it('sends private verification videos without a future public release time', async () => {
    const request = uploadApi();
    await startUpload('test-only-access', { ...meta, ...automationUploadTiming(true, '2099-01-01T18:00:00Z') });
    const init = request.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as { status: { privacyStatus: string; publishAt?: string } };
    expect(body.status.privacyStatus).toBe('private');
    expect(body.status.publishAt).toBeUndefined();
  });
  it('sends normal daily videos with the exact chosen future YouTube publication time', async () => {
    const request = uploadApi();
    await startUpload('test-only-access', { ...meta, ...automationUploadTiming(false, '2099-01-01T18:00:00Z') });
    const init = request.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as { status: { privacyStatus: string; publishAt?: string } };
    expect(body.status.privacyStatus).toBe('private');
    expect(body.status.publishAt).toBe('2099-01-01T18:00:00Z');
  });
});