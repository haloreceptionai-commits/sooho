// Visual styles and the art-direction text sent with every image prompt.
export const STYLE_ANCHORS: Record<string, string> = {
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
export const styleAnchor = (s: string) => STYLE_ANCHORS[s] ?? STYLE_ANCHORS[DEFAULT_STYLE]!;
