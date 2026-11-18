"""Concrete kit coverage, offline integrity and declarative safety checks."""
import hashlib
import json
from pathlib import Path
import unittest
from shot_schema import validate_shot
import library

HERE = Path(__file__).parent
KITS = json.loads((HERE / 'set-kits.json').read_text())
ENTRIES = json.loads((HERE / 'assets/manifest.json').read_text())


class SetLibraryTests(unittest.TestCase):
    def test_all_approved_places_exist(self):
        self.assertEqual(set(KITS), {'castle', 'village', 'battlefield', 'mine_tunnel', 'office', 'saloon', 'ship_deck', 'rail_yard', 'workshop', 'street', 'room', 'farm_field', 'outback', 'forest', 'market'})

    def test_every_asset_is_offline_and_hash_pinned(self):
        for e in ENTRIES:
            p = HERE / 'assets' / e['path']
            self.assertTrue(p.resolve().is_relative_to((HERE / 'assets').resolve()))
            self.assertEqual(e['license'], 'CC0-1.0')
            self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(), e['sha256'])

    def test_every_kit_uses_real_whitelisted_models(self):
        ids = {e['id'] for e in ENTRIES if e['kind'] == 'model'}
        for name, kit in KITS.items():
            self.assertGreaterEqual(len(kit['models']), 5, name)
            for m in kit['models']:
                self.assertTrue(m['id'] in ids or library.known(m['id']), m['id'])   # the offline kit manifest or the full CC0 library
                self.assertGreater(m['height'], 0)
                self.assertEqual(len(m['pos']), 3)

    def test_each_place_has_a_valid_full_resolution_test(self):
        for name in KITS:
            s = validate_shot(json.loads((HERE / 'shots' / f'set-{name}.json').read_text()))
            self.assertEqual(s['set'], name)
            self.assertEqual(s['size'], [1080, 1920])

    def test_four_lighting_modes_and_reject_unknown(self):
        s = json.loads((HERE / 'shots/set-castle.json').read_text())
        for mode in ['day', 'sunset', 'night', 'rain']:
            validate_shot({**s, 'lighting': mode})
        with self.assertRaises(ValueError): validate_shot({**s, 'lighting': 'remote-script'})

    def test_reject_unlisted_place(self):
        s = json.loads((HERE / 'shots/set-castle.json').read_text())
        with self.assertRaises(ValueError): validate_shot({**s, 'set': '../../secret'})

    def test_saloon_is_not_an_office_duplicate(self):
        saloon_ids = {m['id'] for m in KITS['saloon']['models']}
        self.assertNotIn('furniture-kit/desk', saloon_ids)
        self.assertIn('pirate-kit/bottle', saloon_ids)

    def test_street_village_and_market_use_modern_buildings(self):
        for name in ('village', 'street', 'market'):
            ids = {m['id'] for m in KITS[name]['models']}
            self.assertFalse(any(i in ids for i in ('q-medievalvillage/House_1', 'q-medievalvillage/House_2', 'q-medievalvillage/Inn', 'q-medievalvillage/Blacksmith')), name)
            self.assertTrue(any(i.startswith(('city-kit-suburban/', 'city-kit-commercial/')) for i in ids), name)

    def test_outdoors_use_complete_buildings_not_partial_facades(self):
        for name in ['village','street','rail_yard']:
            ids={m['id'] for m in KITS[name]['models']}
            self.assertTrue(any(i.startswith(('q-medievalvillage/House', 'city-kit-suburban/building')) for i in ids), name)   # village and street are modern now
            self.assertNotIn('fantasy-town-kit/wall-door', ids)

    def test_train_and_track_share_longitudinal_axis(self):
        models=[m for m in KITS['rail_yard']['models'] if m['id'].startswith('q-modulartrain/')]
        self.assertIn('q-modulartrain/Locomotive_Front',{m['id'] for m in models})
        for m in models:self.assertEqual(m['yaw'],90,m['id'])


if __name__ == '__main__': unittest.main()