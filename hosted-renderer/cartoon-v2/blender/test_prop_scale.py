"""Props are drawn at their requested height unless that would make them absurdly wide; every recipe prop is checked against its measured size."""
import json
import unittest
from pathlib import Path
import place_spec as P
from prop_scale import fit_scale, MAX_FOOTPRINT
import art_director as AD

HERE = Path(__file__).parent
DIMS = json.loads((HERE / 'recipe-dims.json').read_text())


class FitScaleTests(unittest.TestCase):
    def test_normal_props_get_exactly_their_height(self):
        self.assertEqual(fit_scale(2.0, 1.0, 1.5), (2.0, False))

    def test_a_flat_model_asked_to_be_tall_is_clamped_instead_of_becoming_a_monster(self):
        f, clamped = fit_scale(4.0, .21, 2.44)         # the cyberpunk pipe: 2.4 m long, 0.2 m thick
        self.assertTrue(clamped); self.assertLessEqual(2.44 * f, 28.0 + 1e-6)

    def test_long_real_things_keep_their_proportions(self):
        f, clamped = fit_scale(4.0, 1.9, 12.16)        # a 12 m train carriage drawn 4 m tall is 25.6 m long
        self.assertFalse(clamped); self.assertAlmostEqual(f, 4.0 / 1.9)

    def test_the_cap_is_never_below_the_absolute_floor(self):
        f, clamped = fit_scale(.5, .01, 3.0); self.assertTrue(clamped); self.assertAlmostEqual(3.0 * f, MAX_FOOTPRINT)


class RecipeSizeTests(unittest.TestCase):
    def test_every_library_prop_of_every_recipe_is_drawn_at_a_sane_size(self):
        recipes = json.loads((HERE / 'place-registry.json').read_text())['recipes']; checked = 0; wide = []
        for name in recipes:
            for time in ('day', 'night'):
                out = P.compile_place({'terrain': name, 'time': time, 'weather': 'clear', 'seed': 3, 'dressing': []}, seed=3)
                for it in out.get('items', []):
                    if not it.get('id', '').startswith('lib:'): continue
                    d = DIMS.get(it['id'][4:]); self.assertIsNotNone(d, it['id'])
                    f, clamped = fit_scale(it['height'], max(d[2], 1e-3), max(d[0], d[1]))
                    checked += 1
                    self.assertFalse(clamped, (name, it['id'], it['height'], d))
                    if max(d) * f > 30: wide.append((name, it['id']))
        self.assertGreater(checked, 500)
        self.assertLessEqual(len(set(wide)), 6)       # a few long trains and clouds are meant to be big

    def test_the_alley_pipes_are_pipe_sized(self):
        items = P.compile_place({'terrain': 'cyberpunk_alley', 'time': 'night', 'weather': 'clear', 'seed': 3, 'dressing': []}, seed=3)['items']
        for it in items:
            if 'Pipe_1' in it['id']: self.assertLess(it['height'], 1.0)


class CloseUpTests(unittest.TestCase):
    def test_close_ups_use_a_wide_lens_and_a_deep_focus(self):
        self.assertLessEqual(AD.CLOSE_LENS, 35); self.assertGreaterEqual(AD.CLOSE_FSTOP, 4.0)
        self.assertLessEqual(AD.XCLOSE_LENS, 50); self.assertGreaterEqual(AD.XCLOSE_FSTOP, 3.0)

    def test_the_subject_sits_on_a_third_not_dead_centre(self):
        cam = {'from': [0.0, -3.0, 1.6], 'look_at': [0.0, 0.0, 1.5], 'lens': 30, 'to': [0.0, -2.5, 1.6], 'look_to': [0.0, 0.0, 1.5]}
        for side in (-1, 1):
            c = AD.rule_of_thirds(dict(cam), side)
            half_w = (18.0 / 30) * 9 / 16 * 3.0
            self.assertAlmostEqual(abs(c['look_at'][0]), half_w / 3, delta=.01)
            self.assertEqual(c['look_at'][0] > 0, side < 0)        # the aim point moves away from the side the subject should sit on
            self.assertEqual(c['look_at'][2], 1.5); self.assertEqual(c['look_at'][0], c['look_to'][0])

    def test_close_distance_gives_the_subject_its_share_of_the_frame(self):
        for kind, lens in (('close', AD.CLOSE_LENS), ('xclose', AD.XCLOSE_LENS)):
            d = 1.9 / (AD.SUBJECT_FRAC[kind] * 2 * 18.0 / lens)
            self.assertAlmostEqual(1.9 / (2 * d * 18.0 / lens), AD.SUBJECT_FRAC[kind], places=6)


if __name__ == '__main__': unittest.main()
