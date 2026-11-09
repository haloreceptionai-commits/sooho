// Runtime adapter: the same worker runs on Apify (legacy) or Azure Container Apps Jobs.
// Azure mode keeps every durable record in a private Blob container reached by a scoped SAS.
const azure = Boolean(process.env.AZURE_BLOB_BASE && process.env.AZURE_BLOB_SAS);

function blobUrl(name) {
  const base = process.env.AZURE_BLOB_BASE.replace(/\/$/, '');
  const sas = process.env.AZURE_BLOB_SAS.replace(/^\?/, '');
  return `${base}/${name.split('/').map(encodeURIComponent).join('/')}?${sas}`;
}
const H = { 'x-ms-version': '2021-08-06' };

// A dropped connection ("fetch failed") is retried with backoff instead of failing the whole render.
export async function netFetch(url, init, tries = 7) {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...init, signal: AbortSignal.timeout(120000) }); }
    catch (e) { if (i >= tries - 1) throw Error(`Network unavailable after ${tries} tries: ${e?.cause?.code || e?.message || e}`); }
    await new Promise(res => setTimeout(res, Math.min(30000, 1000 * 2 ** i) + Math.random() * 1000));
  }
}

async function blobPut(name, body, contentType, extra = {}) {
  for (let i = 0; i < 6; i++) {
    const r = await netFetch(blobUrl(name), { method: 'PUT', headers: { ...H, 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType, ...extra }, body });
    if (r.ok) return { ok: true, etag: r.headers.get('etag') };
    if (r.status === 409 || r.status === 412) return { ok: false, status: r.status };
    if (r.status < 500 && r.status !== 429) throw Error(`Private blob write failed [${r.status}]`);
    await new Promise(res => setTimeout(res, 1000 * 2 ** i));
  }
  throw Error('Private blob storage unavailable');
}
async function blobGet(name) {
  for (let i = 0; i < 6; i++) {
    const r = await netFetch(blobUrl(name), { headers: H });
    if (r.status === 404) return null;
    if (r.ok) return r;
    if (r.status < 500 && r.status !== 429) throw Error(`Private blob read failed [${r.status}]`);
    await new Promise(res => setTimeout(res, 1000 * 2 ** i));
  }
  throw Error('Private blob storage unavailable');
}

class BlobStore {
  constructor(id) {
    if (!/^cartoon-[0-9a-f-]{36}$/.test(id)) throw Error('Invalid cartoon store');
    this.id = id;
  }
  async setValue(key, value, options = {}) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    await blobPut(`${this.id}/${key}`, bytes, Buffer.isBuffer(value) ? (options.contentType || 'application/octet-stream') : 'application/json');
  }
  async getValue(key) {
    const r = await blobGet(`${this.id}/${key}`);
    if (!r) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    return (r.headers.get('content-type') || '').includes('application/json') ? JSON.parse(bytes.toString('utf8')) : bytes;
  }
  // Atomic claim across parallel replicas; a claim older than staleMs without progress may be taken over.
  async claim(key, staleMs = 0) {
    const name = `${this.id}/${key}`, owner = Buffer.from(process.env.HOSTNAME || String(Math.random()));
    const created = await blobPut(name, owner, 'text/plain', { 'If-None-Match': '*' });
    if (created.ok) return true;
    if (!staleMs) return false;
    const head = await netFetch(blobUrl(name), { method: 'HEAD', headers: H });
    if (!head.ok) return false;
    if (Date.now() - new Date(head.headers.get('last-modified')).getTime() < staleMs) return false;
    return (await blobPut(name, owner, 'text/plain', { 'If-Match': head.headers.get('etag') })).ok;
  }
}

class LocalClaims {
  constructor(store) { this.store = store; this.id = store.id; }
  setValue(...a) { return this.store.setValue(...a); }
  getValue(...a) { return this.store.getValue(...a); }
  async claim() { return true; }
}

let apify;
export const platform = {
  azure,
  async init() { if (!azure) { apify = await import('apify'); await apify.Actor.init(); } },
  async input() {
    if (!azure) return apify.Actor.getInput();
    const key = process.env.CARTOON_INPUT_KEY || '';
    if (!/^cartoon-[0-9a-f-]{36}\/INPUT-(preflight|finish)-[0-9a-z]+$/.test(key)) throw Error('Invalid cartoon input key');
    const r = await blobGet(key);
    if (!r) throw Error('Cartoon input missing');
    return r.json();
  },
  async open(id) { return azure ? new BlobStore(id) : new LocalClaims(await apify.KeyValueStore.open(id)); },
  async output(value) { if (!azure) await apify.Actor.setValue('OUTPUT', value); else console.log('OUTPUT', JSON.stringify(value)); },
  async exit() { if (!azure) await apify.Actor.exit(); },
};
