"""The bake -> draw -> post scheduler of blender_bridge.render_range, driven by a fake Blender (a tiny python script) so no 3D engine is needed."""
import hashlib, json, os, stat, sys, tempfile, types, unittest
from unittest import mock
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

cap = types.ModuleType('capture')
cap.fingerprint = lambda p: 'x'
cap.atomic_json = lambda path, obj: Path(path).write_text(json.dumps(obj))
cap.valid_frame = lambda file, meta: bool(meta) and Path(file).exists() and hashlib.sha256(Path(file).read_bytes()).hexdigest() == meta['sha256']
sys.modules['capture'] = cap
import blender_bridge as b          # noqa: E402
from test_blender_bridge import manifest   # noqa: E402

FAKE = '''#!{py}
import json, os, sys
from PIL import Image
argv = sys.argv[sys.argv.index('--') + 1:]; shot = json.load(open(argv[0])); out = argv[1]; mode = os.environ.get('BLEND_MODE', '')
log = open(os.environ['FAKE_LOG'], 'a'); log.write(mode + ' ' + os.path.basename(out) + '\\n'); log.close()
if os.environ.get('FAKE_FAIL') == mode and mode: sys.exit(3)
if mode == 'bake':
    open(os.path.join(out, 'scene.blend'), 'w').write('blend'); sys.exit(0)
if mode == 'render' and not os.path.exists(os.environ['BLEND_FILE']): sys.exit(4)
for f in shot.get('frames') or range(1, round(shot['duration'] * 30) + 1):
    Image.new('RGB', (shot.get('size') or [270, 480])[0:2], (60 + f % 100, 120, 160)).save(os.path.join(out, f'f_{{f:05d}}.png'))
'''


class SplitTests(unittest.TestCase):
    def run_bridge(self, **env):
        tmp = Path(tempfile.mkdtemp()); fake = tmp / 'fake_blender.py'
        fake.write_text(FAKE.format(py=sys.executable)); fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
        log = tmp / 'log.txt'; out = tmp / 'out'; web = tmp / 'web'; web.mkdir()
        old = dict(os.environ)
        os.environ.update({'BLENDER_BIN': 'fake-blender', 'FAKE_LOG': str(log), 'BLENDER_ENGINE': 'cycles', 'UI_OVERLAYS': '1', **env})
        real = b.subprocess.run
        def run(cmd, *a, **k):    # the 'blender' executable is replaced by the fake script, everything else is untouched
            if cmd and cmd[0] == 'fake-blender': cmd = [sys.executable, str(fake), *cmd[1:]]
            return real(cmd, *a, **k)
        try:
            with mock.patch.object(b.subprocess, 'run', run): b.render_range(str(self.manifest_file(tmp)), str(web), str(out), 0, 119, '')
        finally: os.environ.clear(); os.environ.update(old)
        return out, log.read_text().split('\n')

    def manifest_file(self, tmp):
        p = tmp / 'm.json'; p.write_text(json.dumps(manifest())); return p

    def count(self, lines, what): return sum(1 for l in lines if l.startswith(what + ' '))

    def test_every_frame_is_drawn_from_a_baked_scene_when_the_split_is_on(self):
        out, lines = self.run_bridge()
        self.assertEqual(len(list(out.glob('f*.jpg'))), 120)
        self.assertGreaterEqual(self.count(lines, 'bake'), 1); self.assertGreaterEqual(self.count(lines, 'render'), 1)
        self.assertEqual(self.count(lines, ''), 0)          # nothing was built-and-drawn in one go

    def test_split_off_builds_and_draws_in_one_process_as_before(self):
        out, lines = self.run_bridge(BLEND_SPLIT='0')
        self.assertEqual(len(list(out.glob('f*.jpg'))), 120); self.assertEqual(self.count(lines, 'bake'), 0); self.assertEqual(self.count(lines, 'render'), 0)

    def test_a_failed_bake_falls_back_to_the_single_process_path_and_still_finishes(self):
        out, lines = self.run_bridge(FAKE_FAIL='bake')
        self.assertEqual(len(list(out.glob('f*.jpg'))), 120); self.assertGreaterEqual(self.count(lines, ''), 1)

    def test_a_failed_draw_from_the_baked_scene_falls_back_too(self):
        out, lines = self.run_bridge(FAKE_FAIL='render')
        self.assertEqual(len(list(out.glob('f*.jpg'))), 120)

    def test_frames_are_final_size_with_a_valid_checkpoint(self):
        from PIL import Image
        out, _ = self.run_bridge()
        ck = json.loads((out / 'checkpoint.json').read_text())
        self.assertEqual(len(ck['frames']), 120); self.assertEqual(Image.open(out / 'f000000.jpg').size, (1080, 1920))
        for f, meta in ck['frames'].items(): self.assertEqual(meta['sha256'], hashlib.sha256((out / f'f{int(f):06d}.jpg').read_bytes()).hexdigest())


if __name__ == '__main__': unittest.main()
