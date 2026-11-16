"""Advanced place specs (manifest v3): strict validation, deterministic layout, legacy compatibility."""
import json, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import place_spec as P
import art_director as A
from shot_schema import validate_shot
from test_art_director import manifest

PASS = {'terrain': 'mountain_pass', 'time': 'night', 'weather': 'clear', 'dressing': [{'id': 'ox_burning', 'count': 6}, {'id': 'torch', 'count': 2}]}


class PlaceSpec(unittest.TestCase):
    def test_valid_spec_passes(self):
        self.assertIs(P.validate(PASS, 0), PASS)

    def test_unknown_place_is_a_clear_stop_not_neutral(self):
        with self.assertRaisesRegex(P.PlaceError, "Scene 3 needs the place 'aqueduct'"):
            P.validate({**PASS, 'terrain': 'aqueduct'}, 2)

    def test_invented_dressing_rejected(self):
        with self.assertRaisesRegex(P.PlaceError, "needs 'war_elephant'"):
            P.validate({**PASS, 'dressing': [{'id': 'war_elephant'}]}, 0)

    def test_bad_time_weather_count(self):
        for bad in ({**PASS, 'time': 'noon'}, {**PASS, 'weather': 'hail'}, {**PASS, 'dressing': [{'id': 'ox', 'count': 50}]}, {**PASS, 'extra': 1}):
            with self.assertRaises(P.PlaceError): P.validate(bad, 0)

    def test_water_items_need_a_river(self):
        with self.assertRaisesRegex(P.PlaceError, 'needs water'):
            P.validate({**PASS, 'dressing': [{'id': 'boat'}]}, 0)
        P.validate({'terrain': 'river_crossing', 'time': 'day', 'dressing': [{'id': 'boat'}]}, 0)

    def test_era_conflict_for_kits(self):
        with self.assertRaisesRegex(P.PlaceError, 'does not fit'):
            P.validate({'terrain': 'saloon', 'time': 'day'}, 0, era=-217)

    def test_entry_without_passing_render_check_is_refused(self):
        audit = json.loads((Path(P.__file__).parent / 'registry-audit.json').read_text())
        self.assertTrue(all(audit[i]['pass'] and audit[i]['hash'] == P.entry_hash(i) for i in P.DRESSING), 'run registry_check.py')
        old = P.DRESSING['torch']; P.DRESSING['torch'] = {**old, 'height': 9.9}   # definition changed -> hash stale
        try:
            with self.assertRaisesRegex(P.PlaceError, 'local render check'): P.validate({**PASS, 'dressing': [{'id': 'torch'}]}, 0)
        finally: P.DRESSING['torch'] = old

    def test_layout_is_deterministic_and_keeps_cast_area_clear(self):
        a, b = P.compile_place(PASS, 4), P.compile_place(PASS, 4)
        self.assertEqual(a, b)
        self.assertEqual(sum(1 for i in a['items'] if i['id'] == 'ox_burning'), 6)
        for it in a['items']:
            x, y, _ = it['pos']; self.assertGreater((x * x + y * y) ** .5, P.CLEAR, it)
        P.validate_compiled(a)

    def test_cast_area_is_flat_on_every_terrain(self):
        for t in P.TERRAINS:
            for x, y in ((0, 0), (1.5, -1), (-2, 2)): self.assertEqual(P.height(t, x, y, 3), 0.0, t)
        self.assertGreater(P.height('mountain_pass', 30, 0, 3), 15)       # real walls, not a flat plane
        self.assertLess(P.height('river_crossing', 12, P.RIVER_Y, 3), -0.5)  # a real channel

    def test_director_uses_place_and_drops_backdrop(self):
        m = manifest(['At night Hannibal was trapped in a mountain pass.', 'The Romans waited in their camp.'])
        m['shots'][0]['place'] = PASS; m['shots'][0]['location'] = 'a mountain pass in Italy, 217 BC'
        m['shots'][1]['place'] = {'terrain': 'camp', 'time': 'dusk', 'weather': 'fog', 'dressing': [{'id': 'spear', 'count': 2}]}
        segs = A.plan(m, {'bg-mountain_pass_italy-far.png', 'bird.png'})
        first = [g['shot'] for g in segs if g['shot_index'] == 0]
        self.assertTrue(all(s['place']['terrain'] == 'mountain_pass' and s['lighting'] == 'night' and 'backdrop' not in s for s in first))
        second = [g['shot'] for g in segs if g['shot_index'] == 1][0]
        self.assertEqual((second['lighting'], second['haze']), ('sunset', 0.02))

    def test_legacy_manifest_unchanged(self):
        m = manifest(['The farmers lost their wheat crops.', 'Officials in parliament signed the report.'])
        segs = A.plan(m)
        self.assertTrue(all('place' not in g['shot'] for g in segs))
        self.assertEqual([g['notes']['set'] for g in segs if g['start'] in (s['start'] for s in m['shots'])], ['farm_field', 'office'])

    def test_schema_rejects_tampered_place(self):
        shot = A.plan(manifest(['Night in the pass.']) | {})[0]['shot']
        bad = dict(shot, place={**P.compile_place(PASS), 'items': [{'id': 'torch', 'model': 'pirate-kit/cannon', 'pos': [5, 5, 0], 'height': 1, 'yaw': 0}]})
        with self.assertRaises(ValueError): validate_shot(bad)


if __name__ == '__main__':
    unittest.main()
