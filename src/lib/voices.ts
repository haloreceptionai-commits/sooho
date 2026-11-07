// Top male narrator voices for viral history storytelling.
export const VOICES = [
  { id: "onyx", name: "Onyx", persona: "The Documentary Baritone", desc: "Deep, confident and fast — the classic viral history storyteller.", sample: "The rails were perfect. And that is exactly why they failed." },
  { id: "ash", name: "Ash", persona: "The Gritty Storyteller", desc: "Raspy and intimate — feels like a secret being told.", sample: "Nobody wrote it down. Because nobody believed it mattered." },
  { id: "ballad", name: "Ballad", persona: "The Epic Narrator", desc: "Dramatic, emotional, cinematic weight for climaxes.", sample: "Then the storm came. And the empire held its breath." },
  { id: "echo", name: "Echo", persona: "The Calm Historian", desc: "Warm and measured — great for long-form documentaries.", sample: "For a thousand years, the walls had never fallen." },
  { id: "verse", name: "Verse", persona: "The Shorts Hype Voice", desc: "Bright, curious, rapid-fire — built for fast vertical Shorts.", sample: "This tiny jar warned an entire empire. Here's how." },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];
