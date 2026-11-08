import type { FactSheet, Plan } from '@/lib/pipeline.functions';
import { WPS, wc } from '@/lib/story-v2';
import { styleAnchor } from '@/lib/styles';

export function scriptTimeline(plan: Plan) {
  let elapsed = 0;
  return plan.scenes.map((scene, i) => {
    const start = elapsed;
    elapsed += wc(scene.narration) / WPS;
    return { ...scene, index: i + 1, start, end: elapsed };
  });
}

export function motionPrompt(plan: Plan, scene: Plan['scenes'][number], style: string, format: 'short' | 'long') {
  const cast = plan.characters.filter(c => scene.characters.includes(c.name)).map(c => `${c.name}: ${c.look}`).join('; ');
  return `${format === 'short' ? 'Vertical 9:16' : 'Landscape 16:9'}. ${styleAnchor(style)}. Bright, airy exposure, readable action, soft shadows. ${scene.image_prompt} Cast continuity: ${cast || 'Use the established setting; no new cast'}. Animate the exact narrated action: ${scene.narration} Camera: ${scene.camera.replaceAll('_', ' ')}; ${scene.angle.replaceAll('_', ' ')} ${scene.shot} shot. Continuous natural body and prop movement, expressive reactions, consistent faces and clothing, physically plausible motion. No baked-in captions, text, logos or narration; add audio and captions separately.`;
}

export function scriptExport(plan: Plan, facts: FactSheet, style: string, format: 'short' | 'long', score: number, blockers: string[]) {
  return [
    `# ${plan.title}`, plan.description,
    `\n## Story\n${plan.premise}\nQuestion: ${plan.question}\nHero: ${plan.hero.name} — ${plan.hero.want}`,
    `\n## Review\n${score}/100 — ${score >= 85 ? 'Score meets threshold; review notes below' : 'Not ready'}\n${blockers.join('\n') || 'No flagged issues'}`,
    `\n## Narration\n${plan.scenes.map(s => s.narration).join(' ')}`,
    '\n## Voice & edit direction\nAtlas: deep, energetic male storyteller, clear and curious, like sharing an exciting secret. Approximately 153 words/minute; a brief pause before the reveal. Scene timings below are narration estimates, not audio alignment. Smooth cuts around 3 seconds; white captions with yellow keywords, strong outline. Tense music under speech, lighter at reveal. Sync foley to spoken action words.',
    `\n## Visual continuity\n${styleAnchor(style)}\nPalette: ${plan.palette}\n${plan.characters.map(c => `${c.name} (${c.role}): ${c.look}`).join('\n')}`,
    `\n## Beat sheet\n${plan.beats.map(b => `${b.start_s}–${b.end_s}s | ${b.beat} | ${b.purpose}\nVisual: ${b.visual}\nCamera: ${b.camera_move}`).join('\n\n')}`,
    '\n## Scene-by-scene production',
    ...scriptTimeline(plan).map(s => `\n### Scene ${s.index} | ${s.start.toFixed(1)}–${s.end.toFixed(1)}s | ${s.beat}\nNarration: ${s.narration}\nImage prompt: ${s.image_prompt}\nMotion prompt: ${motionPrompt(plan, s, style, format)}\nSound: ${s.sfx}\nMusic: ${s.mood}\nPurpose: ${s.purpose}`),
    `\n## Opening & closing\nHook caption: ${plan.hookText}\nClosing line: ${plan.loopLine}`,
    `\n## Research references — verify before publishing\n${facts.claims.map(c => `- ${c.claim} (${c.date}; ${c.confidence} confidence)\n  ${c.sources.join('; ')}`).join('\n')}\nMyth: ${facts.myth}\nReality: ${facts.reality}\n${facts.hedge}`,
  ].join('\n');
}