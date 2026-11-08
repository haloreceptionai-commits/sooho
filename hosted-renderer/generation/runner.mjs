import { randomUUID } from 'node:crypto';
const endpoint = new URL(process.env.GENERATION_ENDPOINT || '');
if (endpoint.origin !== 'https://sooho.lovable.app' || endpoint.pathname !== '/api/public/generation-worker') throw Error('Invalid generation endpoint');
const owner = randomUUID();
async function request(body) {
  const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-generation-job': process.env.GENERATION_JOB_ID || '', 'x-generation-token': process.env.GENERATION_TOKEN || '' }, body: JSON.stringify({ ...body, owner }) });
  if (!r.ok) throw Error(`Generation service unavailable [${r.status}]`);
  return r.json();
}
const claim = await request({ action: 'claim' });
if (!claim.fence) process.exit(0);
const timer = setInterval(() => { request({ action: 'heartbeat', fence: claim.fence }).catch(() => {}); }, 60000);
try {
  // Run is never blindly repeated after an uncertain response; the ledger reconciles first.
  const result = await request({ action: 'run', fence: claim.fence });
  console.log(JSON.stringify({ status: result.status }));
} finally { clearInterval(timer); }