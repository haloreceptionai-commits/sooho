import { cameraAt, actorIdle } from './motion.js';
import { actionState } from './action.js';
import { LIGHTS } from './lights.js';
import manifest from './manifest.json' with { type: 'json' };

export const TOTAL = Math.round(manifest.narration.samples / 48000 * 30);
export const SHOTS = manifest.shots;
export const shotAt = f => {
  const shot = SHOTS.find(s => f >= s.start && f < s.end);
  if (!shot) throw Error('Frame outside scene timeline');
  return shot;
};
export { LIGHTS };
export const lightFor = s => {
  const light = LIGHTS[s.light];
  if (!light) throw Error('Unsupported light');
  return light;
};
export const camAt = f => {
  const shot = shotAt(f), c = cameraAt(shot.camera,f);
  // A bounded physical camera creep, not cumulative FOV mutation.
  c.pos = c.pos.map((v,i) => v + (i === 2 ? .005*Math.sin(f*.03) : 0));
  c.shadowAt = c.look;
  return c;
};
export const dofAt = f => {
  const c = camAt(f);
  const distance = Math.hypot(...c.pos.map((v,i)=>v-c.look[i]));
  return {focus: distance, cinf: distance < 6 ? 10 : 0, near:1};
};
export const worldAt = f => ({world:shotAt(f).world});
const outfits = {
  sailor: {tunic:'#386e9a',skin:'#f5c9a0',cap:'#eee8df',hair:'#392b26'},
  worker: {tunic:'#527e57',skin:'#f5c9a0',hair:'#392b26',apron:'#dfd8c7'},
  scholar: {tunic:'#d6e6ed',skin:'#c99067',hair:'#29252a',apron:'#eff4f1'},
};
const actions = new Set(['idle','walk','point','react','lift','pour']);
export const actorsAt = (f,T) => shotAt(f).actors.map(a => {
  const design = manifest.cast.find(c=>c.id===a.id);
  if (!design || !outfits[design.outfit]) throw Error('Unsupported cast design');
  if (!actions.has(a.action)) throw Error('Action requires an implemented prop attachment');
  const idle = actorIdle(f,design.seed), shot=shotAt(f);
  const t=(f-shot.start)/30;
  const walking = a.action==='walk';
  const step = walking ? Math.sin(t*8) : 0;
  const action=actionState(a.action,f,shot.start,shot.end);
  const opts={seed:design.seed,expr:a.expression,blink:(f+design.seed*13)%113<4?1:0,
    tilt:idle.tilt,headTilt:idle.headTilt,bob:idle.bob*5+(walking?.04*Math.abs(step):0),
    L:'hang',R:a.action==='point'?'point':a.action==='react'?'cheek':'hang',step,
    action:a.action,progress:action.progress,lift:action.lift,frame:f};
  const rounded=Object.fromEntries(Object.entries(opts).map(([k,v])=>[k,typeof v==='number'?Math.round(v*(k==='bob'?1000:20))/(k==='bob'?1000:20):v]));
  return {x:a.pos[0]+(walking?t*.35:0),y:a.pos[1],z:a.pos[2],key:JSON.stringify([design.id,rounded]),draw:p=>T.propCharacter(p,outfits[design.outfit],rounded)};
});
export const fxAt = () => [];