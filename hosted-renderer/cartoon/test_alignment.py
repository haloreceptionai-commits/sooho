import unittest
import numpy as np
from alignment import align_ctc,align_words

class AlignmentTests(unittest.TestCase):
    def test_repeated_letters_require_blank(self):
        p=np.log(np.array([[.01,.99],[.99,.01],[.01,.99]]))
        result=align_ctc(p,[1,1])
        self.assertEqual(result[0]['start_frame'],0)
        self.assertEqual(result[1]['start_frame'],2)

    def test_impossible_alignment_stops(self):
        with self.assertRaises(ValueError): align_ctc(np.log(np.array([[.1,.9]])),[1,1])

    def test_exact_word_clock_and_confidence(self):
        p=np.log(np.array([[.01,.99,.0001],[.01,.99,.0001],[.99,.01,.0001]]))
        result=align_words(p,'A',{'A':1,'|':2},.3)
        self.assertAlmostEqual(result['words'][0]['end'],.2)
        self.assertFalse(result['review_required'])

    def test_uncertain_audio_is_not_certified(self):
        p=np.log(np.array([[.4,.6],[.4,.6]]))
        self.assertTrue(align_words(p,'A',{'A':1},.2)['review_required'])

    def test_numbers_never_guessed(self):
        with self.assertRaisesRegex(ValueError,'spoken'):
            align_words(np.zeros((3,2)),'30',{'A':1},.3)

if __name__ == '__main__': unittest.main()