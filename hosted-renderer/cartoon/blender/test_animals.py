import unittest
from animals import ANIMAL


class AnimalTest(unittest.TestCase):
    def test_painted_animals_the_app_paints_are_recognised(self):
        for w in ('ox', 'oxen', 'war_elephant', 'donkey', 'kangaroo', 'buffalo', 'emu'): self.assertTrue(ANIMAL.search(w), w)

    def test_people_are_never_animals(self):
        for w in ('senator', 'pirate', 'stephen', 'catapult', 'cape_guard', 'hannibal'): self.assertFalse(ANIMAL.search(w), w)


if __name__ == '__main__': unittest.main()
