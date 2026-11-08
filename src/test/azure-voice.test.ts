import { describe, expect, it, vi } from 'vitest';
import { requestAzureVoice } from '@/lib/azure-voice';

describe('Owner Azure narration', () => {
  it('uses the configured Azure deployment and requests WAV audio', async () => {
    const bytes = new Uint8Array(44);
    bytes.set(new TextEncoder().encode('RIFF'), 0);
    bytes.set(new TextEncoder().encode('WAVE'), 8);
    const call = vi.fn().mockResolvedValue(new Response(bytes));
    await requestAzureVoice({ text: 'Test narration.', voice: 'onyx', deployment: 'my-azure-tts', style: 'long' }, call);
    expect(call).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledWith('my-azure-tts/audio/speech', expect.objectContaining({ model: 'my-azure-tts', input: 'Test narration.', voice: 'onyx', response_format: 'wav' }));
  });
  it('fails without another-provider fallback when Azure rejects the model', async () => {
    const call = vi.fn().mockResolvedValue(new Response('{"error":{"code":"OperationNotSupported"}}', { status: 400 }));
    await expect(requestAzureVoice({ text: 'Test.', voice: 'onyx', deployment: 'gpt-realtime', style: 'short' }, call)).rejects.toThrow('No other voice provider was used');
    expect(call).toHaveBeenCalledOnce();
  });
  it('rejects non-WAV output before it can be saved as narration', async () => {
    await expect(requestAzureVoice({ text: 'Test.', voice: 'onyx', deployment: 'tts', style: 'short' }, async () => new Response('not audio'))).rejects.toThrow('valid WAV');
  });
});