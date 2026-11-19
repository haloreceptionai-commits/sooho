import unittest
from world_pack import place_slug, story_year, kit_fits_era, backdrop_for
from art_director import plan_locations, NEUTRAL
from shot_schema import validate_shot


def manifest(locs, script):
    return {'script': script, 'shots': [{'start': i, 'end': i + 1, 'location': l} for i, l in enumerate(locs)], 'words': []}


class WorldPackTest(unittest.TestCase):
    def test_slug_matches_typescript_rules(self):
        self.assertEqual(place_slug('Boston North End street, 1919'), place_slug('Boston North End street'))
        self.assertEqual(place_slug('The dusty road near St. Louis'), 'dusty_road_st_louis')

    def test_year(self):
        self.assertEqual(story_year('In 1919 ... 1925 ... 1919'), 1919)
        self.assertIsNone(story_year('no year'))
        self.assertEqual(story_year('217 BC. Rome waits.'), -217)
        self.assertEqual(place_slug('Narrow mountain pass, 217 BC'), place_slug('Narrow mountain pass'))
        self.assertFalse(kit_fits_era('castle', -217))

    def test_medieval_kit_never_used_for_modern_era(self):
        self.assertFalse(kit_fits_era('street', 1919)); self.assertTrue(kit_fits_era('street', 1600)); self.assertTrue(kit_fits_era('street', None))
        self.assertEqual(plan_locations(manifest(['Boston street'], 'In 1919 a tank burst.')), [NEUTRAL])
        self.assertEqual(plan_locations(manifest(['village square'], 'In 1450 a plague came.')), ['village'])

    def test_painted_backdrop_outranks_kit(self):
        cards = {'bg-boston_street-far.png', 'bg-boston_street-mid.png'}
        self.assertEqual(plan_locations(manifest(['Boston street'], 'In 1700 ...'), cards), [NEUTRAL])
        self.assertEqual([b['layer'] for b in backdrop_for('Boston street, 1919', cards)], ['far', 'mid'])

    def test_schema_rejects_bad_backdrop(self):
        base = {'set': 'neutral', 'duration': 1, 'camera': {'from': [0, -5, 1.6], 'look_at': [0, 0, 1]}}
        validate_shot({**base, 'backdrop': [{'image': 'bg-boston_street-far.png', 'layer': 'far'}]})
        for bad in ({'image': '../x.png', 'layer': 'far'}, {'image': 'bg-a-mid.png', 'layer': 'far'}):
            with self.assertRaises(ValueError): validate_shot({**base, 'backdrop': [bad]})


if __name__ == '__main__': unittest.main()
