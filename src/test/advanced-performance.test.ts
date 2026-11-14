import { describe, it, expect } from 'vitest';
import { performanceAt, solveArm, wristWorld } from '../../hosted-renderer/cartoon/performance.mjs';
describe('Advanced articulated contact clock',()=>{
  it('keeps both arm segments at their fixed lengths',()=>{
    const a=solveArm([0,0],[120,90]);
    expect(Math.hypot(...a.elbow)).toBeCloseTo(112,5);
    expect(Math.hypot(a.wrist[0]-a.elbow[0],a.wrist[1]-a.elbow[1])).toBeCloseTo(108,5);
  });
  it('puts recoil after contact, not before the spoken shot',()=>{
    const aim=performanceAt('aim',48,0,100,48),fire=performanceAt('fire',48,0,100,48);
    expect(aim.right.wrist[0]-fire.right.wrist[0]).toBeCloseTo(20,1);
    expect(performanceAt('fire',47,0,100,48).state).toBe('anticipation');
  });
  it('attaches a held tool to the same wrist anchor',()=>{
    expect(wristWorld([0,0,0],[300,975])).toEqual([0,0,.06]);
    expect(wristWorld([1,0,0],[400,575],true)).toEqual([.775,.9,.06]);
  });
  it('releases a throw only on contact and moves the object thereafter',()=>{
    expect(performanceAt('throw',29,0,90,30).released).toBe(false);
    expect(performanceAt('throw',30,0,90,30).released).toBe(true);
    expect(performanceAt('throw',70,0,90,30).object[0]).toBeGreaterThan(performanceAt('throw',30,0,90,30).object[0]);
  });
});