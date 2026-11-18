/** Delivery changes never change the selected voice or narration words. */
export const LONG_NARRATION_DIRECTION = "An energetic, engaging male mystery storyteller uncovering a surprising true story with a curious friend. Clear and confident, around 142 words per minute. Bright vocal energy, lively pitch variation and forward momentum; intrigued questions, suspenseful emphasis on the key clue, a tiny anticipatory breath before the answer and genuine excitement at the reveal. Build tension through tone, not long silences. Sound curious and animated, never sleepy, flat, robotic, breathy or melodramatic. No shouting or whispering. Keep every word crisp and understandable";

export const SHORT_NARRATION_DIRECTION = "Keep the Puck male narrator identity. Clear everyday English, a close microphone sound, no reverb. Read exactly the supplied narration, no added words. One coherent story with connected phrases, crisp consonants and audible small connecting words. No greetings, character impressions, shouting or whispering. Do not imitate any named person.\nClear, confident and energetic but unhurried: a natural speaking pace of about 160 words per minute, never rushed. Give every word room, take a short natural pause between sentences and a slightly slower beat on numbers and names. Strong concrete nouns and verbs, smoothly linked sentences, controlled pitch. A small contrast on But and a clean firm conclusion. No theatrical drama.";

/** Documentary chapters are read the way their music feels ("long:suspense"): the voice, the words and the take boundaries never change, only the delivery notes. */
export const CHAPTER_DELIVERY: Record<string, string> = {
  suspense: " For this passage: hushed, close and intense, a little slower than usual; leave a tiny beat of silence before the key fact, then land it clearly.",
  epic: " For this passage: weight and momentum, building energy on action; firm, rising delivery; slow down and give the big numbers room.",
  sad: " For this passage: soft, slow and restrained; let the loss sit in the pauses; no melodrama.",
  lofi: " For this passage: relaxed, curious and conversational, like explaining something fascinating to a friend.",
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