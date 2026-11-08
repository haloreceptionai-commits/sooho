export function frameCount(duration, fps = 30) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1200 || fps !== 30) throw new Error('Invalid audio clock');
  return Math.max(1, Math.round(duration * fps));
}

export function frameRange(from, to, total) {
  if (![from, to, total].every(Number.isSafeInteger) || total < 1 || from < 0 || to < from || to >= total) throw new Error('Invalid frame range');
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export function reactionFrame(wordStart, lead, total) {
  if (!Number.isFinite(wordStart) || wordStart < 0 || !Number.isInteger(lead) || lead < 0 || lead > 3) throw new Error('Reaction lead must be zero to three frames');
  const frame = Math.round(wordStart * 30) - lead;
  if (frame < 0 || frame >= total) throw new Error('Reaction falls outside the video');
  return frame;
}