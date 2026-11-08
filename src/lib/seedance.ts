import type { PlanScene } from "@/lib/pipeline.functions";

export const SEEDANCE_CREDITS_PER_SECOND = 0.9248;
export function seedanceEstimate(seconds: number) {
  return Math.ceil(seconds * SEEDANCE_CREDITS_PER_SECOND);
}

/** Short scene groups preserve literal actions without a long, muddled generation. */
export function seedanceRuns(scenes: PlanScene[]) {
  const runs: { scenes: number[]; seconds: number; prompt: string }[] = [];
  let indices: number[] = [], duration = 0;
  const finish = () => {
    if (!indices.length) return;
    const seconds = Math.max(4, Math.min(12, Math.ceil(duration)));
    const moments = indices.map((i, k) => {
      const sc = scenes[i];
      if (!sc) return "";
      return `Shot ${k + 1}: ${sc.image_prompt}. Physical action to show literally: ${sc.narration}. Camera: ${sc.camera}.`;
    }).join(" ");
    runs.push({ scenes: indices, seconds, prompt: `Animate the supplied first frame, preserving the same characters, clothing and environment. Stylized cartoon animation with simple expressive round faces, bold clean outlines, vivid colors, dimensional environments, soft bright lighting. Real full-body acting, hands interacting with props, secondary motion in clothes, fluid water and believable physical contact. Not a still-image slideshow or zoom on a frozen picture. Use quick motivated cuts between the following moments, one clear action per shot. ${moments} Keep subjects visible and hands anatomically coherent. No captions, logos, dialogue, narration or music; silent video. Do not introduce unrelated people or events.` });
    indices = []; duration = 0;
  };
  scenes.forEach((sc, i) => {
    const d = sc.narration.trim().split(/\s+/).length * 60 / 153;
    if (indices.length && duration + d > 10) finish();
    indices.push(i); duration += d;
  });
  finish();
  return runs;
}

export function seedanceBody(prompt: string, image: string, seconds: number, portrait: boolean) {
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 30) throw new Error("Seedance duration must be 4–30 seconds");
  return {
    model: "bytedance/seedance-2.5",
    input: { prompt, image: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`, duration: seconds,
      resolution: "720p", aspect_ratio: "adaptive", generate_audio: false, output_format: "mp4" },
  };
}