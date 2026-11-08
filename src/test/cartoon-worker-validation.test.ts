import { expect,it } from 'vitest';
import { validateManifest } from '../../hosted-renderer/cartoon/validate-manifest.mjs';
const fixture=()=>({version:'cartoon-v1',fps:30,width:1080,height:1920,captions:false,narration:{samples:48000,rate:48000,sha256:'a'.repeat(64)},cast:[{id:'hero',seed:3,outfit:'sailor'}],words:[{start:.1,end:.4,confidence:.99}],shots:[{start:0,end:30,world:'ship',light:'day',actors:[{id:'hero',pos:[0,0,0],action:'pour'}],camera:[{frame:0,pos:[0,1,4],look:[0,1,0],fov:40}],events:[]}]});
it('rejects a gap before any worker preparation',()=>{
  const f=fixture();const s=f.shots[0];if(!s)throw Error('fixture');s.start=1;
  expect(()=>validateManifest(f)).toThrow('continuously');
});
it('rejects unsupported outfits before drawing',()=>{
  const f=fixture();const c=f.cast[0];if(!c)throw Error('fixture');c.outfit='unknown';
  expect(()=>validateManifest(f)).toThrow('cast');
});
it('accepts physical pour and rejects requested captions until implemented',()=>{
  const f=fixture();expect(validateManifest(f)).toBe(f);f.captions=true;
  expect(()=>validateManifest(f)).toThrow('Caption');
});