import { platform, netFetch } from './platform.mjs';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { canonical } from './canonical.mjs';

await platform.init();
const input = await platform.input();
if (!input?.jobId || !input.callbackToken || input.manifest?.kind !== 'cartoon') throw Error('Invalid cartoon job');
const address = new URL(input.callbackUrl);
// The app is reachable at its published address and its custom domain; anything else is rejected.
if (address.protocol !== 'https:' || !['sooho.lovable.app', 'sooha.io'].includes(address.hostname) || address.pathname !== '/api/public/render-callback') throw Error('Invalid completion address');
const work = path.join(os.tmpdir(), 'cartoon-job');
await mkdir(work, { recursive: true });
const python = process.env.CARTOON_PYTHON || 'python3';
const root = path.dirname(new URL(import.meta.url).pathname);
async function notify(event) {
  for (let i=0;i<6;i++) {
    const r=await netFetch(input.callbackUrl,{method:'POST',headers:{'x-render-job':input.jobId,'x-render-token':input.callbackToken,'Content-Type':'application/json'},body:JSON.stringify(event)});
    if(r.ok)return r.json();
    if(r.status<500&&r.status!==429)throw Error(`Cloud callback rejected [${r.status}]`);
    await new Promise(r=>setTimeout(r,2000*2**i));
  }
  throw Error('Cloud callback unavailable');
}
class Cancelled extends Error {}
async function guard(progress) { const state=await notify({type:'progress',progress});if(!state.accepted)throw new Cancelled('Cartoon cancelled or expired'); }
async function run(command,args) {
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
  let errors='';child.stdout.on('data',v=>process.stdout.write(v));child.stderr.on('data',v=>{errors=(errors+v).slice(-2000);process.stderr.write(v);});
  let stopped=false;
  // Only a real cancel/expiry stops the stage; a missed heartbeat (network blip) is ignored and retried next minute.
  const heartbeat=setInterval(()=>{guard(0).catch(e=>{if(e instanceof Cancelled||/rejected \[4/.test(String(e?.message))){stopped=true;child.kill('SIGTERM');}else console.warn('heartbeat missed',e?.message);});},60000);
  try { await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0&&!stopped?resolve():reject(Error(stopped?'Cartoon cancelled':`Worker stage failed: ${errors}`)));}); }
  finally { clearInterval(heartbeat); }
}
async function uploadFiles(files) {
  const grants=await notify({type:'assets',files:files.map(name=>({name}))});
  if(!grants.accepted)throw Error('Upload cancelled');
  const paths={};
  for(const name of files){const grant=grants.uploads[name];const bytes=await readFile(path.join(work,name));const r=await netFetch(grant.url,{method:'PUT',headers:{'Content-Type':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.wav')?'audio/wav':name.endsWith('.mp4')?'video/mp4':'application/json','x-upsert':'true'},body:bytes});if(!r.ok)throw Error(`Private upload failed [${r.status}]`);paths[name]=grant.path;}
  return paths;
}
const store= await platform.open(input.mode==='finish' ? input.storeId : `cartoon-${input.jobId}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Bounded concurrency for many small storage calls (frame upload/download).
async function pool(items,limit,fn){let i=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const it=items[i++];await fn(it);}}));}
const timings={};const timing=(name,start)=>{timings[name]=Math.round((Date.now()-start)/100)/10;console.log(JSON.stringify({timing:name,sec:timings[name]}));};
try {
  await guard(0);
  if(input.mode==='preflight') {
    let stageStart=Date.now();
    const url=new URL(input.voiceUrl);if(url.protocol!=='https:'||!url.pathname.includes('/storage/v1/object/sign/videos/'))throw Error('Invalid voice grant');
    const response=await netFetch(url);if(!response.ok)throw Error('Locked narration could not load');
    await writeFile(path.join(work,'original-voice'),Buffer.from(await response.arrayBuffer()));
    await run('ffmpeg',['-v','error','-y','-i',path.join(work,'original-voice'),'-ar','48000','-ac','1','-c:a','pcm_s16le',path.join(work,'voice.wav')]);
    await writeFile(path.join(work,'script.txt'),input.manifest.script);
    // Advanced Video AI: fetch each painted character card once and keep it with the durable inputs.
    // Keys: cast id (standing), '<id>-<pose>' and 'obj-<name>'; the app validated them against the cast and props.
    const cardKeys=(input.manifest.cards||[]).map(c=>c.id);
    if(cardKeys.some(k=>!/^(obj-[a-z0-9_]{1,30}|[a-z0-9_-]{1,30}(-(reach|shock|happy))?)$/.test(k))||input.manifest.direction.cast.some(c=>c.card&&!cardKeys.includes(c.id)))throw Error('Invalid card list');
    for(const c of cardKeys.map(id=>({id}))){
      const u=new URL(input.cardUrls?.[c.id]||'');if(u.protocol!=='https:'||!u.pathname.includes('/storage/v1/object/sign/videos/'))throw Error('Invalid card grant');
      const r=await netFetch(u);if(!r.ok)throw Error('Character card could not load');
      const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<200||bytes.length>12e6||bytes.readUInt32BE(0)!==0x89504e47)throw Error('Invalid character card');
      await mkdir(path.join(work,'cards'),{recursive:true});await writeFile(path.join(work,'cards',`${c.id}.png`),bytes);
      await store.setValue(`card-${c.id}`,bytes,{contentType:'image/png'});
    }
    await writeFile(path.join(work,'request.json'),JSON.stringify(input.manifest));
    timing('voice-fetch-decode',stageStart);stageStart=Date.now();
    await run(python,[path.join(root,'acoustic.py'),'--audio',path.join(work,'voice.wav'),'--weights',process.env.CARTOON_WEIGHTS || '/opt/cartoon/weights.pth','--script',path.join(work,'script.txt'),'--out',work]);
    timing('alignment',stageStart);stageStart=Date.now();
    await run(python,[path.join(root,'build-manifest.py'),'--request',path.join(work,'request.json'),'--alignment',path.join(work,'alignment.json'),'--voice',path.join(work,'voice.wav'),'--out',path.join(work,'manifest.json')]);
    await run(python,[path.join(root,'workflow.py'),'--manifest',path.join(work,'manifest.json'),'--voice',path.join(work,'voice.wav'),'--work',path.join(work,'render'),'--mode','preflight','--twist-frame','0']);
    timing('manifest-preview',stageStart);stageStart=Date.now();
    const sheets=(await readdir(path.join(work,'render/sheets'))).filter(n=>n.endsWith('.jpg'));
    for(const n of sheets)await writeFile(path.join(work,n),await readFile(path.join(work,'render/sheets',n)));
    const reviewRequest=JSON.parse(await readFile(path.join(work,'render/review-request.json'),'utf8'));
    const approvedHash=hash(Buffer.from(JSON.stringify(reviewRequest)));
    const locked={jobId:input.jobId,requestHash:hash(Buffer.from(canonical(input.manifest))),request:input.manifest,review:reviewRequest,hash:approvedHash};
    await store.setValue('LOCK',locked);
    for(const n of ['voice.wav','manifest.json','alignment.json'])await store.setValue(n.replaceAll('.','-'),await readFile(path.join(work,n)),{contentType:'application/octet-stream'});
    const paths=await uploadFiles([...sheets,'voice.wav','alignment.json','manifest.json']);
    timing('review-storage',stageStart);await store.setValue('PREFLIGHT-TIMINGS',timings);
    const m=JSON.parse(await readFile(path.join(work,'manifest.json'),'utf8'));
    const accepted=await notify({type:'review',hash:approvedHash,storeId:store.id,sheets:sheets.map(n=>paths[n]),voicePath:paths['voice.wav'],alignmentPath:paths['alignment.json'],duration:m.narration.samples/48000});
    if(!accepted.accepted)throw Error('Review was not accepted');
    await platform.output({status:'review',duration:m.narration.samples/48000});
  } else if(input.mode==='finish') {
    const locked=await store.getValue('LOCK');
    if(!locked||locked.jobId!==input.jobId||locked.hash!==input.approvedHash||locked.requestHash!==hash(Buffer.from(canonical(input.manifest))))throw Error('Owner review does not match locked inputs');
    for(const n of ['voice.wav','manifest.json','alignment.json']){const bytes=await store.getValue(n.replaceAll('.','-'));if(!Buffer.isBuffer(bytes))throw Error('Missing durable inputs');await writeFile(path.join(work,n),bytes);}
    for(const c of locked.request.cards||[]){const bytes=await store.getValue(`card-${c.id}`);if(!Buffer.isBuffer(bytes))throw Error('Missing character card');await mkdir(path.join(work,'cards'),{recursive:true});await writeFile(path.join(work,'cards',`${c.id}.png`),bytes);}
    await run('node',[path.join(root,'prepare-scene.mjs'),path.join(work,'manifest.json'),path.join(work,'render/prepared')]);
    await mkdir(path.join(work,'render'),{recursive:true});
    await writeFile(path.join(work,'render/review-approved.json'),JSON.stringify({...locked.review,approved:true}));
    const m=JSON.parse(await readFile(path.join(work,'manifest.json'),'utf8'));
    const total=Math.round(m.narration.samples/48000*30);
    const framesDir=path.join(work,'render/frames');await mkdir(framesDir,{recursive:true});
    // Frames are deterministic per index. Batches are claimed atomically, so on Azure many replicas
    // (and several browsers per replica) split the work; each finished batch is saved as a durable part.
    // One batch per browser lane across the whole fleet keeps every machine busy exactly once.
    const fleet=Math.max(1,Number(process.env.CARTOON_REPLICAS)||1)*Math.max(1,Number(process.env.CARTOON_PARALLEL)||1);
    const size=Number(process.env.CARTOON_BATCH)||Math.min(60,Math.max(12,Math.ceil(total/fleet)));
    const batches=[];for(let first=0;first<total;first+=size)batches.push([first,Math.min(total-1,first+size-1)]);
    const lanes=Math.max(1,Number(process.env.CARTOON_PARALLEL)||10);
    const STALE=15*60*1000;
    const hasPart=async first=>Boolean(await store.getValue(`part-${first}`));
    // Claims are scoped to this attempt (each restart rotates the token), so a crashed attempt's claims never block recovery.
    const attempt=hash(Buffer.from(input.callbackToken)).slice(0,12);
    async function renderBatch([first,last]){
      const dir=path.join(framesDir,`batch-${first}`);await mkdir(dir,{recursive:true});
      await run(python,[path.join(root,'capture.py'),'--web',path.join(work,'render/prepared/web'),'--out',dir,'--first',String(first),'--last',String(last)]);
      const part=JSON.parse(await readFile(path.join(dir,'checkpoint.json'),'utf8'));
      const frames={};
      const ids=[];for(let f=first;f<=last;f++)ids.push(f);
      await pool(ids,16,async f=>{const bytes=await readFile(path.join(dir,`f${String(f).padStart(6,'0')}.jpg`));await store.setValue(`frame-${f}`,bytes,{contentType:'image/jpeg'});frames[String(f)]=part.frames[String(f)];});
      await store.setValue(`part-${first}`,{input_hash:part.input_hash,frames});
    }
    let cursor=0;
    async function lane(){
      while(cursor<batches.length){
        const batch=batches[cursor++];
        if(await hasPart(batch[0]))continue;
        if(!(await store.claim(`claim-${attempt}-${batch[0]}`,STALE)))continue;
        await guard(15+cursor/batches.length*75);
        await renderBatch(batch);
      }
    }
    console.log(`Rendering ${batches.length} batches with ${lanes} browsers on this machine`);
    const tDraw=Date.now();
    await Promise.all(Array.from({length:Math.min(lanes,batches.length)},lane));
    timing('draw-share',tDraw);
    // One replica assembles; the rest stop once their share is done.
    // Each explicit retry elects a fresh assembler; the previous attempt's permanent claim must not block recovery.
    if(!(await store.claim(`assemble-${hash(Buffer.from(input.callbackToken))}`))){await platform.output({status:'rendered-share'});await platform.exit();process.exit(0);}
    const deadline=Date.now()+Math.max(90,Math.ceil(m.narration.samples/48000/60)*6)*60*1000; // long-form: ~6 min of budget per narrated minute
    for(;;){
      const missing=[];for(const b of batches)if(!(await hasPart(b[0])))missing.push(b);
      if(!missing.length)break;
      if(Date.now()>deadline)throw Error('Parallel frame batches did not finish');
      for(const b of missing)if(await store.claim(`claim-${attempt}-${b[0]}`,STALE)){await guard(85);await renderBatch(b);}
      await guard(88);await new Promise(r=>setTimeout(r,5000));
    }
    const merged={input_hash:null,frames:{}};
    for(const [first,last] of batches){
      const part=await store.getValue(`part-${first}`);
      if(merged.input_hash&&merged.input_hash!==part.input_hash)throw Error('Scene inputs changed between batches');
      merged.input_hash=part.input_hash;
      for(let f=first;f<=last;f++)merged.frames[String(f)]=part.frames[String(f)];
    }
    // Frames this replica drew are already on disk; only fetch the rest, many at a time.
    const tFetch=Date.now();
    await pool(Array.from({length:total},(_,f)=>f),32,async f=>{
      const local=path.join(framesDir,`batch-${batches.find(([a,b])=>f>=a&&f<=b)[0]}`,`f${String(f).padStart(6,'0')}.jpg`);
      let bytes=await readFile(local).catch(()=>null);
      if(!bytes||hash(bytes)!==merged.frames[String(f)]?.sha256)bytes=await store.getValue(`frame-${f}`);
      if(!Buffer.isBuffer(bytes)||hash(bytes)!==merged.frames[String(f)]?.sha256)throw Error(`Frame ${f} missing or checksum changed`);
      await writeFile(path.join(framesDir,`f${String(f).padStart(6,'0')}.jpg`),bytes);
    });
    timing('join-fetch',tFetch);
    timing('draw-all',tDraw);
    await writeFile(path.join(framesDir,'checkpoint.json'),JSON.stringify(merged));
    const tFinish=Date.now();
    try {
      await run(python,[path.join(root,'workflow.py'),'--manifest',path.join(work,'manifest.json'),'--voice',path.join(work,'voice.wav'),'--work',path.join(work,'render'),'--mode','finish','--twist-frame',String(Math.max(0,Math.min(total-1,Math.round(input.manifest.report.revealSec*30))))]);
    } catch(e) {
      const report=await readFile(path.join(work,'render/output.qa.json'),'utf8').catch(()=>null);
      if(report){await store.setValue('QA-REPORT',JSON.parse(report)).catch(()=>{});console.error('QA report',report);}
      throw e;
    }
    timing('encode-mix-qa',tFinish);
    await store.setValue('TIMINGS',timings).catch(()=>{});
    await guard(95);
    for(const n of ['output.mp4','output.qa.json','mix-report.json'])await writeFile(path.join(work,n),await readFile(path.join(work,'render',n)));
    const qa=JSON.parse(await readFile(path.join(work,'output.qa.json'),'utf8'));
    await store.setValue('QA-REPORT',qa);
    if(qa.review_required)throw Error('Output did not pass QA');
    await uploadFiles(['output.mp4','output.qa.json','mix-report.json']);
    const bytes=await readFile(path.join(work,'output.mp4'));
    await store.setValue('FINAL',bytes,{contentType:'video/mp4'});
    const completion={type:'done',duration:qa.duration,mime:'video/mp4',size:bytes.length,stats:{lufs:Number(qa.loudness.input_i),lra:Number(qa.loudness.input_lra),avgShotSec:qa.duration/m.shots.length,wordsPerSec:m.words.length/qa.duration}};
    await store.setValue('PENDING-COMPLETION',completion);
    const result=await notify(completion);
    if(!result.accepted)throw Error('Cloud completion was not accepted');
    await platform.output({status:'done',duration:qa.duration,size:bytes.length,sha256:hash(bytes)});
  } else throw Error('Unsupported cartoon stage');
} catch(error){await notify({type:'failed',error:String(error.message||error).slice(0,1000)}).catch(()=>{});throw error;}
await platform.exit();