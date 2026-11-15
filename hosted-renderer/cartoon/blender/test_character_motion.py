import math
import unittest
from character_motion import ACTIONS, EXPRESSIONS, pose, face_shape

class MotionTests(unittest.TestCase):
    def test_eight_plus_expressions(self):
        self.assertGreaterEqual(len(EXPRESSIONS),8)

    def test_every_action_has_connected_fixed_length_limbs(self):
        for action in ACTIONS:
            for frame in range(150):
                p=pose(action,frame/30)
                for side in ['left','right']:
                    for a,b,length in [('shoulder','elbow',.34),('elbow','wrist',.34),('hip','knee',.42),('knee','ankle',.42)]:
                        self.assertAlmostEqual(math.dist(p[side+'_'+a],p[side+'_'+b]),length,places=6,msg=f'{action} {frame}')

    def test_walk_and_run_advance(self):
        self.assertAlmostEqual(pose('walk',2)['root'][1],-1.4)
        self.assertAlmostEqual(pose('run',2)['root'][1],-2.6)

    def test_actions_are_not_identical(self):
        self.assertNotEqual(pose('aim',.3)['right_wrist'],pose('point',.3)['right_wrist'])
        self.assertNotEqual(pose('swing',.1)['right_wrist'],pose('swing',.4)['right_wrist'])

    def test_resting_legs_are_straight(self):
        p=pose('stand',0)
        for side in ['left','right']:
            self.assertAlmostEqual(p[side+'_knee'][0],p[side+'_hip'][0])
            self.assertAlmostEqual(p[side+'_knee'][1],0,places=6)

    def test_swing_left_hand_is_on_the_handle(self):
        for frame in range(150):
            p=pose('swing',frame/30);a=p['grip_angle'];w=p['right_wrist']
            self.assertAlmostEqual(math.dist(p['left_wrist'],(w[0],w[1]-.16*math.sin(a),w[2]+.16*math.cos(a))),0)

    def test_cheer_moves_and_pour_rotates(self):
        self.assertNotEqual(pose('cheer',.1)['left_wrist'],pose('cheer',.3)['left_wrist'])
        self.assertNotEqual(pose('pour',.1)['grip_angle'],pose('pour',.7)['grip_angle'])

    def test_nine_distinct_faces_and_mouth_cycle(self):
        self.assertEqual(len({tuple(face_shape(e).values()) for e in EXPRESSIONS}),9)
        self.assertNotEqual(face_shape('talk',0)['height'],face_shape('talk',.13)['height'])

    def test_stance_feet_do_not_slide(self):
        for action in ['walk','run']:
            a,b=pose(action,.02),pose(action,.03)
            self.assertAlmostEqual(a['root'][1]+a['left_ankle'][1],b['root'][1]+b['left_ankle'][1],places=6)

if __name__=='__main__':unittest.main()