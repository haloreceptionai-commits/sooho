// Worker-side validation before preparing trusted renderer code.
import V from './vocabulary.json' with { type: 'json' };
import CATALOG from './assets/library/catalog.json' with { type: 'json' };
export const LIBRARY = new Map(CATALOG.map(c => [c.id, c]));

export const OUTFITS = ['sailor', 'worker', 'scholar', 'captain', 'pirate', 'king', 'farmer'];

export function validateManifest(m) {
  const fail=message=>{throw Error(message);};
  const v2=m.version==='cartoon-v2';
  if(!['cartoon-v1','cartoon-v2'].includes(m.version)||m.fps!==30||m.width!==1080||m.height!==1920)fail('Invalid cartoon frame contract');
  if(m.captions&&!v2)fail('Captions require the v2 overlay');
  if(!Number.isSafeInteger(m.narration?.samples)||m.narration.samples<1||m.narration.samples>48000*90||m.narration.rate!==48000)fail('Invalid narration clock');
  if(!/^[a-f0-9]{64}$/.test(m.narration.sha256))fail('Invalid narration checksum');
  const total=Math.round(m.narration.samples/48000*30);
  if(!Array.isArray(m.cast)||m.cast.length<1||m.cast.length>3)fail('Invalid cast');
  const ids=new Set();
  for(const c of m.cast){
    if(!/^[a-z0-9_-]{1,30}$/.test(c.id)||ids.has(c.id)||!OUTFITS.includes(c.outfit)||!Number.isInteger(c.seed))fail('Unsupported or duplicate cast');
    ids.add(c.id);
  }
  if(!Array.isArray(m.words)||m.words.length<1||m.words.length>600)fail('Invalid alignment');
  let wordEnd=0;
  for(const w of m.words){
    if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<wordEnd||w.end<=w.start||w.end>m.narration.samples/48000)fail('Invalid word timing');
    // CTC confidence is only a review hint; a signed owner review gates workflow.
    if(!Number.isFinite(w.confidence)||w.confidence<0||w.confidence>1)fail('Invalid word confidence');
    wordEnd=w.end;
  }
  if(m.captions&&(!Array.isArray(m.caption_words)||m.caption_words.length!==m.words.length||m.caption_words.some(t=>typeof t!=='string'||!t||t.length>40)))fail('Caption words must match the aligned narration');
  if(!Array.isArray(m.shots)||m.shots.length<1||m.shots.length>120)fail('Invalid shots');
  const vector=p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1000);
  const worlds=v2?V.worlds:['ship','town','bridge','lab','landscape'];
  const actions=v2?V.actions:['idle','walk','point','react','lift','pour'];
  const sounds=v2?V.sounds:['whoosh','impact','creak','pour','splash','reveal'];
  let end=0;
  for(const s of m.shots){
    if(s.start!==end||!Number.isInteger(s.end)||s.end<=s.start||s.end>total)fail('Shots must cover narration continuously');
    end=s.end;
    if(!worlds.includes(s.world)||!V.lights.includes(s.light))fail('Unsupported world or light');
    if(!Array.isArray(s.actors)||s.actors.length>3||s.actors.some(a=>!ids.has(a.id)||!vector(a.pos)||!actions.includes(a.action)))fail('Invalid actor');
    if(v2){
      if(s.actors.some(a=>!V.expressions.includes(a.expression)||![-1,0,1].includes(a.facing??0)))fail('Invalid actor performance');
      if(new Set(s.actors.map(a=>a.id)).size!==s.actors.length)fail('Duplicate actor in shot');
      if(!V.shots.includes(s.shot)||!V.moves.includes(s.move)||!V.moods.includes(s.mood))fail('Unsupported shot direction');
      if(!Number.isFinite(s.shake)||s.shake<0||s.shake>1)fail('Invalid camera shake');
      if(s.speaker!=null&&!s.actors.some(a=>a.id===s.speaker))fail('Speaker must be on screen');
      if(s.keyword!=null&&(!Number.isInteger(s.keyword)||!m.words[s.keyword]))fail('Invalid caption keyword');
      if(!Array.isArray(s.props)||s.props.length>4||s.props.some(p=>!V.props.includes(p.kind)||!V.places.includes(p.place)||!V.prop_motions.includes(p.motion)))fail('Unsupported prop');
      if(s.props.filter(p=>p.place==='hand').length>1)fail('Only one hand prop');
      // Library objects must exist in the bundled CC0 catalog and are never hand-held cards.
      if(s.props.some(p=>p.kind==='asset'?(p.place==='hand'||!LIBRARY.has(p.asset)):p.asset!==undefined))fail('Unknown library object');
      if(!Array.isArray(s.fx)||s.fx.length>3||s.fx.some(x=>!V.fx.includes(x)))fail('Unsupported effect');
    }
    if(!Array.isArray(s.camera)||s.camera.length<1||s.camera.length>20)fail('Invalid camera');
    let previous=s.start-1;
    for(const c of s.camera){
      if(!Number.isInteger(c.frame)||c.frame<=previous||c.frame<s.start||c.frame>=s.end||!vector(c.pos)||!vector(c.look)||!Number.isFinite(c.fov)||c.fov<15||c.fov>90||Math.abs(c.roll||0)>8)fail('Invalid camera track');
      previous=c.frame;
    }
    if(!Array.isArray(s.events)||s.events.length>30)fail('Invalid sound events');
    for(const e of s.events){
      const w=m.words[e.word];
      if(!Number.isInteger(e.word)||!w||!Number.isInteger(e.lead)||e.lead<0||e.lead>3||!sounds.includes(e.kind))fail('Invalid reaction event');
      const f=Math.round(w.start*30)-e.lead;
      if(f<s.start||f>=s.end)fail('Reaction outside shot');
    }
  }
  if(end!==total)fail('Shots do not cover final voice samples');
  return m;
}
