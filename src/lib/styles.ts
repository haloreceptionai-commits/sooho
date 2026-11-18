// Visual styles and the art-direction text sent with every image prompt.
// The recurring long-form explainer hero: identical in every picture so the story reads as one character.
export const INK_HERO = "the hero: a simple stick-figure man with a large perfectly round plain white head, two small black dot eyes, small simple eyebrows and mouth, no nose, no hair, thin black stick arms and legs, wearing a plain bright blue crew-neck t-shirt and blue jeans with white sneakers";

export const STYLE_ANCHORS: Record<string, string> = {
  "Flat 2D history cartoon":
    "Flat 2D animated history-explainer illustration, like the popular animated history channels: clean vector shapes with no outlines or only thin ones, solid flat colours with very little shading, a soft muted palette (sage greens, dusty blues, sandy browns, warm reds, cream), simple staged sets with props, flags, furniture and buildings, round-faced human cartoon characters with small dot eyes, tiny mouths and simple hands wearing accurate period clothing, uniforms and hats, simple clear layered backgrounds (hills, sky, rooms, streets), storybook composition, wide or medium shot, evenly lit. Not photoreal, not 3D, not a stick figure, no text or lettering in the picture",
  "Ink explainer":
    `Hand-drawn 2D cartoon explainer illustration (whiteboard-comic look): clean confident black ink outlines of even medium weight, flat matte colour fills with very light soft shading, muted warm palette (cream walls, soft greys, sandy browns, gentle greens and sky blues), simple uncluttered backgrounds with a few readable props, expressive minimal stick-figure characters with big round heads and exaggerated reactions. When the story includes ${INK_HERO}, draw him exactly that way. People from other eras are drawn in the same stick-figure style with period clothing (furs, robes, armour). Strictly 2D, no 3D render, no gradients, no photorealism, no text, no letters, no watermark or logo`,
  "3D animated cartoon":
    "Stylized 3D animated film still in the style of viral explainer Shorts (Zack D. Films look): clay-like semi-realistic 3D characters with expressive, slightly exaggerated faces and big readable emotions, smooth soft materials, bright high-key cinematic lighting with vivid saturated colors (even at night: luminous moonlight blues, glowing highlights), clean readable silhouettes, shallow depth of field, rich saturated color with strong contrast, dynamic camera angle, crisp detail. Not photoreal, not 2D",
  "Oil painting": "Dramatic museum-quality oil painting, visible brushwork, chiaroscuro lighting, rich pigments, cinematic composition",
  "Cinematic photoreal": "Cinematic photoreal film still, anamorphic lens, dramatic lighting, shallow depth of field, period-accurate detail",
  Chiaroscuro: "Baroque chiaroscuro painting, deep black shadows, single warm light source, Caravaggio mood",
  Fresco: "Ancient fresco mural style, earthy pigments, aged plaster texture, epic composition",
  "Parchment ink": "Ink and wash illustration on aged parchment, sepia tones, hand-drawn hatching",
  "Blueprint sepia": "Vintage engineering blueprint and sepia technical illustration, precise linework, aged paper",
};

export const STYLES = Object.keys(STYLE_ANCHORS);
export const DEFAULT_STYLE = "3D animated cartoon";
/** Long-form history videos open on the flat 2D look (Shorts keep the 3D default). */
export const LONG_DEFAULT_STYLE = "Flat 2D history cartoon";
export const styleAnchor = (s: string) => STYLE_ANCHORS[s] ?? STYLE_ANCHORS[DEFAULT_STYLE]!;
