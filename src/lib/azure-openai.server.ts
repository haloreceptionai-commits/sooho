/** Shared server-only transport for the owner's Azure OpenAI resource. */
export function azureOpenAIRequest(path: string, body: unknown, multipart = false) {
  const key = process.env['AZURE_OPENAI_API_KEY'];
  if (!key) throw new Error('Azure OpenAI key is not configured');
  const endpoint = 'https://robiulalamsuleman-5258-resource.services.ai.azure.com';
  const headers: Record<string, string> = { 'api-key': key };
  if (!multipart) headers['Content-Type'] = 'application/json';
  return fetch(`${endpoint}/openai/deployments/${path}?api-version=2025-04-01-preview`, {
    method: 'POST', headers,
    body: multipart ? body as FormData : JSON.stringify(body),
  });
}
/** Newer Azure models (e.g. gpt-6.1-sol) reject reasoning effort "none"; use their lightest level instead. */
export const effortFor = (deployment: string, effort: string) => (effort === 'none' && !/^gpt-5(\b|[-.]|$)/i.test(deployment) && !/^gpt-4/i.test(deployment) ? 'low' : effort);
