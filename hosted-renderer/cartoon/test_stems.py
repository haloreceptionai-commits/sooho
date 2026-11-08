import unittest
import numpy as np
from stems import synthesize

class StemTests(unittest.TestCase):
    def test_locked_samples_and_determinism(self):
        a = synthesize(96000, 30, [{'frame':15,'kind':'pour'}], 12)
        b = synthesize(96000, 30, [{'frame':15,'kind':'pour'}], 12)
        for x,y in zip(a,b):
            self.assertEqual(x.shape,(96000,1)); np.testing.assert_array_equal(x,y)

    def test_cue_does_not_start_early(self):
        _, sfx = synthesize(96000,30,[{'frame':15,'kind':'impact'}])
        self.assertEqual(np.count_nonzero(sfx[:24000]),0)
        self.assertGreater(np.count_nonzero(sfx[24000:]),0)

    def test_march_stops_at_twist(self):
        music,_ = synthesize(96000,30,[])
        t = np.arange(48000)/48000
        expected = .065*np.sin(2*np.pi*65.4064*t)+.02*np.sin(2*np.pi*98*t)
        np.testing.assert_array_equal(music[48000:,0],expected)

    def test_outside_clock_cues_rejected(self):
        with self.assertRaises(ValueError): synthesize(48000,15,[{'frame':30,'kind':'impact'}])

if __name__ == '__main__': unittest.main()