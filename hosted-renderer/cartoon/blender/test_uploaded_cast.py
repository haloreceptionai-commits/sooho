import unittest
from art_director import human_cast
from shot_schema import validate_shot

LOOK = {'shirt': (.2, .3, .4), 'outfit': 'soldier', 'hat': 'helmet', 'hat_color': (.1, .1, .1)}


class UploadedCast(unittest.TestCase):
    def test_people_use_uploaded_rigs(self):
        man = human_cast({'id': 'hannibal', 'action': 'aim', 'held': 'rifle', 'pos': [0, 0]}, {'id': 'hannibal'}, LOOK)
        self.assertEqual(man['model'], 'uploaded-man'); self.assertEqual(man['action'], 'stand'); self.assertNotIn('held', man)
        queen = human_cast({'id': 'queen_mary', 'action': 'panic', 'pos': [0, 0]}, {'id': 'queen_mary'}, LOOK)
        self.assertEqual(queen['model'], 'uploaded-woman'); self.assertEqual(queen['action'], 'run')

    def test_shot_with_uploaded_cast_validates(self):
        c = human_cast({'id': 'guard', 'action': 'walk', 'pos': [0, 0], 'yaw': 0}, {'id': 'guard'}, LOOK)
        validate_shot({'set': 'neutral', 'duration': 1, 'camera': {'from': [0, -8, 1.6], 'look_at': [0, 0, 1]}, 'cast': [c]})


if __name__ == '__main__': unittest.main()
