export interface AzureVoiceInput { text: string; voice: string; deployment: string; style: string }

export function azureVoiceRequest(input: AzureVoiceInput) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.deployment)) throw new Error('Invalid Azure narration deployment name');
  const instructions = input.style === 'long'
    ? 'Read the narration word for word as a calm, warm, clear documentary storyteller. Natural pace, gentle curiosity, never rushed or sleepy.'
    : 'Read the narration word for word as a clear energetic male storyteller sharing a fascinating fact. Balanced curiosity, crisp words, natural pauses, never shouting or rushing.';
  return {
    path: `${input.deployment}/audio/speech`,
    body: { model: input.deployment, input: input.text, voice: input.voice, response_format: 'wav', instructions },
  };
}

export async function requestAzureVoice(input: AzureVoiceInput, call: (path: string, body: unknown) => Promise<Response>): Promise<ArrayBuffer> {
  const request = azureVoiceRequest(input);
  const response = await call(request.path, request.body);
  if (!response.ok) {
    const body = await response.text();
    console.error(`Azure narration failed [${response.status}]: ${body}`);
    const hint = /OperationNotSupported|operation is unsupported|DeploymentNotFound/i.test(body)
      ? ' Configure a deployed Azure text-to-speech model (for example gpt-4o-mini-tts) in Settings → Voice & Narration. The gpt-realtime model requires a different realtime interface. No other voice provider was used.' : '';
    throw new Error(`Azure narration failed [${response.status}]: ${body}${hint}`);
  }
  const audio = await response.arrayBuffer();
  const bytes = new Uint8Array(audio);
  const signature = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length < 44 || signature(0, 4) !== 'RIFF' || signature(8, 12) !== 'WAVE') throw new Error('Azure narration did not return a valid WAV file');
  return audio;
}