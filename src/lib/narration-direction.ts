/** Delivery changes never change the selected voice or narration words. */
export const LONG_NARRATION_DIRECTION = "A deep, warm, experienced documentary narrator telling a true history story to an adult audience, the way a great history programme sounds. Unhurried and authoritative, about 128 words per minute, with a low, steady, resonant voice and gentle pitch movement. Tell it as a story: set the scene in one clear breath, then carry the listener forward with patient momentum. Lean into the human detail and the cause and consequence behind each event, and say why it matters. Pause for a beat before a turning point and after a key date or name, so the listener can picture it. Let the big moments land with quiet weight, never hype or shouting. No exclamations, no fake excitement, no whispering, no sensational or mysterious tone, no playful asides. Plain, precise, respectful English; every word clear and fully pronounced.";

export const SHORT_NARRATION_DIRECTION = "Keep the Puck male narrator identity. Clear everyday English, a close microphone sound, no reverb. Read exactly the supplied narration, no added words. One coherent story with connected phrases, crisp consonants and audible small connecting words. No greetings, character impressions, shouting or whispering. Do not imitate any named person.\nClear, confident and energetic but unhurried: a natural speaking pace of about 160 words per minute, never rushed. Give every word room, take a short natural pause between sentences and a slightly slower beat on numbers and names. Strong concrete nouns and verbs, smoothly linked sentences, controlled pitch. A small contrast on But and a clean firm conclusion. No theatrical drama.";

/** Documentary chapters are read the way their music feels ("long:suspense"): the voice, the words and the take boundaries never change, only the delivery notes. */
export const CHAPTER_DELIVERY: Record<string, string> = {
  suspense: " For this passage: quieter and more deliberate; slow the pace a little, leave a clear pause before the turning point, then state the fact plainly.",
  epic: " For this passage: broader and fuller, a steady rise in weight; give the big dates and numbers room, landing each one clearly.",
  sad: " For this passage: soft, slow and restrained; let the loss sit in the pauses, without melodrama.",
  lofi: " For this passage: relaxed and conversational, like a historian explaining something to an interested listener.",
};

export function narrationSettings(style: string, text: string) {
  const long = style === "long" || style.startsWith("long:");
  const direction = long ? LONG_NARRATION_DIRECTION + (CHAPTER_DELIVERY[style.slice(5)] ?? "") : SHORT_NARRATION_DIRECTION;
  return {
    voice: long ? "Charon" : "Puck",
    text: long
      ? `${direction}: Read the following narration aloud, word for word. Narration: ${text}`
      : `${direction}\nNarration to read word for word:\n${text}`,
  };
}