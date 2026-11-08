import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const destination = process.argv[2];
if (!destination) throw new Error('A scratch output directory is required');
const out = path.resolve(destination);
if (out === root || out.startsWith(root + path.sep)) throw new Error('Never overwrite reference sources');
const manifest = JSON.parse(await readFile(path.join(root, 'vendor/manifest.json'), 'utf8'));
for (const [name, expected] of Object.entries(manifest.sha256)) {
  const actual = createHash('sha256').update(await readFile(path.join(root, 'vendor', name))).digest('hex');
  if (actual !== expected) throw new Error(`Dependency checksum mismatch: ${name}`);
}
await mkdir(path.join(out, 'web/lib'), { recursive: true });
await cp(path.join(root, 'reference/engine'), path.join(out, 'web'), { recursive: true });
await cp(path.join(root, 'vendor/three.module.js'), path.join(out, 'web/lib/three.module.js'));
await cp(path.join(root, 'reference/example/story.js'), path.join(out, 'web/story.js'));
const base = stripTypeScriptTypes(await readFile(path.join(root, 'vendor/toon.ts'), 'utf8'), { mode: 'strip' });
await writeFile(path.join(out, 'web/toon.js'), base + '\n' + await readFile(path.join(root, 'reference/engine/roman.js'), 'utf8'));
// Repair undefined GLSL behavior without mutating the supplied reference.
const enginePath = path.join(out, 'web/main.js');
const engine = await readFile(enginePath, 'utf8');
if (!engine.includes('smoothstep(.88, .72, dot(n, ns))')) throw new Error('Unexpected reference shader');
await writeFile(enginePath, engine.replace('smoothstep(.88, .72, dot(n, ns))', '(1.0 - smoothstep(.72, .88, dot(n, ns)))'));
await writeFile(path.join(out, 'dependencies.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared offline reference fixture');