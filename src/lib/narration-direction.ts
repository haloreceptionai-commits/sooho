/** Delivery changes never change the selected voice or narration words. */
export const LONG_NARRATION_DIRECTION = "Keep the Charon male narrator identity: a deep, warm, resonant lower register, close and clear with no reverb. Tell a fascinating true history story to one interested listener, not a rapid Shorts explainer or a formal news bulletin. Read only the supplied narration word for word; never add explanations, dialogue, facts or sounds. Aim for about 142 words per minute overall, with natural variation rather than a fixed metronome. Sound genuinely absorbed in the history: thoughtful curiosity, restrained intrigue and emotional weight, never sleepy or flat. Connect phrases into flowing story arcs instead of punching every sentence like a short-video hook. Let scene-setting passages breathe; build patient momentum through conflict, briefly pause before a revelation, then let its consequence land. Give names, dates and unfamiliar words clear articulation without pausing after every one. Express human stakes with subtle warmth, gravity for loss and quiet wonder for discoveries; use pitch and emphasis, not loudness or forced speed. Sustain this intimate storyteller delivery throughout every chapter. No hype, shouting, whispering, fake gravel, exaggerated trailer drama, character impressions or imitation of a named person.";

// Owner's saved "my voice v1", informational delivery. No prompt text is spoken.
export const SHORT_VOICE_ID = '0QHpDjMRrhedmdJmEcp7';
export const SHORT_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true } as const;

/** Documentary chapters are read the way their music feels ("long:suspense"): the voice, the words and the take boundaries never change, only the delivery notes. */
export const CHAPTER_DELIVERY: Record<string, string> = {
  suspense: " For this passage: quieter and more deliberate but still engaged and fully voiced; build intrigued anticipation, leave a brief pause before the turning point, then land the revelation clearly. Never whisper or become sleepy.",
  epic: " For this passage: broader and fuller, a steady rise in weight; give the big dates and numbers room, landing each one clearly.",
  sad: " For this passage: soft, slow and restrained; let the loss sit in the pauses, without melodrama.",
  lofi: " For this passage: relaxed and conversational, like a historian explaining something to an interested listener.",
};

export function narrationSettings(style: string, text: string) {
  const long = style === "long" || style.startsWith("long:");
  const direction = LONG_NARRATION_DIRECTION + (CHAPTER_DELIVERY[style.slice(5)] ?? "");
  return {
    provider: long ? 'lovable' as const : 'elevenlabs' as const,
    voice: long ? "Charon" : SHORT_VOICE_ID,
    text: long
      ? `${direction}: Read the following narration aloud, word for word. Narration: ${text}`
      : text,
  };
}