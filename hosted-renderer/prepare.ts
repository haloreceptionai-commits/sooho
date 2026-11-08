// Bundle only the hosted Actor's browser renderer, not the web application's build.
const result = await Bun.build({ entrypoints: ['src/lib/renderer.ts'], target: 'browser', format: 'esm', outdir: '/tmp/chronicle-actor-bundle', naming: 'renderer.js' });
if (!result.success) throw new Error(result.logs.join('\n'));
await Bun.write('hosted-renderer/renderer.js', await result.outputs[0]?.text() ?? '');