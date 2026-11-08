import { randomUUID } from 'node:crypto';
const endpoint = new URL(process.env.GENERATION_ENDPOINT || '');
if (endpoint.origin !== 'https://sooho.lovable.app' || endpoint.pathname !== '/api/public/generation-worker') throw Error('Invalid generation endpoint');
const owner = randomUUID();
async function request(body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-generation-job': process.env.GENERATION_JOB_ID || '', 'x-generation-token': process.env.GENERATION_TOKEN || '' }, body: JSON.stringify({ ...body, owner }) });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) throw Error(`Generation request rejected [${r.status}]`);
      if (attempt === 3) throw Error('Generation service unavailable');
    } catch (error) {
      // Ledger makes duplicate Run requests safe: an existing intent pauses rather than executing twice.
      if (String(error).includes('rejected') || attempt === 3) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 2000 * 2 ** attempt));
  }
  throw Error('Generation service unavailable');
}
const claim = await request({ action: 'claim' });
if (!claim.fence) process.exit(0);
const timer = setInterval(() => { request({ action: 'heartbeat', fence: claim.fence }).catch(() => {}); }, 60000);
try {
  // Run is never blindly repeated after an uncertain response; the ledger reconciles first.
  const deadline = Date.now() + 6 * 60 * 60 * 1000;
  for (;;) {
    if (Date.now() > deadline) throw Error('Generation execution deadline reached');
    const result = await request({ action: 'run', fence: claim.fence });
    if (result.status === 'continue') { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
    if (result.status === 'waiting') { await new Promise(resolve => setTimeout(resolve, 8000)); continue; }
    console.log(JSON.stringify({ status: result.status }));
    break;
  }
} finally { clearInterval(timer); }