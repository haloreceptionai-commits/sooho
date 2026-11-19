"""cartoon-v2 option: a manifest with renderer 'cartoon-v2' gets Everything World zone sets, and every other manifest is unchanged."""
import copy, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import blender_bridge as b
from test_blender_bridge import manifest


class CartoonV2Bridge(unittest.TestCase):
    def test_v2_manifest_shots_use_a_world_zone_and_no_procedural_place(self):
        m = manifest(); m['renderer'] = 'cartoon-v2'
        s = b.compile_shot(m, 0, set())
        self.assertIn('world', s)
        self.assertTrue(s['world']['file'].startswith('worlds/everything/') and s['world']['file'].endswith('.glb'))
        self.assertNotIn('place', s)
        self.assertEqual(s['lighting'], s['world']['lighting'])

    def test_v2_people_and_camera_are_kept_from_the_story(self):
        plain = b.compile_shot(manifest(), 0, set())
        m = manifest(); m['renderer'] = 'cartoon-v2'
        v2 = b.compile_shot(m, 0, set())
        self.assertEqual(plain['camera'], v2['camera'])
        self.assertEqual([c['id'] for c in plain['cast']], [c['id'] for c in v2['cast']])

    def test_other_manifests_have_no_world_block(self):
        s = b.compile_shot(manifest(), 0, set())
        self.assertNotIn('world', s)

    def test_a_place_term_routes_to_its_zone(self):
        w = b.world_for_shot({'place': {'terrain': 'battlefield', 'name': 'front line'}})
        self.assertEqual(w['zone'], 'Battlefield')

    def test_unknown_words_still_give_a_valid_zone(self):
        w = b.world_for_shot({'world': 'zzz', 'set': ''})
        self.assertTrue(w['file'].startswith('worlds/everything/'))


if __name__ == '__main__':
    unittest.main()
