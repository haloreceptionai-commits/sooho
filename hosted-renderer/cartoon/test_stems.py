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

    def test_advanced_foley_starts_at_contact_without_a_forced_twist_hit(self):
        import os,tempfile,wave
        from pathlib import Path
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as d:
            with wave.open(str(Path(d)/'impact.wav'),'wb') as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(np.full(4800,1000,dtype='<i2').tobytes())
            with patch.dict(os.environ,{'CARTOON_SOUND_DIR':d}):
                _,sfx=synthesize(96000,40,[{'frame':15,'kind':'impact'}],advanced=True)
                self.assertEqual(np.count_nonzero(sfx[:24000]),0)
                self.assertGreater(np.count_nonzero(sfx[24000:28800]),0)
                self.assertEqual(np.count_nonzero(sfx[64000:]),0)

    def test_ambience_is_a_ducked_bed_in_the_music_stem_and_stays_inside_its_window(self):
        quiet,_=synthesize(48000*4,100,[],seed=3,advanced=True)
        music,sfx=synthesize(48000*4,100,[{'frame':30,'end':90,'kind':'rain'}],seed=3,advanced=True)
        self.assertEqual(np.count_nonzero(sfx),0)                                     # effects stem is not inflated by a bed
        np.testing.assert_array_equal(music[:48000],quiet[:48000])                    # nothing before the cue
        np.testing.assert_array_equal(music[3*48000:],quiet[3*48000:])                # nothing after its end
        self.assertGreater(float(np.abs(music[48000:3*48000]-quiet[48000:3*48000]).max()),0)

    def test_wind_crowd_and_bell_are_real_sounds_not_silence_or_foley_substitutes(self):
        music,sfx=synthesize(48000*4,100,[{'frame':0,'kind':'wind'},{'frame':45,'kind':'bell'}],advanced=True)
        base,_=synthesize(48000*4,100,[],advanced=True)
        self.assertGreater(float(np.abs(music-base).max()),0)       # wind: a bed
        self.assertGreater(np.count_nonzero(sfx[int(1.5*48000):]),0)  # bell: an effect at its word

    def test_new_kinds_are_silent_in_the_original_engine(self):
        for kind in ('boing','punch','rain','trombone'):
            m,s=synthesize(96000,40,[{'frame':15,'kind':kind}])
            m0,s0=synthesize(96000,40,[])
            np.testing.assert_array_equal(s[:64000],s0[:64000])    # the forced twist hit (frame 40) is the only sound either way

    def test_bad_end_or_gain_is_rejected(self):
        for bad in ({'frame':10,'kind':'rain','end':10},{'frame':10,'kind':'rain','end':99999},{'frame':10,'kind':'boing','gain':9}):
            with self.assertRaises(ValueError): synthesize(48000*2,40,[bad],advanced=True)

    def test_mood_beds_replace_the_score_and_keep_the_clock(self):
        for mood in ('lofi','sad'):
            a,_=synthesize(48000*8,150,[],seed=2,advanced=True,mood=mood)
            self.assertEqual(a.shape,(48000*8,1)); self.assertLess(float(np.max(np.abs(a))),.5); self.assertGreater(float(np.max(np.abs(a))),.1)
        q,_=synthesize(48000*8,150,[],seed=2,advanced=True)
        self.assertLess(float(np.max(np.abs(q))),.1)    # the default score is unchanged

    def test_advanced_editorial_and_metal_effects_are_word_timed(self):
        import sound_lib
        for kind in ('whoosh','reveal','coin','thunder'):
            with self.subTest(kind=kind):
                length=len(sound_lib.render(kind,1))
                _,sfx=synthesize(48000*5,140,[{'frame':15,'kind':kind}],advanced=True)
                self.assertEqual(np.count_nonzero(sfx[:24000]),0)
                self.assertGreater(np.count_nonzero(sfx[24000:24000+length//2]),0)
                self.assertEqual(np.count_nonzero(sfx[24000+length+100:]),0)

    def test_advanced_score_varies_and_remains_deterministic(self):
        a,_=synthesize(48000*12,240,[],seed=7,advanced=True)
        b,_=synthesize(48000*12,240,[],seed=7,advanced=True)
        np.testing.assert_array_equal(a,b)
        self.assertLess(float(np.max(np.abs(a))),.1)
        self.assertFalse(np.array_equal(a[48000:96000],a[96000:144000]))

if __name__ == '__main__': unittest.main()