"""Shot validator rules: python3 blender/test_shot_schema.py"""
import copy, os, sys, unittest, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shot_schema import validate_shot

BASE = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots', 'mine-push-in.json')))


def bad(**patch):
    s = copy.deepcopy(BASE); s.update(patch); return s


class ShotSchema(unittest.TestCase):
    def test_baked_shot_is_valid(self):
        self.assertEqual(validate_shot(copy.deepcopy(BASE))['set'], 'mine_tunnel')

    def test_full_hd_vertical_size_allowed(self):
        validate_shot(bad(size=[1080, 1920]))

    def test_unknown_set_rejected(self):
        with self.assertRaises(ValueError): validate_shot(bad(set='spaceship'))

    def test_unknown_key_rejected(self):  # no free code or extra instructions can ride along
        with self.assertRaises(ValueError): validate_shot(bad(script='import os'))

    def test_duration_limits(self):
        with self.assertRaises(ValueError): validate_shot(bad(duration=0.1))
        with self.assertRaises(ValueError): validate_shot(bad(duration=13))

    def test_engine_limited(self):
        with self.assertRaises(ValueError): validate_shot(bad(engine='unreal'))

    def test_cast_limit_twelve(self):
        with self.assertRaises(ValueError): validate_shot(bad(cast=[{'pos': [0, 0]}] * 13))

    def test_booleans_are_not_numbers(self):
        with self.assertRaises(ValueError): validate_shot(bad(size=[True, 1920]))


if __name__ == '__main__':
    unittest.main()
