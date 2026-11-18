"""Old stories get period rooms; painted object cards get a real volume (pure Python + numpy, no Blender)."""
import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import art_director as A
import card_relief as CR
from shot_schema import validate_shot
from test_art_director import manifest


class Era(unittest.TestCase):
    def shots(self, text):
        m = manifest([text], secs=4.0); m['script'] = text
        return [g['shot'] for g in A.plan(m)]

    def test_old_story_carries_its_year(self):
        for sh in self.shots('In 1869 a farmer dug up a giant stone man near Cardiff.'):
            self.assertEqual(sh['era'], 1869)
            validate_shot(sh)

    def test_modern_story_has_no_era(self):
        for sh in self.shots('In 1994 a company launched a new phone.'):
            self.assertNotIn('era', sh)

    def test_era_must_be_a_year_before_1900(self):
        base = {'set': 'neutral', 'duration': 1, 'camera': {'from': [0, -4, 1.5], 'look_at': [0, 0, 1]}, 'cast': [], 'objects': []}
        validate_shot({**base, 'era': 1500})
        for bad in (1950, 'old', True):
            with self.assertRaises(ValueError): validate_shot({**base, 'era': bad})

    def test_modern_furniture_is_filtered_by_name(self):
        for ok in ('lib:furniture-kit/loungeSofa', 'lib:furniture-kit/bookcaseOpen', 'asm:rug', 'lib:kit/carpet', 'lib:kit/bush', 'lib:kit/cart'):
            self.assertIsNone(A.MODERN_ITEM.search(ok), ok)
        for bad in ('lib:furniture-kit/cabinetTelevision', 'lib:furniture-kit/laptop', 'lib:kit/taxi', 'lib:kit/trafficLight'):
            self.assertTrue(A.MODERN_ITEM.search(bad), bad)


class HistoryVerbs(unittest.TestCase):
    def test_story_verbs_get_their_own_action(self):
        import activities as AC
        cases = {'Workers carved a giant out of gypsum with a chisel': 'swing', 'He charged fifty cents for tickets to see the giant': 'count', 'Hull finally confessed to the hoax': 'bow',
                 'Well diggers uncovered a huge stone foot': 'dig', 'They pitched a tent beside the giant': 'swing', 'The giant was exhibited to huge crowds': 'show', 'She carved the roast at dinner': 'chop'}
        for text, want in cases.items():
            p = AC.interpret(text); self.assertIsNotNone(p, text); self.assertEqual(p.activity, want, text)


class Relief(unittest.TestCase):
    def rgba(self, w, h, box):
        px = np.zeros((h, w, 4), np.float32); x0, x1, y0, y1 = box; px[y0:y1, x0:x1] = (.8, .5, .2, 1)
        return px.ravel()

    def test_trim_removes_the_transparent_margin(self):
        flat, w, h = CR.trim_to_figure(self.rgba(100, 160, (30, 70, 40, 120)), 100, 160, pad=2)
        self.assertEqual((w, h), (44, 84)); self.assertEqual(len(flat), w * h * 4)

    def test_trim_keeps_an_empty_image_unchanged(self):
        flat, w, h = CR.trim_to_figure(np.zeros(40 * 40 * 4, np.float32), 40, 40)
        self.assertEqual((w, h), (40, 40))

    def test_height_field_is_zero_at_the_edge_and_round_in_the_middle(self):
        alpha = CR.alpha_grid(self.rgba(96, 96, (10, 86, 10, 86)), 96, 96, columns=96)
        hf, mask = CR.height_field(alpha, .3)
        self.assertEqual(float(hf[0, 0]), 0.0)
        self.assertGreater(float(hf[48, 48]), .25); self.assertLessEqual(float(hf.max()), .3 + 1e-6)
        self.assertGreater(float(hf[48, 48]), float(hf[48, 14]))   # thicker in the middle than near the rim

    def test_box_blur_keeps_the_mean(self):
        a = np.random.default_rng(1).random((20, 20)).astype(np.float32)
        self.assertAlmostEqual(float(CR._box_blur(a, 2).mean()), float(a.mean()), delta=.03)


if __name__ == '__main__':
    unittest.main()
