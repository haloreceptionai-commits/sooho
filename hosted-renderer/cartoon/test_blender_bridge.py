import unittest, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import blender_bridge as b

def manifest():
    W = [{'text': t, 'start': i * .4, 'end': i * .4 + .35} for i, t in enumerate('the army went to war against birds and lost'.split())]
    shot = lambda a, z, world, extra: {'start': a, 'end': z, 'world': world, 'light': 'golden', 'shot': 'wide', 'move': 'push_in', 'speaker': None, 'keyword': None,
                                     'props': [], 'fx': [], 'actors': [{'id': 'meredith', 'action': 'aim', 'expression': 'stern'}, {'id': 'bird', 'action': 'run', 'expression': 'grin'}], **extra}
    return {'captions': True, 'words': W, 'caption_words': [w['text'] for w in W],
            'cast': [{'id': 'meredith', 'outfit': 'soldier'}, {'id': 'bird', 'outfit': 'soldier'}],
            'shots': [shot(0, 60, 'landscape', {}), shot(60, 120, 'storm_sea', {'fx': ['rain', 'smoke'], 'shot': 'insert', 'move': 'shake'})]}

class Bridge(unittest.TestCase):
    def test_every_shot_compiles_to_a_valid_blender_shot(self):
        m = manifest(); shots = b.compile_all(m, {'bird.png'})
        self.assertEqual([s['set'] for s in shots], ['battlefield', 'ship_deck'])
        self.assertEqual(shots[1]['lighting'], 'rain')
        self.assertEqual(shots[0]['duration'], 2)
    def test_animals_become_painted_cards_people_become_3d_characters(self):
        s = b.compile_shot(manifest(), 0, {'bird.png'})
        self.assertEqual([c['id'] for c in s['cast']], ['meredith'])
        self.assertEqual(s['cast'][0]['outfit'], 'soldier')
        self.assertEqual([c['image'] for c in s['cards']], ['bird.png'])
    def test_camera_moves_and_effects_carry_over(self):
        s0, s1 = b.compile_all(manifest(), {'bird.png'})
        self.assertIn('to', s0['camera'])
        self.assertTrue(s1['camera']['shake'])
        self.assertEqual(sorted(e['kind'] for e in s1['effects']), ['rain', 'smoke'])
    def test_static_shots_still_move_so_qa_never_sees_a_frozen_picture(self):
        m = manifest(); m['shots'][0]['move'] = 'static'
        s = b.compile_shot(m, 0, set())
        self.assertNotEqual(s['camera']['to'], s['camera']['from'])
    def test_captions_match_web_engine_groups_of_three(self):
        words = b.caption_at(manifest(), 30)  # t=1.0s -> word index 2 ("went")
        self.assertEqual([w['text'] for w in words], ['the', 'army', 'went'])
        self.assertTrue(words[2]['key'] and words[2]['live'])

if __name__ == '__main__': unittest.main()
