import unittest
from full_video_gate import video_errors, release_errors, STORIES, RECOVERY


def complete():
    return {'script_accepted': True, 'timing_source': 'script-conditioned-ctc',
            'alignment_reviewed': True, 'duration': 60, 'size': [1080, 1920], 'fps': 30,
            'decoded_frames': 1800, 'all_frames_verified': True, 'voice_samples_unchanged': True,
            'max_sound_error_frames': 1, 'lufs': -14, 'true_peak': -1,
            'scorecard': {'overall': 100, 'parts': {'render_quality': 100}},
            'blind_motion_review_passed': True, 'private_output_readback': True, 'elapsed_seconds': 900}


class FullVideoGateTest(unittest.TestCase):
    def test_missing_evidence_never_passes(self):
        self.assertGreater(len(video_errors('rail', {})), 10)

    def test_three_full_videos_are_required(self):
        self.assertTrue(any(e.startswith('mine:') for e in release_errors({'videos': {'rail': complete()}})))

    def test_sixty_second_video_needs_all_1800_frames(self):
        self.assertIn('rail: all 1800 motion frames must decode', video_errors('rail', complete() | {'decoded_frames': 1799}))

    def test_estimated_speech_cannot_pass(self):
        self.assertIn('rail: real speech alignment required', video_errors('rail', complete() | {'timing_source': 'syllable-estimated'}))

    def test_sound_outside_one_frame_fails(self):
        self.assertIn('rail: every sound must be within one frame', video_errors('rail', complete() | {'max_sound_error_frames': 2}))

    def test_fifteen_minute_limit_is_measured(self):
        self.assertIn('rail: measured completion within 15 minutes required', video_errors('rail', complete() | {'elapsed_seconds': 901}))

    def test_loudness_and_true_peak_limits(self):
        self.assertIn('rail: -14 ±1 LUFS and ≤-1 dBTP required', video_errors('rail', complete() | {'lufs': -12}))
        self.assertIn('rail: -14 ±1 LUFS and ≤-1 dBTP required', video_errors('rail', complete() | {'true_peak': -.9}))

    def test_owner_review_and_real_recovery_required_before_launch(self):
        audit = {'videos': {n: complete() for n in STORIES}, 'prerequisites_accepted': True,
                 'recovery': {case: {'passed': True, 'real_execution': True} for case in RECOVERY}}
        self.assertEqual(release_errors(audit), ['Owner must review and approve all three final videos before launch'])
        self.assertEqual(release_errors(audit | {'owner_approved': True}), [])

    def test_mock_recovery_is_not_real_recovery(self):
        audit = {'recovery': {'worker_crash': {'passed': True, 'real_execution': False}}}
        self.assertIn('Real Blender recovery check missing: worker_crash', release_errors(audit))

    def test_one_weak_scorecard_dimension_blocks_parity(self):
        video = complete() | {'scorecard': {'overall': 100, 'parts': {'render_quality': 99}}}
        self.assertIn('rail: actual benchmark scorecard parity required in every dimension', video_errors('rail', video))