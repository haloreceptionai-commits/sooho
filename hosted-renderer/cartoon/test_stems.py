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
        _, sfx = synthesize(96000,40,[{'frame':15,'kind':'impact'}])
        self.assertEqual(np.count_nonzero(sfx[:24000]),0)
        self.assertGreater(np.count_nonzero(sfx[24000:]),0)

    def test_no_sustained_beep_tone(self):
        music,_ = synthesize(48000*6,120,[])
        spec = np.abs(np.fft.rfft(music[:,0])); f = np.fft.rfftfreq(len(music),1/48000)
        self.assertLess(spec[f>400].max(), spec[f<400].max()*.05)

    def test_twist_gets_impact(self):
        _, sfx = synthesize(96000,30,[])
        self.assertGreater(np.count_nonzero(sfx[24000:]),0)

    def test_outside_clock_cues_rejected(self):
        with self.assertRaises(ValueError): synthesize(48000,15,[{'frame':30,'kind':'impact'}])

if __name__ == '__main__': unittest.main()