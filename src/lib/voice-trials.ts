import atlasAudio from "@/assets/voice-trials/atlas.mp3.asset.json";
import rowanAudio from "@/assets/voice-trials/rowan.mp3.asset.json";
import ellisAudio from "@/assets/voice-trials/ellis.mp3.asset.json";
import griffinAudio from "@/assets/voice-trials/griffin.mp3.asset.json";
import miloAudio from "@/assets/voice-trials/milo.mp3.asset.json";

// Trial profiles only: do not connect to the video pipeline until a voice is chosen.
export const VOICE_TRIAL_TEXT = "A sailor pours cooking oil into the sea. Behind him, a pirate ship is getting closer. His captain grabs his shoulder. We're about to be boarded, and you're making soup? But the sailor points at the storm. Trust the oil. Ahead, a wave rises higher than the mast. The captain thinks they've made a terrible mistake. But there's something he doesn't know. A thin layer of oil can calm the breaking waves. And the sailor has been pouring it exactly where the wind hits the water.";

export const VOICE_TRIALS = [
  { ...{"id": "atlas", "name": "Atlas", "voice": "Charon", "targetWpm": 175, "tone": "Deep & deliberate", "direction": "A grounded low male baritone. Intimate documentary storytelling, warm resonance, deliberate consonants, a tiny pause after the hook. Build suspense with quiet emphasis, not volume or speed.", "duration": 38.51, "measuredWpm": 134, "model": "google/gemini-3.1-flash-tts-preview"}, audioUrl: atlasAudio.url },
  { ...{"id": "rowan", "name": "Rowan", "voice": "Iapetus", "targetWpm": 185, "tone": "Warm & curious", "direction": "A warm male storyteller. Conversational and naturally curious, bright but never rushed. Clearly separate each word. Lift pitch slightly on the question, soften the reveal.", "duration": 39.34, "measuredWpm": 131, "model": "google/gemini-3.1-flash-tts-preview"}, audioUrl: rowanAudio.url },
  { ...{"id": "ellis", "name": "Ellis", "voice": "Orus", "targetWpm": 180, "tone": "Calm & precise", "direction": "A confident calm male historian. Exceptionally crisp diction, smooth measured phrasing. Tension comes from controlled pauses and subtle emphasis. Avoid theatrical growling.", "duration": 34.96, "measuredWpm": 148, "model": "google/gemini-3.1-flash-tts-preview"}, audioUrl: ellisAudio.url },
  { ...{"id": "griffin", "name": "Griffin", "voice": "Fenrir", "targetWpm": 190, "tone": "Dramatic & controlled", "direction": "An expressive male storyteller with cinematic weight. Restrained energy, never a hype voice. Shape the rising threat and then a lighter explanatory reveal. Keep syllables clear.", "duration": 36.15, "measuredWpm": 143, "model": "google/gemini-3.1-flash-tts-preview"}, audioUrl: griffinAudio.url },
  { ...{"id": "milo", "name": "Milo", "voice": "Alnilam", "targetWpm": 170, "tone": "Low & intimate", "direction": "A low, rounded male narrator sharing a surprising secret. Gentle curiosity, relaxed breath, clear clean consonants. Small suspenseful pauses before key facts, no whispering.", "duration": 38.67, "measuredWpm": 133, "model": "google/gemini-3.1-flash-tts-preview"}, audioUrl: miloAudio.url }
] as const;
