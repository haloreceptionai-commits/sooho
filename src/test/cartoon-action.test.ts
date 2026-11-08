import { expect, it } from 'vitest';
import { actionState } from '../../hosted-renderer/cartoon/action.mjs';
it('uses deterministic bounded action progress with anticipation before motion',()=>{
  expect(actionState('pour',0,0,60).progress).toBe(0);
  expect(actionState('pour',5,0,60).progress).toBe(0);
  expect(actionState('pour',35,0,60).progress).toBeGreaterThan(.5);
  expect(actionState('pour',59,0,60).progress).toBeLessThanOrEqual(1);
  expect(actionState('pour',35,0,60)).toEqual(actionState('pour',35,0,60));
});