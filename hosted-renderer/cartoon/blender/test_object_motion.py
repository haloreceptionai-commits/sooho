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

from object_motion import rail_gap,rail_end_shift,kink_offset,bolt_piece


class RailJointMotionTest(unittest.TestCase):
    def ends(self,action,t):
        return (-.02+rail_end_shift(action,t,-1),.02+rail_end_shift(action,t,1))

    def test_segment_shifts_reproduce_the_gap_every_frame(self):
        for action in ('hold','expand','break'):
            for f in range(60):
                l,r=self.ends(action,f/30);self.assertAlmostEqual(r-l,rail_gap(action,f/30))

    def test_heat_closes_and_cold_opens(self):
        self.assertGreater(rail_gap('expand',0),rail_gap('expand',2)*5)
        self.assertGreater(rail_gap('break',2),rail_gap('break',0)*5)
        self.assertEqual(rail_end_shift('break',2,-1),0)  # bolted side does not move

    def test_welded_rail_kinks_in_the_middle_only(self):
        self.assertEqual(kink_offset(0,.5),0);self.assertAlmostEqual(kink_offset(2,.5),.26)
        self.assertAlmostEqual(kink_offset(2,0),0);self.assertAlmostEqual(rail_gap('buckle',1),0)

    def test_snapped_bolts_fall_but_stay_on_ballast(self):
        rest=(.1,.36,.215);self.assertEqual(bolt_piece(rest,.5,0),rest)
        for f in range(60):self.assertGreaterEqual(bolt_piece(rest,f/30,f)[2],.1)
        self.assertNotEqual(bolt_piece(rest,2,0),rest)
