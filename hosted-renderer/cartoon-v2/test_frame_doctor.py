import hashlib, json, tempfile, unittest
from pathlib import Path
from PIL import Image
import frame_doctor as D


def make(folder, colours):
    ck = {'input_hash': 'x', 'frames': {}}
    for i, c in enumerate(colours):
        p = folder / f'f{i:06d}.jpg'; Image.new('RGB', (216, 384), c).save(p, 'JPEG', quality=95)
        ck['frames'][str(i)] = {'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    (folder / 'checkpoint.json').write_text(json.dumps(ck))


GOOD, BLACK, NIGHT, CREAM = (120, 100, 80), (0, 0, 0), (30, 40, 70), (247, 239, 217)


class DoctorTests(unittest.TestCase):
    def test_black_is_bad_but_night_and_the_cream_dip_are_not(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d); make(f, [GOOD, BLACK, NIGHT, CREAM])
            self.assertEqual(D.scan(f, 4), [1])

    def test_groups(self): self.assertEqual(D.groups([5, 6, 7, 10, 12, 13]), [(5, 7), (10, 10), (12, 13)])

    def test_redrawn_frames_replace_black_ones_and_update_the_checkpoint(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d); make(f, [GOOD, BLACK, BLACK, GOOD])
            def rerender(first, last, out):
                make(out, [GOOD] * (last + 1))
            r = D.heal(f, 4, rerender, log=lambda *_: None)
            self.assertEqual((r['bad_found'], r['redrawn'], r['copied']), (2, 2, 0))
            self.assertEqual(D.scan(f, 4), [])
            ck = json.loads((f / 'checkpoint.json').read_text())
            for i in range(4): self.assertEqual(ck['frames'][str(i)]['sha256'], hashlib.sha256((f / f'f{i:06d}.jpg').read_bytes()).hexdigest())

    def test_when_redrawing_fails_the_nearest_good_frame_is_copied_so_the_video_still_completes(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d); make(f, [BLACK, BLACK, GOOD, BLACK])
            def boom(*_): raise RuntimeError('blender crashed')
            r = D.heal(f, 4, boom, log=lambda *_: None)
            self.assertEqual((r['bad_found'], r['redrawn'], r['copied']), (3, 0, 3))
            self.assertEqual(D.scan(f, 4), [])
            ck = json.loads((f / 'checkpoint.json').read_text())
            self.assertEqual(ck['frames']['0']['sha256'], ck['frames']['2']['sha256'])     # the first frames borrow the next good one

    def test_a_redraw_that_is_still_black_does_not_count(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d); make(f, [GOOD, BLACK, GOOD])
            r = D.heal(f, 3, lambda a, b, out: make(out, [BLACK] * (b + 1)), log=lambda *_: None)
            self.assertEqual((r['redrawn'], r['copied']), (0, 1))

    def test_a_clean_render_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d); make(f, [GOOD] * 3); before = (f / 'checkpoint.json').read_text()
            self.assertEqual(D.heal(f, 3, lambda *a: 1 / 0, log=lambda *_: None)['bad_found'], 0)
            self.assertEqual((f / 'checkpoint.json').read_text(), before)


if __name__ == '__main__': unittest.main()
