import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateElevenLabsNarration } from '@/lib/elevenlabs-narration.server';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('saved Shorts voice transport', () => {
  it('requests exact narration with my voice v1 and returns unchanged audio bytes', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-only');
    const request = vi.fn(async (_url: string, _init: RequestInit) => new Response(new Uint8Array([73, 68, 51, 1])));
    vi.stubGlobal('fetch', request);
    expect(new Uint8Array(await generateElevenLabsNarration('Hannibal lit the torches.'))).toEqual(new Uint8Array([73, 68, 51, 1]));
    const call = request.mock.calls[0];
    expect(call?.[0]).toBe('https://api.elevenlabs.io/v1/text-to-speech/0QHpDjMRrhedmdJmEcp7?output_format=mp3_44100_128');
    expect(JSON.parse(String(call?.[1].body))).toEqual({ text: 'Hannibal lit the torches.', model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true } });
  });
  it('does not spend or switch narrators when ElevenLabs is not connected', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(generateElevenLabsNarration('Hannibal lit the torches.')).rejects.toThrow('Connect ElevenLabs');
    expect(request).not.toHaveBeenCalled();
  });
  it('surfaces provider failure without a second paid request or narrator fallback', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-only');
    const request = vi.fn(async () => new Response('quota_exceeded', { status: 402 }));
    vi.stubGlobal('fetch', request); vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(generateElevenLabsNarration('Hannibal lit the torches.')).rejects.toThrow('[402]: quota_exceeded');
    expect(request).toHaveBeenCalledTimes(1);
  });
});