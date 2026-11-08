import { describe, it, expect } from 'vitest';
import { frameCount, frameRange, reactionFrame } from '../../hosted-renderer/cartoon/frame-contract.mjs';

describe('cartoon audio clock', () => {
  it('renders a sixty-second voice as exactly 1800 frames at 30 fps', () => {
    expect(frameCount(60)).toBe(1800);
    const frames = frameRange(0, 1799, 1800);
    expect(frames.length).toBe(1800);
    expect(frames[1799]).toBe(1799);
  });
  it('uses the specified rounded audio duration', () => expect(frameCount(19.72)).toBe(592));
  it('rejects invalid or out-of-range frames', () => {
    expect(() => frameRange(0, 1800, 1800)).toThrow();
    expect(() => frameRange(-1, 10, 1800)).toThrow();
    expect(() => frameCount(0)).toThrow();
  });
  it('places reactions zero to three frames ahead of the word', () => {
    expect(reactionFrame(2, 0, 1800)).toBe(60);
    expect(reactionFrame(2, 3, 1800)).toBe(57);
    expect(() => reactionFrame(2, 4, 1800)).toThrow();
  });
});