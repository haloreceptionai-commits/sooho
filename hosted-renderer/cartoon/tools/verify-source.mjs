// Refuses to build a worker image from a damaged source tree. A Windows checkout with line-ending conversion changes the bytes of text files,
// which breaks the pinned SHA-256 checks inside the worker (e.g. "Dependency checksum mismatch: toon.ts") and fails every video at 70%+.
// Checks: (1) vendor/ files match vendor/manifest.json, (2) every pinned Blender asset matches blender/assets/manifest.json,
// (3) no CRLF in code, scripts, Dockerfiles or JSON. Usage: node tools/verify-source.mjs [cartoonDir]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..'));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const problems = [];

const vendor = path.join(root, 'vendor', 'manifest.json');
if (existsSync(vendor)) {
  const m = JSON.parse(readFileSync(vendor, 'utf8'));
  for (const [name, expected] of Object.entries(m.sha256 || {})) {
    const f = path.join(root, 'vendor', name);
    if (!existsSync(f)) problems.push(`vendor/${name} is missing`);
    else if (sha(f) !== expected) problems.push(`vendor/${name} does not match its pinned checksum (line endings changed?)`);
  }
}

const assets = path.join(root, 'blender', 'assets');
const manifest = path.join(assets, 'manifest.json');
if (existsSync(manifest)) {
  for (const e of JSON.parse(readFileSync(manifest, 'utf8'))) {
    const f = path.join(assets, e.path);
    if (!existsSync(f)) problems.push(`blender/assets/${e.path} is missing`);
    else if (sha(f) !== e.sha256) problems.push(`blender/assets/${e.path} does not match its pinned checksum`);
  }
}

const CODE = /\.(mjs|js|py|sh|json|ts|css|html)$|^Dockerfile/;
const walk = dir => {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '__pycache__', 'library', 'sound', 'map', '.git'].includes(name)) continue;
    const f = path.join(dir, name);
    if (statSync(f).isDirectory()) walk(f);
    else if (CODE.test(name) && readFileSync(f).includes(Buffer.from('\r\n'))) problems.push(`${path.relative(root, f)} has Windows line endings`);
  }
};
walk(root);

if (problems.length) {
  console.error(`Source check FAILED (${problems.length} problem${problems.length > 1 ? 's' : ''}); no image was built:`);
  for (const p of problems.slice(0, 25)) console.error(' - ' + p);
  console.error('Fix: git config core.autocrlf false, then restore the files (git checkout -f HEAD -- hosted-renderer/cartoon).');
  process.exit(1);
}
console.log('Source check passed: pinned vendor files and assets match, no CRLF in code.');
