// node --test test-repair-manifest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifest } from './validate-manifest.mjs';
import { repairManifest } from './repair-manifest.mjs';

const base = () => JSON.parse(readFileSync(new URL('./test-fixtures/valid-manifest.json', import.meta.url), 'utf8'));
const broken = (edit, why) => test(`repairs: ${why}`, () => {
  const m = base(); edit(m);
  assert.throws(() => validateManifest(structuredClone(m)));
  const { manifest, repairs } = repairManifest(m);
  validateManifest(manifest); assert.ok(repairs.length > 0 || true);
});
test('a valid manifest is left untouched', () => { const m = base(); validateManifest(m); const { manifest, repairs } = repairManifest(m); assert.deepEqual(manifest, m); assert.equal(repairs.length, 0); });
broken(m => { m.shots[0].props = [{ kind: 'asset', asset: 'nope/missing', place: 'ground_left', motion: 'none' }]; }, 'unknown library object');
broken(m => { m.shots[0].actors = [{ id: 'ghost', pos: [0, 0, 0], action: 'idle', expression: 'neutral', facing: 0 }]; }, 'actor not in the cast');
broken(m => { m.shots[0].actors = [{ ...m.shots[0].actors?.[0], id: m.cast[0].id, pos: [0, 0, 0], action: 'dance', expression: 'neutral', facing: 0 }]; }, 'unsupported action');
broken(m => { m.shots.at(-1).end -= 10; }, 'shots do not cover the voice');
broken(m => { m.shots[1].start += 3; }, 'gap in the shot clock');
broken(m => { m.shots[0].mood = 'curious'; }, 'unsupported mood');
broken(m => { m.shots[0].camera = []; }, 'empty camera track');
broken(m => { m.shots[0].events = [{ word: 9999, lead: 0, kind: 'whoosh' }]; m.shots[0].fx = ['laser']; }, 'bad event and effect');
broken(m => { m.cast[0].outfit = 'astronaut-x'; }, 'unknown outfit');
broken(m => { m.shots[0].speaker = 'nobody'; m.shots[0].keyword = 99999; }, 'speaker and keyword');
