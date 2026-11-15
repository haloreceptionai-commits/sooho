import math
import unittest
from object_motion import fuse_position,pour_position,burst_position,exploded,spin_angle


class ObjectMotionTest(unittest.TestCase):
    def test_ember_follows_actual_wavy_fuse(self):
        self.assertEqual(fuse_position(0),(0,-1.45,.04))
        self.assertAlmostEqual(fuse_position(1.5)[1],-.175)
        self.assertAlmostEqual(fuse_position(.75)[0],.06*math.sin(37.5*.13))

    def test_pour_releases_over_lip_and_lands_above_ground(self):
        rest=(.2,.1,.074)
        self.assertEqual(pour_position(rest,0),rest)
        self.assertLess(pour_position(rest,2)[1],-.59)
        for f in range(60):self.assertGreaterEqual(pour_position(rest,f/30)[2],.025)

    def test_explosion_switches_intact_mesh_off_at_event(self):
        self.assertFalse(exploded(.64));self.assertTrue(exploded(.65))

    def test_fragments_separate_and_never_cross_ground(self):
        self.assertEqual(burst_position(0,0),(0,0,.38))
        self.assertGreater(math.dist(burst_position(1.9,0),burst_position(1.9,4)),1)
        for f in range(60):
            for i in range(8):self.assertGreaterEqual(burst_position(f/30,i)[2],.08)

    def test_drill_crank_is_not_aliased_at_review_frames(self):
        angles=[spin_angle((f-1)/30) for f in [1,16,36,60]]
        self.assertGreater(len({round(a%math.tau,3) for a in angles}),3)