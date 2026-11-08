// Deploy only this isolated worker; never mutate the production still/AI-motion Actor.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const key=process.env.LOVABLE_API_KEY,connection=process.env.APIFY_API_KEY;
if(!key||!connection)throw Error('Apify connection unavailable');
const base='https://connector-gateway.lovable.dev/apify';
async function api(method,url,body){const r=await fetch(base+url,{method,headers:{Authorization:`Bearer ${key}`,'X-Connection-Api-Key':connection,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(`Apify ${r.status}: ${(await r.text()).slice(0,1000)}`);return(await r.json()).data;}
const sources=[];
async function walk(dir='') {for(const entry of await readdir(path.join(import.meta.dirname,dir),{withFileTypes:true})){
  if(entry.name.startsWith('.')||entry.name==='node_modules'||entry.name==='__pycache__'||entry.name==='deploy.mjs'||entry.name.startsWith('test_'))continue;
  const name=path.join(dir,entry.name);if(entry.isDirectory())await walk(name);else if(/\.(js|mjs|ts|py|json|html|LICENSE)$/.test(name)||entry.name==='Dockerfile'||entry.name.endsWith('.LICENSE'))sources.push({name,format:'TEXT',content:await readFile(path.join(import.meta.dirname,name),'utf8')});
}}
await walk();
const actors=await api('GET','/acts?limit=100');
let actor=actors.items.find(a=>a.name==='chronicle-cartoon-renderer');
const version={versionNumber:'0.1',sourceType:'SOURCE_FILES',buildTag:'latest',sourceFiles:sources};
if(!actor)actor=await api('POST','/acts',{name:'chronicle-cartoon-renderer',description:'Private reviewed cartoon Shorts with locked Atlas audio and cloud completion',isPublic:false,versions:[version]});
else await api('PUT',`/acts/${actor.id}/versions/0.1`,version);
const build=await api('POST',`/acts/${actor.id}/builds?version=0.1&useCache=true`);
console.log(JSON.stringify({actorId:actor.id,buildId:build.id,status:build.status,sourceFiles:sources.length}));