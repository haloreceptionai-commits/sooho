"""Tests for the topic -> world router. Pure Python: no Blender needed."""
import unittest

import world_topics as wt
from shot_schema import validate_shot


class TopicRouting(unittest.TestCase):
    def check(self, topic, zone):
        self.assertEqual(wt.resolve(topic)['zone'], zone, topic)

    def test_war_goes_to_battlefield(self):
        self.check('war at night', 'Battlefield')
        self.check('battle field in rain', 'Battlefield')

    def test_road_goes_to_highway(self):
        self.check('road', 'Highway (Elevated)')
        self.check('highway with traffic', 'Highway (Elevated)')

    def test_house_goes_to_suburb(self):
        self.check('house', 'Suburb (Private Street)')
        self.check('houses in a quiet street', 'Suburb (Private Street)')

    def test_high_street_beats_street(self):
        self.check('high street with cars', 'High Street')

    def test_town_centre_and_village(self):
        self.check('town centre', 'Downtown (City Centre)')
        self.check('village', 'Village')

    def test_every_zone_name_routes_to_itself(self):
        for z in wt.MANIFEST:
            self.assertEqual(wt.resolve(z['name'])['zone'], z['name'], z['name'])

    def test_unknown_topic_uses_default_and_says_so(self):
        plan = wt.resolve('zzzz qqqq')
        self.assertEqual(plan['zone'], wt.DEFAULT_ZONE)
        self.assertFalse(plan['matched'])

    def test_lighting_words(self):
        self.assertEqual(wt.lighting_for('war at night'), 'night')
        self.assertEqual(wt.lighting_for('village at sunset'), 'sunset')
        self.assertEqual(wt.lighting_for('market in the rain'), 'rain')
        self.assertEqual(wt.lighting_for('office'), 'day')

    def test_high_street_road_only_when_asked(self):
        self.assertTrue(wt.resolve('high street with cars')['road'])
        self.assertFalse(wt.resolve('high street')['road'])


class ShotContract(unittest.TestCase):
    def test_every_zone_makes_a_valid_shot(self):
        for z in wt.MANIFEST:
            validate_shot(wt.make_shot(z['name']))

    def test_camera_is_zone_local_and_small(self):
        for z in wt.MANIFEST:
            shot = wt.make_shot(z['name'])
            for v in shot['camera']['from'] + shot['camera']['look_at']:
                self.assertLess(abs(v), 800, z['name'])

    def test_people_default_and_validity(self):
        for z in wt.MANIFEST:
            shot = wt.make_shot(z['name'])
            self.assertEqual(len(shot['cast']), 4, z['name'])
            eye = shot['camera']['from']
            for ch in shot['cast']:
                # people stand within 20 m of the camera, ahead or beside it
                self.assertLess(abs(ch['pos'][0] - eye[0]) + abs(ch['pos'][1] - eye[1]), 40, z['name'])
            validate_shot(shot)

    def test_people_count_is_clamped_and_zero_allowed(self):
        self.assertEqual(wt.make_shot('village', people=0)['cast'], [])
        self.assertEqual(len(wt.make_shot('village', people=99)['cast']), 12)

    def test_battlefield_people_are_soldiers(self):
        for ch in wt.make_shot('war')['cast']:
            self.assertIn(ch['outfit'], ('soldier', 'armor'))

    def test_world_file_exists_for_every_zone(self):
        for z in wt.MANIFEST:
            rel = wt.resolve(z['name'])['file']
            self.assertTrue((wt.PIPE / rel).is_file(), rel)

    def test_world_block_rejects_paths_outside_worlds(self):
        shot = wt.make_shot('village')
        shot['world']['file'] = 'worlds/../../secret.glb'
        with self.assertRaises(ValueError):
            validate_shot(shot)

    def test_world_and_place_cannot_both_be_set(self):
        shot = wt.make_shot('village')
        shot['place'] = {'terrain': 'flat'}
        with self.assertRaises(ValueError):
            validate_shot(shot)


if __name__ == '__main__':
    unittest.main()
