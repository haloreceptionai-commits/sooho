import { afterEach, describe, expect, it, vi } from 'vitest';
import { azureOpenAIRequest } from '../lib/azure-openai.server';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('direct Azure transport', () => {
  it('sends JSON to the provided Azure resource, not the old connector', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-only-key');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    await azureOpenAIRequest('gpt-5/chat/completions', { messages: [] });
    expect(fetcher).toHaveBeenCalledWith('https://robiulalamsuleman-5258-resource.services.ai.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-04-01-preview', {
      method: 'POST', headers: { 'api-key': 'test-only-key', 'Content-Type': 'application/json' }, body: '{"messages":[]}',
    });
  });
  it('preserves multipart uploads without overriding their boundary', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-only-key');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const form = new FormData(); form.append('prompt', 'test');
    await azureOpenAIRequest('gpt-image-1-mini/images/edits', form, true);
    expect(fetcher.mock.calls[0]?.[1]).toEqual({ method: 'POST', headers: { 'api-key': 'test-only-key' }, body: form });
  });
  it('fails before a request when the Azure credential is absent', () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(() => azureOpenAIRequest('gpt-5/chat/completions', {})).toThrow('Azure OpenAI key is not configured');
    expect(fetcher).not.toHaveBeenCalled();
  });
});