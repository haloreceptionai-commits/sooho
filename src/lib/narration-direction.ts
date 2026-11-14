/** Delivery changes never change the selected voice or narration words. */
export const LONG_NARRATION_DIRECTION = "An energetic, engaging male mystery storyteller uncovering a surprising true story with a curious friend. Clear and confident, around 142 words per minute. Bright vocal energy, lively pitch variation and forward momentum; intrigued questions, suspenseful emphasis on the key clue, a tiny anticipatory breath before the answer and genuine excitement at the reveal. Build tension through tone, not long silences. Sound curious and animated, never sleepy, flat, robotic, breathy or melodramatic. No shouting or whispering. Keep every word crisp and understandable";

export const SHORT_NARRATION_DIRECTION = "Keep the Puck male narrator identity. Clear everyday English, a close microphone sound, no reverb. Read exactly the supplied narration, no added words. One coherent story with connected phrases, crisp consonants and audible small connecting words. No greetings, character impressions, shouting or whispering. Do not imitate any named person.\nEnergetic compact explanation around 225 words per minute if all words remain clear. Quick light connecting words, strong concrete nouns and verbs. Minimal dead space, smoothly linked sentences, controlled pitch. A small contrast on But and a clean firm conclusion. No theatrical drama.";

export function narrationSettings(style: string, text: string) {
  const long = style === "long";
  const direction = long ? LONG_NARRATION_DIRECTION : SHORT_NARRATION_DIRECTION;
  return {
    voice: long ? "Charon" : "Puck",
    text: long
      ? `${direction}: Read the following narration aloud, word for word. Narration: ${text}`
      : `${direction}\nNarration to read word for word:\n${text}`,
  };
}