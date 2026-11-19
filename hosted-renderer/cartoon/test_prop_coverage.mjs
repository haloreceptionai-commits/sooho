import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawProp } from './prop-art.js';
globalThis.INK = '#351f22'; // Supplied by the pinned cast module in the assembled worker.
const vocabulary = JSON.parse(readFileSync(new URL('./vocabulary.json', import.meta.url)));
for (const kind of vocabulary.props.filter(k => k !== 'asset')) {
  test(`supported prop ${kind} can be drawn`, () => {
    let calls = 0;
    const g = new Proxy({}, { get: () => () => { calls++; } });
    const p = new Proxy({ g }, { get: (target, key) => key === 'g' ? target.g : () => { calls++; } });
    assert.doesNotThrow(() => drawProp(p, kind, 1));
    assert.ok(calls > 0);
  });
}