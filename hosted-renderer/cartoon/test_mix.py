import unittest
import numpy as np
from mix import mix_stems

class MixerTests(unittest.TestCase):
    def setUp(self):
        t = np.arange(48000) / 48000
        self.voice = (0.2 * np.sin(2 * np.pi * 220 * t))[:, None]
        self.music = (0.08 * np.sin(2 * np.pi * 110 * t))[:, None]

    def test_music_half_voice_rms(self):
        _, report = mix_stems(self.voice, self.music, self.music, 48000)
        self.assertAlmostEqual(report["music_rms_ratio"], 0.5, places=10)

    def test_sfx_peak_cap(self):
        sfx = np.zeros_like(self.voice); sfx[100] = 0.9
        _, report = mix_stems(self.voice, self.music, sfx, 48000)
        self.assertLessEqual(report["sfx_peak_ratio"], 0.7000000001)
        self.assertLessEqual(report["sfx_rms_ratio"], 0.5)

    def test_voice_unchanged_without_stems(self):
        zero = np.zeros_like(self.voice)
        result, _ = mix_stems(self.voice, zero, zero, 48000)
        np.testing.assert_array_equal(result, self.voice)

    def test_silent_voice_rejected(self):
        with self.assertRaisesRegex(ValueError, "silent"):
            mix_stems(np.zeros_like(self.voice), self.music, self.music, 48000)

    def test_mismatched_timeline_rejected(self):
        with self.assertRaisesRegex(ValueError, "same"):
            mix_stems(self.voice, self.music[:-1], self.music, 48000)

if __name__ == "__main__":
    unittest.main()