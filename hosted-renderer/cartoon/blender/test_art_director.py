"""Rules of the Advanced art director (pure Python, no Blender)."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import art_director as A


def manifest(lines, cast=None, world='landscape', secs=3.0):
    words, cap, shots, t = [], [], [], 0.2
    for k, line in enumerate(lines):
        start = t
        for w in line.split():
            words.append({'text': w.lower(), 'start': round(t, 3), 'end': round(t + .3, 3)}); cap.append(w); t += secs / len(line.split())
        shots.append({'start': round(start * 30) if k else 0, 'end': round(t * 30), 'world': world, 'light': 'day', 'shot': 'medium', 'move': 'static', 'mood': 'calm',
                      'speaker': None, 'keyword': 0, 'props': [], 'fx': [], 'actors': [{'id': 'major', 'action': 'idle', 'expression': 'neutral', 'slot': 'center', 'facing': 0}]})
    for a, b in zip(shots, shots[1:]): b['start'] = a['end']
    return {'words': words, 'caption_words': cap, 'shots': shots, 'cast': cast or [{'id': 'major', 'outfit': 'soldier'}, {'id': 'bird', 'outfit': 'soldier', 'card': True}]}


class ArtDirector(unittest.TestCase):
    def test_every_frame_covered_once(self):
        m = manifest(['Farmers watched the wheat fields die.', 'The army marched into the outback with machine guns.', 'The emus scattered and ran.'], secs=5.5)
        segs = A.plan(m, {'bird.png'})
        frames = [f for g in segs for f in range(g['start'], g['end'])]
        self.assertEqual(frames, list(range(0, m['shots'][-1]['end'])))

    def test_long_lines_are_split_into_setups(self):
        m = manifest(['In nineteen thirty two the farmers of western australia begged the government for help against the birds.'], secs=7.5)
        self.assertGreaterEqual(len(A.plan(m)), 3)

    def test_camera_never_repeats_back_to_back(self):
        m = manifest([f'Line {k} about farmers and soldiers in the field.' for k in range(10)], secs=4)
        kinds = [g['notes']['camera_type'] for g in A.plan(m)]
        self.assertTrue(all(a != b for a, b in zip(kinds, kinds[1:])), kinds)
        self.assertGreaterEqual(len(set(kinds)), 5)

    def test_spoken_place_wins(self):
        m = manifest(['The farmers lost their wheat crops.', 'Officials in parliament signed the report.', 'The ship sailed across the sea.'])
        self.assertEqual([g['notes']['set'] for g in A.plan(m) if g['start'] in (s['start'] for s in m['shots'])], ['farm_field', 'office', 'ship_deck'])

    def test_running_animals_move_and_people_react(self):
        m = manifest(['The soldiers opened fire but the emus scattered and ran.'], secs=2.5)
        g = A.plan(m, {'bird.png'})[0]['shot']
        self.assertTrue(g['cards'] and all('to' in c for c in g['cards']))
        self.assertTrue(all(c['action'] != 'run' for c in g['cast']))

    def test_walkers_cross_the_frame(self):
        m = manifest(['The major walked across the plains.'], secs=2.5)
        c = A.plan(m)[0]['shot']['cast'][0]
        self.assertEqual(c['action'], 'walk')

    def test_herd_words_fill_the_frame_with_cards(self):
        m = manifest(['Twenty thousand emus invaded the farms.'], secs=2.5)
        self.assertEqual(len(A.plan(m, {'bird.png'})[0]['shot']['cards']), 6)

    def test_gunfire_effects_start_on_the_word(self):
        m = manifest(['They waited and then fired.'], secs=2.5)
        fx = [e for e in A.plan(m)[0]['shot'].get('effects', []) if e['kind'] == 'sparks']
        self.assertTrue(fx and fx[0]['start'] > 1.0)

    def test_no_money_bag_unless_money_is_spoken(self):
        m = manifest(['The emus ate the wheat.'], secs=2.5); m['shots'][0]['props'] = [{'kind': 'coins', 'place': 'hand', 'motion': 'none', 'asset': ''}]
        self.assertEqual(A.plan(m, {'bird.png'})[0]['shot']['objects'], [])

    def test_props_are_whitelisted_models(self):
        from shot_schema import PROP_IDS
        m = manifest(['The farmers loaded barrels and crates onto the cart.'], secs=3)
        for g in A.plan(m):
            for p in g['shot'].get('props', []): self.assertIn(p['id'], PROP_IDS)


    # ---- Stage 1 owner rules (Nov 16 2026)
    def test_location_names_the_kit_or_neutral(self):
        self.assertEqual(A.match_location("Commercial Street in Boston's North End, 1919"), 'street')
        self.assertEqual(A.match_location('a Boston courtroom, 1925'), 'neutral')
        self.assertEqual(A.match_location('molasses tank yard by the harbor'), 'neutral')
        self.assertEqual(A.match_location('a dusty country road outside St. Louis, 1904'), 'farm_field')
        self.assertEqual(A.match_location('a legal desk in a company office, downtown Boston, 1919, indoors'), 'office')
        self.assertEqual(A.match_location('steel tank perimeter walkway, Boston North End, outdoors'), 'neutral')

    def test_free_text_location_overrides_world(self):
        m = manifest(['The tank burst.', 'The judge ruled.'], world='town')
        m['shots'][0]['location'] = 'Commercial Street, Boston'; m['shots'][1]['location'] = 'a Boston courtroom'
        self.assertEqual(A.plan_locations(m), ['street', 'neutral'])

    def test_no_closest_wrong_kit_without_a_match(self):
        m = manifest(['It happened around midday.'], world='lab')
        self.assertEqual(A.plan_locations(m), ['neutral'])

    def test_keyword_never_adds_a_model(self):
        m = manifest(['The steel tank full of oil and water leaked.'], secs=3)
        for g in A.plan(m): self.assertNotIn('props', g['shot'])

    def test_painted_object_is_placed_and_shown(self):
        m = manifest(['The huge tank stood over the street.', 'Then the tank burst.'], secs=5.5)
        for sh in m['shots']:
            sh['location'] = 'Commercial Street, Boston'
            sh['props'] = [{'kind': 'asset', 'asset': 'card/molasses_tank', 'place': 'background', 'motion': 'none', 'phrase': 'huge riveted steel molasses storage tank', 'size': 'huge'}]
        segs = A.plan(m, {'obj-molasses_tank.png'})
        for i in range(2):
            mine = [g for g in segs if g['shot_index'] == i]
            self.assertTrue(any('obj-molasses_tank.png' in g['notes']['cards_shown'] for g in mine), [g['notes'] for g in mine])
            self.assertTrue(all(any(c['image'] == 'obj-molasses_tank.png' and c['height'] == 6.0 for c in g['shot']['cards']) for g in mine))


if __name__ == '__main__':
    unittest.main()
