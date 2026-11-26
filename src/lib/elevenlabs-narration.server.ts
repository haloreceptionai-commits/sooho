import { SHORT_VOICE_ID, SHORT_VOICE_SETTINGS } from './narration-direction';

/** Called only behind the existing owner session or fenced generation capability. */
export async function generateElevenLabsNarration(text: string): Promise<ArrayBuffer> {
  if (!text.trim() || text.length > 4000) throw new Error('Narration text must be 1–4000 characters');
  const key = process.env['ELEVENLABS_API_KEY'];
  if (!key) throw new Error('Connect ElevenLabs before creating Shorts narration.');
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${SHORT_VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: SHORT_VOICE_SETTINGS }),
  });
  if (!response.ok) {
    // Redact the credential even if an upstream failure ever echoes a request header.
    const detail = (await response.text()).split(key).join('[redacted]');
    console.error(`ElevenLabs narration failed [${response.status}]: ${detail}`);
    throw new Error(`ElevenLabs narration failed [${response.status}]: ${detail}`);
  }
  const audio = await response.arrayBuffer();
  if (!audio.byteLength) throw new Error('ElevenLabs returned empty narration audio.');
  return audio;
}