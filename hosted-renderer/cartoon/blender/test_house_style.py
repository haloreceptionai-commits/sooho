import math, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import art_director as A
import shot_schema as S
import blender_bridge as BB


class SpokenNumbers(unittest.TestCase):
    def test_years_and_counts_are_read_from_words(self):
        self.assertEqual(A.spoken_number('two hundred seventeen bc in campania'), '217 BC')
        self.assertEqual(A.spoken_number('about two thousand oxen with burning bundles'), '2,000 OXEN')
        self.assertEqual(A.spoken_number('four thousand roman soldiers are guarding it'), '4,000 ROMAN')

    def test_small_or_missing_numbers_give_no_sign(self):
        self.assertIsNone(A.spoken_number('he lived twenty years'))
        self.assertIsNone(A.spoken_number('the third watch deepened'))


class StoryLighting(unittest.TestCase):
    def test_warm_setup_cooler_pivot(self):
        warm, pivot, end = A.story_tint(0.1, 'day'), A.story_tint(0.70, 'day'), A.story_tint(0.98, 'day')
        self.assertGreater(warm[0], warm[2]); self.assertGreater(pivot[2], pivot[0]); self.assertGreater(end[0], end[2])

    def test_night_shift_is_gentler(self):
        self.assertLess(abs(A.story_tint(0.7, 'night')[2] - A.story_tint(0.1, 'night')[2]), abs(A.story_tint(0.7, 'day')[2] - A.story_tint(0.1, 'day')[2]))


class Framing(unittest.TestCase):
    def cam(self, d):
        return {'from': [0, -d, 1.5], 'look_at': [0, 0, 1.0], 'lens': 35}

    def test_subject_fills_the_rulebook_share(self):
        cast = [{'pos': [0, 0]}]
        for kind, lo, hi in (('close', 0.6, 0.85), ('medium', 0.45, 0.65)):
            c = A.fit_subject(self.cam(8.0), cast, kind)
            th = math.tan(math.atan(18.0 / 35)); frac = 1.9 / (2 * math.dist(c['from'], (0, 0, 0.95)) * th)
            self.assertTrue(lo <= frac <= hi, (kind, frac))

    def test_never_underground_or_top_down(self):
        c = A.fit_subject({'from': [0, -0.5, 6.0], 'look_at': [0, 0, 1.0], 'lens': 35}, [{'pos': [0, 0]}], 'medium')
        self.assertGreaterEqual(c['from'][2], 0.4); self.assertLess(c['from'][2], 3.5)

    def test_indoors_wide_shots_are_not_pushed_back_into_walls(self):
        c = A.fit_subject(self.cam(2.0), [{'pos': [0, 0]}], 'wide', indoor=True)
        self.assertEqual(c['from'], [0, -2.0, 1.5])


class CameraSpeed(unittest.TestCase):
    def test_every_shot_moves_within_the_band(self):
        still = {'from': [0, -4, 1.5], 'look_at': [0, 0, 1.0], 'lens': 35}
        fast = {'from': [0, -4, 1.5], 'look_at': [0, 0, 1.0], 'lens': 35, 'to': [3, -1, 1.5]}
        a = A.normalize_travel(dict(still), 3.0); b = A.normalize_travel(dict(fast), 3.0)
        self.assertGreaterEqual(A.travel_width_per_s(a, 3.0), 0.04)
        self.assertLessEqual(A.travel_width_per_s(b, 3.0), 0.36)


class CreamDips(unittest.TestCase):
    def test_dip_only_at_location_changes(self):
        m = {'shots': [{'start': 0, 'place': {'terrain': 'plain'}}, {'start': 90, 'place': {'terrain': 'plain'}}, {'start': 180, 'place': {'terrain': 'camp'}}]}
        self.assertEqual(BB.dip_frames(m), [180])
        self.assertAlmostEqual(BB.dip_alpha([180], 180), 0.92); self.assertEqual(BB.dip_alpha([180], 120), 0.0)
        self.assertGreater(BB.dip_alpha([180], 184), 0.0)


class SchemaKeys(unittest.TestCase):
    def test_tint_and_label_are_validated(self):
        ok = S.validate_shot({'set': 'neutral', 'duration': 1.0, 'camera': {'from': [0, -4, 1.5], 'look_at': [0, 0, 1.0], 'lens': 35, 'fstop': 5}, 'cast': [], 'objects': [],
                              'engine': 'cycles', 'samples': 8, 'size': [432, 768], 'grade': 'Punchy', 'tint': [1.0, 0.95, 0.86], 'label': {'text': '217 BC', 'pos': [1.0, 2.0], 'yaw': 10, 'scale': 0.8}})
        self.assertEqual(ok['label']['text'], '217 BC')
        base = {'set': 'neutral', 'duration': 1.0, 'camera': {'from': [0, -4, 1.5], 'look_at': [0, 0, 1.0], 'lens': 35, 'fstop': 5}, 'cast': [], 'objects': [], 'engine': 'cycles', 'samples': 8, 'size': [432, 768], 'grade': 'Punchy'}
        with self.assertRaises(ValueError): S.validate_shot({**base, 'label': {'text': '<script>', 'pos': [0, 0], 'yaw': 0}})
        with self.assertRaises(ValueError): S.validate_shot({**base, 'tint': [5, 1, 1]})


if __name__ == '__main__':
    unittest.main()
