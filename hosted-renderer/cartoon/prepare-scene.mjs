import { readFile,writeFile,cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateManifest, LIBRARY } from './validate-manifest.mjs';
import { mkdir } from 'node:fs/promises';
const root=path.dirname(fileURLToPath(import.meta.url));
const [input,destination]=process.argv.slice(2);
if(!input||!destination)throw Error('Manifest and scratch destination required');
const m=JSON.parse(await readFile(input,'utf8'));
validateManifest(m);
if(!['cartoon-v1','cartoon-v2'].includes(m.version)||m.fps!==30||!((m.width===1080&&m.height===1920)||(m.width===1920&&m.height===1080))||!m.shots?.length)throw Error('Invalid manifest');
const result=spawnSync(process.execPath,[path.join(root,'prepare.mjs'),destination],{stdio:'inherit'});
if(result.status!==0)throw Error('Pinned preparation failed');
const web=path.join(path.resolve(destination),'web');
const referenceStory=await readFile(path.join(root,'reference/example/story.js'),'utf8');
const lightStart=referenceStory.indexOf('export const LIGHTS =');
const lightEnd=referenceStory.indexOf('export const lightFor');
const lights=referenceStory.slice(lightStart,lightEnd)+`\nLIGHTS.night_bright={...LIGHTS.day,skyTop:'#597bad',skyHor:'#b5cce4',hemi:1.5,sunI:1.4};\n`;
await writeFile(path.join(web,'lights.js'),lights);
await cp(path.join(root,'motion.mjs'),path.join(web,'motion.js'));
await cp(path.join(root,'action.mjs'),path.join(web,'action.js'));
let cast=await readFile(path.join(web,'toon.js'),'utf8');
// Shorten the supplied exaggerated reach to keep hand-held props inside cards.
const reach='const lf = (opts.lift || 0) * 0.62 * HH; return { pts: [s, [X(42), s[1] - 0.12 * HH - lf * 0.6], [X(82), s[1] - 0.5 * HH - lf]], front: false };';
if(!cast.includes(reach))throw Error('Reach pose contract changed');
cast=cast.replace(reach,'const lf = (opts.lift || 0) * 0.15 * HH; return { pts: [s, [X(20), s[1] - 0.04 * HH - lf * 0.6], [X(35), s[1] - 0.1 * HH - lf]], front: false };');
await writeFile(path.join(web,'toon.js'),cast+'\n'+await readFile(path.join(root,'prop-cast.js'),'utf8')+'\n'+await readFile(path.join(root,'prop-art.js'),'utf8'));
await cp(path.join(root,'scene-story.mjs'),path.join(web,'story.js'));
await writeFile(path.join(web,'manifest.json'),JSON.stringify(m));
// Copy only the library objects this story uses (plus each pack's shared texture and licence).
const used=[...new Set(m.shots.flatMap(s=>(s.props||[]).filter(p=>p.kind==='asset').map(p=>p.asset)))].map(id=>LIBRARY.get(id));
for(const e of used){const dir=path.join(web,'assets',e.pack);await mkdir(dir,{recursive:true});const src=path.join(root,'assets/library',e.pack);
  await cp(path.join(src,e.type==='sprite'?e.id.split('/')[1]+'.png':e.id.split('/')[1]+'.glb'),path.join(dir,e.id.split('/')[1]+(e.type==='sprite'?'.png':'.glb')));
  await cp(path.join(src,'License.txt'),path.join(dir,'License.txt'));
  if(e.type==='model'){try{await cp(path.join(src,'Textures'),path.join(dir,'Textures'),{recursive:true});}catch{}}}
await writeFile(path.join(web,'library.json'),JSON.stringify(used));
let engine=await readFile(path.join(web,'main.js'),'utf8');
const worldStart=engine.indexOf('// ---------- world ----------');
const cardStart=engine.indexOf('// ---------- cards ----------');
const stateStart=engine.indexOf('function worldState(');
const drawStart=engine.indexOf('function drawActors(');
const helmetStart=engine.indexOf('const helmetState =');
const swapStart=engine.indexOf('const swapForNd =');
if([worldStart,cardStart,stateStart,drawStart,helmetStart,swapStart].some(i=>i<0))throw Error('Reference contract changed');
// Reverse-order range replacements preserve the exact post-process shaders.
engine=engine.slice(0,helmetStart)+engine.slice(swapStart);
engine=engine.slice(0,stateStart)+engine.slice(drawStart);
engine=engine.slice(0,worldStart)+await readFile(path.join(root,'scene-map.js'),'utf8')+'\n'+await readFile(path.join(root,'scene-world.mjs'),'utf8')+'\n'+engine.slice(cardStart);
// Landscape (16:9 long-form) or portrait (9:16 Shorts) frame contract.
const dims='const W = 1080, H = 1920;';if(!engine.includes(dims))throw Error('Frame size contract changed');engine=engine.replace(dims,`const W = ${m.width}, H = ${m.height};`);
// Camera-space eye focus, rather than a spherical distance approximation.
engine=engine.replace('dofU.focus.value = D.focus;', 'tmpV.set(...C.look).applyMatrix4(camera.matrixWorldInverse); dofU.focus.value = Math.max(.08, -tmpV.z);');
const storyImport="import { SHOTS, TOTAL, shotAt, camAt, dofAt, LIGHTS, lightFor, actorsAt, worldAt, fxAt } from './story.js';";
if(!engine.includes(storyImport))throw Error('Story import contract changed');
engine=engine.replace(storyImport,storyImport.replace('fxAt }','fxAt, captionAt, mapAt }'));
// Captions are burned into the captured canvas; v1 manifests keep captions off.
engine+='\n'+await readFile(path.join(root,'caption-overlay.js'),'utf8');
engine+='\n'+await readFile(path.join(root,'map-overlay.js'),'utf8');
if(m.shots.some(s=>s.world==='map')){await mkdir(path.join(web,'map'),{recursive:true});await cp(path.join(root,'assets/map/regions.json'),path.join(web,'map/regions.json'));}
await writeFile(path.join(web,'main.js'),engine);
console.log('Prepared declarative cartoon scene; unsupported features fail closed');