import { it, expect } from 'vitest';
import { pathAt, cameraAt, actorIdle } from '../../hosted-renderer/cartoon/motion.mjs';
it('keeps camera paths finite at repeated endpoint knots', () => {
  const points = [[0, 0, 0], [1, 2, 0], [9, 2, 3]];
  expect(pathAt(points, 0)).toEqual(points[0]);
  expect(pathAt(points, 1)).toEqual(points[2]);
  expect(pathAt(points, 0.35).every(Number.isFinite)).toBe(true);
});
it('retains shadow metadata without unbounded FOV creep', () => {
  const keys = [{ frame: 0, pos: [0, 0, 4], look: [0, 0, 0], fov: 40, shadowAt: [0, 1, 0] }, { frame: 30, pos: [0, 0, 2], look: [0, 0, 0], fov: 30 }];
  expect(cameraAt(keys, 15).shadowAt).toEqual([0, 1, 0]);
  expect(cameraAt(keys, 100000).fov).toBe(30);
  expect(() => cameraAt([{ frame: 0, pos: [0, 0, 4], look: [0, 0, 0], fov: 0 }], 0)).toThrow();
});
it('keeps each actor alive and deterministic', () => {
  expect(actorIdle(20, 1)).toEqual(actorIdle(20, 1));
  expect(actorIdle(20, 1)).not.toEqual(actorIdle(21, 1));
  expect(actorIdle(20, 1)).not.toEqual(actorIdle(20, 2));
});