import { Actor, KeyValueStore } from 'apify';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { canonical } from './canonical.mjs';

await Actor.init();
const input = await Actor.getInput();
if (!input?.jobId || !input.callbackToken || input.manifest?.kind !== 'cartoon') throw Error('Invalid cartoon job');
const address = new URL(input.callbackUrl);
if (address.protocol !== 'https:' || address.hostname !== 'sooho.lovable.app' || address.pathname !== '/api/public/render-callback') throw Error('Invalid completion address');
const work = path.join(os.tmpdir(), 'cartoon-job');
await mkdir(work, { recursive: true });
const python = process.env.CARTOON_PYTHON || 'python3';
const root = path.dirname(new URL(import.meta.url).pathname);
async function notify(event) {
  for (let i=0;i<4;i++) {
    const r=await fetch(input.callbackUrl,{method:'POST',headers:{'x-render-job':input.jobId,'x-render-token':input.callbackToken,'Content-Type':'application/json'},body:JSON.stringify(event)});
    if(r.ok)return r.json();
    if(r.status<500&&r.status!==429)throw Error(`Cloud callback rejected [${r.status}]`);
    await new Promise(r=>setTimeout(r,2000*2**i));
  }
  throw Error('Cloud callback unavailable');
}
async function guard(progress) { const state=await notify({type:'progress',progress});if(!state.accepted)throw Error('Cartoon cancelled or expired'); }
async function run(command,args) {
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
  let errors='';child.stdout.on('data',v=>process.stdout.write(v));child.stderr.on('data',v=>{errors=(errors+v).slice(-2000);process.stderr.write(v);});
  let stopped=false;
  const heartbeat=setInterval(()=>{guard(0).catch(()=>{stopped=true;child.kill('SIGTERM');});},60000);
  try { await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0&&!stopped?resolve():reject(Error(stopped?'Cartoon cancelled':`Worker stage failed: ${errors}`)));}); }
  finally { clearInterval(heartbeat); }
}
async function uploadFiles(files) {
  const grants=await notify({type:'assets',files:files.map(name=>({name}))});
  if(!grants.accepted)throw Error('Upload cancelled');
  const paths={};
  for(const name of files){const grant=grants.uploads[name];const bytes=await readFile(path.join(work,name));const r=await fetch(grant.url,{method:'PUT',headers:{'Content-Type':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.wav')?'audio/wav':name.endsWith('.mp4')?'video/mp4':'application/json','x-upsert':'true'},body:bytes});if(!r.ok)throw Error(`Private upload failed [${r.status}]`);paths[name]=grant.path;}
  return paths;
}
const store= input.mode==='finish' ? await KeyValueStore.open(input.storeId) : await KeyValueStore.open(`cartoon-${input.jobId}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  await guard(0);
  if(input.mode==='preflight') {
    const url=new URL(input.voiceUrl);if(url.protocol!=='https:'||!url.pathname.includes('/storage/v1/object/sign/videos/'))throw Error('Invalid voice grant');
    const response=await fetch(url);if(!response.ok)throw Error('Locked narration could not load');
    await writeFile(path.join(work,'original-voice'),Buffer.from(await response.arrayBuffer()));
    await run('ffmpeg',['-v','error','-y','-i',path.join(work,'original-voice'),'-ar','48000','-ac','1','-c:a','pcm_s16le',path.join(work,'voice.wav')]);
    await writeFile(path.join(work,'script.txt'),input.manifest.script);
    await writeFile(path.join(work,'request.json'),JSON.stringify(input.manifest));
    await run(python,[path.join(root,'acoustic.py'),'--audio',path.join(work,'voice.wav'),'--weights',process.env.CARTOON_WEIGHTS || '/opt/cartoon/weights.pth','--script',path.join(work,'script.txt'),'--out',work]);
    await run(python,[path.join(root,'build-manifest.py'),'--request',path.join(work,'request.json'),'--alignment',path.join(work,'alignment.json'),'--voice',path.join(work,'voice.wav'),'--out',path.join(work,'manifest.json')]);
    await run(python,[path.join(root,'workflow.py'),'--manifest',path.join(work,'manifest.json'),'--voice',path.join(work,'voice.wav'),'--work',path.join(work,'render'),'--mode','preflight','--twist-frame','0']);
    const sheets=(await readdir(path.join(work,'render/sheets'))).filter(n=>n.endsWith('.jpg'));
    for(const n of sheets)await writeFile(path.join(work,n),await readFile(path.join(work,'render/sheets',n)));
    const reviewRequest=JSON.parse(await readFile(path.join(work,'render/review-request.json'),'utf8'));
    const approvedHash=hash(Buffer.from(JSON.stringify(reviewRequest)));
    const locked={jobId:input.jobId,requestHash:hash(Buffer.from(canonical(input.manifest))),request:input.manifest,review:reviewRequest,hash:approvedHash};
    await store.setValue('LOCK',locked);
    for(const n of ['voice.wav','manifest.json','alignment.json'])await store.setValue(n.replaceAll('.','-'),await readFile(path.join(work,n)),{contentType:'application/octet-stream'});
    const paths=await uploadFiles([...sheets,'voice.wav','alignment.json','manifest.json']);
    const m=JSON.parse(await readFile(path.join(work,'manifest.json'),'utf8'));
    const accepted=await notify({type:'review',hash:approvedHash,storeId:store.id,sheets:sheets.map(n=>paths[n]),voicePath:paths['voice.wav'],alignmentPath:paths['alignment.json'],duration:m.narration.samples/48000});
    if(!accepted.accepted)throw Error('Review was not accepted');
    await Actor.setValue('OUTPUT',{status:'review',duration:m.narration.samples/48000});
  } else if(input.mode==='finish') {
    const locked=await store.getValue('LOCK');
    if(!locked||locked.jobId!==input.jobId||locked.hash!==input.approvedHash||locked.requestHash!==hash(Buffer.from(canonical(input.manifest))))throw Error('Owner review does not match locked inputs');
    for(const n of ['voice.wav','manifest.json','alignment.json']){const bytes=await store.getValue(n.replaceAll('.','-'));if(!Buffer.isBuffer(bytes))throw Error('Missing durable inputs');await writeFile(path.join(work,n),bytes);}
    await run('node',[path.join(root,'prepare-scene.mjs'),path.join(work,'manifest.json'),path.join(work,'render/prepared')]);
    await mkdir(path.join(work,'render'),{recursive:true});
    await writeFile(path.join(work,'render/review-approved.json'),JSON.stringify({...locked.review,approved:true}));
    const m=JSON.parse(await readFile(path.join(work,'manifest.json'),'utf8'));
    const total=Math.round(m.narration.samples/48000*30);
    const framesDir=path.join(work,'render/frames');await mkdir(framesDir,{recursive:true});
    // A completed 60-frame batch and its checksummed checkpoint are durable before the next batch.
    const saved=await store.getValue('FRAME-CHECKPOINT');
    if(saved){await writeFile(path.join(framesDir,'checkpoint.json'),JSON.stringify(saved));for(const f of Object.keys(saved.frames)){const bytes=await store.getValue(`frame-${f}`);if(Buffer.isBuffer(bytes))await writeFile(path.join(framesDir,`f${String(f).padStart(6,'0')}.jpg`),bytes);}}
    // Frames are deterministic per index, so independent batches render in parallel browsers,
    // each into its own folder, then merge into one checksummed checkpoint in frame order.
    const merged=saved||{input_hash:null,frames:{}};
    const pending=[];
    for(let first=0;first<total;first+=60){const last=Math.min(total-1,first+59);let done=true;for(let f=first;f<=last;f++)if(!merged.frames[String(f)]){done=false;break;}if(!done)pending.push([first,last]);}
    const lanes=Math.max(1,Math.min(Number(process.env.CARTOON_PARALLEL)||6,os.availableParallelism?.()||os.cpus().length,pending.length||1));
    let finished=total-pending.reduce((n,[a,b])=>n+b-a+1,0),next=0,saveChain=Promise.resolve();
    async function lane(){
      while(next<pending.length){
        const [first,last]=pending[next++];
        await guard(15+finished/total*75);
        const dir=path.join(framesDir,`batch-${first}`);await mkdir(dir,{recursive:true});
        await run(python,[path.join(root,'capture.py'),'--web',path.join(work,'render/prepared/web'),'--out',dir,'--first',String(first),'--last',String(last)]);
        const part=JSON.parse(await readFile(path.join(dir,'checkpoint.json'),'utf8'));
        if(merged.input_hash&&merged.input_hash!==part.input_hash)throw Error('Scene inputs changed between batches');
        for(let f=first;f<=last;f++){const name=`f${String(f).padStart(6,'0')}.jpg`;const bytes=await readFile(path.join(dir,name));await writeFile(path.join(framesDir,name),bytes);await store.setValue(`frame-${f}`,bytes,{contentType:'image/jpeg'});merged.frames[String(f)]=part.frames[String(f)];}
        merged.input_hash=part.input_hash;finished+=last-first+1;
        saveChain=saveChain.then(()=>Promise.all([store.setValue('FRAME-CHECKPOINT',merged),writeFile(path.join(framesDir,'checkpoint.json'),JSON.stringify(merged))]));await saveChain;
      }
    }
    console.log(`Rendering ${pending.length} batches across ${lanes} parallel browsers`);
    await Promise.all(Array.from({length:lanes},lane));
    await writeFile(path.join(framesDir,'checkpoint.json'),JSON.stringify(merged));
    await run(python,[path.join(root,'workflow.py'),'--manifest',path.join(work,'manifest.json'),'--voice',path.join(work,'voice.wav'),'--work',path.join(work,'render'),'--mode','finish','--twist-frame',String(Math.max(0,Math.min(total-1,Math.round(input.manifest.report.revealSec*30))))]);
    await guard(95);
    for(const n of ['output.mp4','output.qa.json','mix-report.json'])await writeFile(path.join(work,n),await readFile(path.join(work,'render',n)));
    const qa=JSON.parse(await readFile(path.join(work,'output.qa.json'),'utf8'));
    if(qa.review_required)throw Error('Output did not pass QA');
    await uploadFiles(['output.mp4','output.qa.json','mix-report.json']);
    const bytes=await readFile(path.join(work,'output.mp4'));
    await store.setValue('FINAL',bytes,{contentType:'video/mp4'});
    const result=await notify({type:'done',duration:qa.duration,mime:'video/mp4',size:bytes.length,stats:{lufs:Number(qa.loudness.input_i),lra:Number(qa.loudness.input_lra),avgShotSec:qa.duration/m.shots.length,wordsPerSec:m.words.length/qa.duration}});
    if(!result.accepted)throw Error('Cloud completion was not accepted');
    await Actor.setValue('OUTPUT',{status:'done',duration:qa.duration,size:bytes.length,sha256:hash(bytes)});
  } else throw Error('Unsupported cartoon stage');
} catch(error){await notify({type:'failed',error:String(error.message||error).slice(0,1000)}).catch(()=>{});throw error;}
await Actor.exit();