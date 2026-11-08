// Worker-side validation before preparing trusted renderer code.
export function validateManifest(m) {
  const fail=message=>{throw Error(message);};
  if(m.version!=='cartoon-v1'||m.fps!==30||m.width!==1080||m.height!==1920)fail('Invalid cartoon frame contract');
  if(m.captions)fail('Caption overlay is not implemented; release blocked');
  if(!Number.isSafeInteger(m.narration?.samples)||m.narration.samples<1||m.narration.samples>48000*90||m.narration.rate!==48000)fail('Invalid narration clock');
  if(!/^[a-f0-9]{64}$/.test(m.narration.sha256))fail('Invalid narration checksum');
  const total=Math.round(m.narration.samples/48000*30);
  if(!Array.isArray(m.cast)||m.cast.length<1||m.cast.length>3)fail('Invalid cast');
  const ids=new Set();
  for(const c of m.cast){
    if(!/^[a-z0-9_-]{1,30}$/.test(c.id)||ids.has(c.id)||!['sailor','worker','scholar'].includes(c.outfit)||!Number.isInteger(c.seed))fail('Unsupported or duplicate cast');
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
  if(!Array.isArray(m.shots)||m.shots.length<1||m.shots.length>120)fail('Invalid shots');
  const vector=p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1000);
  let end=0;
  for(const s of m.shots){
    if(s.start!==end||!Number.isInteger(s.end)||s.end<=s.start||s.end>total)fail('Shots must cover narration continuously');
    end=s.end;
    if(!['ship','town','bridge','lab','landscape'].includes(s.world)||!['day','golden','night_bright'].includes(s.light))fail('Unsupported world or light');
    if(!Array.isArray(s.actors)||s.actors.length>3||s.actors.some(a=>!ids.has(a.id)||!vector(a.pos)||!['idle','walk','point','react','lift','pour'].includes(a.action)))fail('Invalid actor');
    if(!Array.isArray(s.camera)||s.camera.length<1||s.camera.length>20)fail('Invalid camera');
    let previous=s.start-1;
    for(const c of s.camera){
      if(!Number.isInteger(c.frame)||c.frame<=previous||c.frame<s.start||c.frame>=s.end||!vector(c.pos)||!vector(c.look)||!Number.isFinite(c.fov)||c.fov<15||c.fov>90||Math.abs(c.roll||0)>8)fail('Invalid camera track');
      previous=c.frame;
    }
    if(!Array.isArray(s.events)||s.events.length>30)fail('Invalid sound events');
    for(const e of s.events){
      const w=m.words[e.word];
      if(!Number.isInteger(e.word)||!w||!Number.isInteger(e.lead)||e.lead<0||e.lead>3||!['whoosh','impact','creak','pour','splash','reveal'].includes(e.kind))fail('Invalid reaction event');
      const f=Math.round(w.start*30)-e.lead;
      if(f<s.start||f>=s.end)fail('Reaction outside shot');
    }
  }
  if(end!==total)fail('Shots do not cover final voice samples');
  return m;
}