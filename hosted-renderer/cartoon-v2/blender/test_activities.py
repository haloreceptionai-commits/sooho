"""The activity lexicon: what a line of narration makes a character do, and that every item and piece it needs really exists."""
import sys, unittest, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import activities as A
import character_motion as CM
from shot_schema import HOLD_PROPS

CASES = [
    ('She was baking cookies for the whole town', 'cook'), ('He cooked dinner for his family', 'cook'), ('The chef fried the eggs', 'cook'),
    ('The boy ate the cookie', 'eat'), ('She took a bite of the burger', 'eat'), ('He drank a glass of water', 'drink'),
    ('He drove his car down the highway', 'drive'), ('The driver steered around the corner', 'drive'), ('She rode her bike to school', 'ride'),
    ('The runner ran faster than anyone', 'run'), ('They fled from the burning city', 'run'), ('He walked across the bridge', 'walk'),
    ('She typed the password on her laptop', 'type'), ('The hacker coded all night', 'type'), ('He wrote a letter to the king', 'write'), ('She signed the contract', 'write'),
    ('He read the book for hours', 'read'), ('She called her mother on the phone', 'phone'), ('The tourist took a photo of the tower', 'photo'),
    ('The detective examined the clue', 'look'), ('The miners dug a deep tunnel', 'dig'), ('He swung the hammer', 'swing'), ('She swept the floor', 'sweep'),
    ('The artist painted a mural', 'paint'), ('He fished by the lake', 'fish'), ('She threw the ball over the wall', 'throw'), ('He kicked the football', 'kick'),
    ('The boxers fought in the ring', 'punch'), ('He knocked on the door', 'knock'), ('The crowd danced all night', 'dance'), ('They won the championship', 'cheer'),
    ('She waved goodbye', 'wave'), ('The audience clapped', 'clap'), ('He bowed to the queen', 'bow'), ('The soldier saluted the flag', 'salute'),
    ('She thought about the problem', 'think'), ('He shrugged and walked away', 'shrug'), ('The little girl cried', 'cry'), ('They laughed at the joke', 'laugh'),
    ('He slept in a small bed', 'sleep'), ('The friends hugged', 'hug'), ('The two leaders shook hands', 'handshake'), ('He climbed the ladder', 'climb'),
    ('She jumped over the fence', 'jump'), ('He pushed the heavy door', 'push'), ('Everyone panicked and screamed', 'panic'), ('He shouted at the crowd', 'shout'),
    ('The soldiers aimed their rifles', 'aim'), ('He carried the heavy boxes', 'carry'), ('She counted the money', 'count'),
]


# Explainer narration is full of words that look like actions but are not: a note of sound, the pitch of a tone, a sound wave, a single ball, a fish as food.
ABSTRACT = ['but pea-less whistles make a steady note that gets lost', 'a single loose ball spins inside and', 'sway, and pitch and', 'loudness wobble',
            'the pea does not make the note, a sharp', 'even without a pea, air hitting a sharp edge', 'makes a tone, like a kettle whistle', 'the sound wave travels through the air',
            'the ball swirl nudges that jet', 'the cost of a fish rose last year', 'heat flows from the hot side to the cold side', 'the boiling point of water changes with height',
            'the bow of the ship was damaged', 'there is a gap of two metres between the rails', 'the first bit of data arrived', 'he is mine, the story says', 'a type of steel',
            'the spring of the year came late', 'hope was lost', 'a draft of cold air', 'the scale of the problem is huge', 'the sign on the road said stop', 'the bed of the river dried up']
BAD = {'cook', 'eat', 'drink', 'drive', 'ride', 'type', 'write', 'read', 'phone', 'photo', 'dig', 'sweep', 'paint', 'fish', 'throw', 'kick', 'punch', 'knock', 'dance', 'wave', 'bow',
       'climb', 'sleep', 'hug', 'jump', 'play', 'carry', 'swing', 'count', 'cry', 'laugh', 'look', 'chop', 'pour', 'pull', 'push'}


class Lexicon(unittest.TestCase):
    def test_explainer_words_that_look_like_actions_do_nothing(self):
        wrong = [(t, A.interpret(t).activity) for t in ABSTRACT if A.interpret(t) and A.interpret(t).activity in BAD]
        self.assertEqual(wrong, [])

    def test_sentences_become_the_right_activity(self):
        wrong = [(t, want, (A.interpret(t) or A.Plan('none', 'none', 0)).activity) for t, want in CASES if (A.interpret(t) or A.Plan('none', 'none', 0)).activity != want]
        self.assertEqual(wrong, [])

    def test_words_that_only_look_like_an_activity_do_not_trigger_it(self):
        self.assertNotEqual(getattr(A.interpret('The boy ate the cookie'), 'activity', ''), 'cook')   # cookie is not cooking
        self.assertIsNone(A.interpret('The weather was cold and grey'))

    def test_every_motion_has_a_pose_and_every_prop_exists(self):
        import library
        for name, a in A.ACTIVITIES.items():
            self.assertIn(a['motion'], CM.ACTIONS, name)
            for prop, hand in a.get('held', []): self.assertIn(prop, HOLD_PROPS, name); self.assertIn(hand, ('left', 'right', 'both'))
            for piece in a.get('pieces', []): self.assertTrue(library.known(piece[0]), (name, piece[0]))
            self.assertIn(a.get('face', 'neutral') or 'neutral', CM.EXPRESSIONS, name)

    def test_the_place_follows_the_activity(self):
        self.assertEqual(A.interpret('She cooked soup').place_hint, 'kitchen'); self.assertEqual(A.interpret('He drove a car').vehicle, 'car')
        self.assertTrue(A.compatible(A.interpret('She cooked soup'), 'kitchen')); self.assertFalse(A.compatible(A.interpret('She cooked soup'), 'beach'))


class Motion(unittest.TestCase):
    def test_every_action_is_finite_reachable_and_keeps_the_feet_on_the_floor_or_a_seat(self):
        for a in sorted(CM.ACTIONS):
            for seat in (None, .53):
                for k in range(0, 160, 5):
                    p = CM.pose(a, k / 30, seat)
                    for key, v in p.items():
                        if isinstance(v, tuple): self.assertTrue(all(math.isfinite(x) for x in v), (a, key))
                    for side in ('left', 'right'):
                        sh, wr, hp, an = p[side + '_shoulder'], p[side + '_wrist'], p[side + '_hip'], p[side + '_ankle']
                        self.assertLessEqual(math.dist(sh, wr), .68 + 1e-6, (a, side, k)); self.assertLessEqual(math.dist(hp, an), .84 + 1e-6, (a, side, k))
                    if a not in ('fall', 'sleep', 'climb', 'jump', 'dance', 'run', 'walk', 'panic', 'kick', 'ride', 'drive'):
                        self.assertGreaterEqual(min(p['left_ankle'][2], p['right_ankle'][2]), .05, (a, k))

    def test_gestures_are_calm(self):
        # the old complaint: characters shake for no reason. A talking hand never moves faster than a person gestures.
        for a in ('talk', 'think', 'read', 'look_around', 'sit_talk'):
            prev = CM.pose(a, 0)
            for k in range(1, 120):
                cur = CM.pose(a, k / 30); step = max(math.dist(cur[s + '_wrist'], prev[s + '_wrist']) for s in ('left', 'right'))
                self.assertLess(step * 30, 1.6, (a, k)); prev = cur


if __name__ == '__main__': unittest.main()
