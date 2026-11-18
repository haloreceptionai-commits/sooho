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
        self.assertEqual(len({tuple(face_shape(e).values()) for e in EXPRESSIONS}),len(EXPRESSIONS))   # one per expression, sleep included
        self.assertNotEqual(face_shape('talk',0)['height'],face_shape('talk',.13)['height'])

    def test_stance_feet_do_not_slide(self):
        for action in ['walk','run']:
            a,b=pose(action,.02),pose(action,.03)
            self.assertAlmostEqual(a['root'][1]+a['left_ankle'][1],b['root'][1]+b['left_ankle'][1],places=6)

if __name__=='__main__':unittest.main()

class CalmGestureTests(unittest.TestCase):
    def joints(self, action, t): p = pose(action, t); return {k: v for k, v in p.items() if isinstance(v, tuple)}

    def test_react_worry_shout_settle_and_then_hold_perfectly_still(self):
        for action in ('react', 'worry', 'shout', 'stand', 'point'):
            with self.subTest(action=action):
                a, b = self.joints(action, 0.6), self.joints(action, 2.7)
                self.assertEqual(a, b)          # no flailing: nothing moves after the gesture has eased in

    def test_the_gesture_eases_in_from_rest(self):
        rest, mid, done = pose('react', 0)['left_wrist'], pose('react', .17)['left_wrist'], pose('react', .5)['left_wrist']
        self.assertEqual(rest, pose('stand', 0)['left_wrist']); self.assertNotEqual(mid, rest); self.assertNotEqual(mid, done)
        self.assertGreater(done[2], rest[2] + .3)    # the hands are up

    def test_only_real_panic_and_walking_move_the_legs(self):
        for action in ('react', 'worry', 'shout', 'cheer', 'point'):
            self.assertEqual(pose(action, 0.3)['left_ankle'], pose(action, 1.9)['left_ankle'])
        self.assertNotEqual(pose('panic', 0.1)['left_ankle'], pose('panic', 0.25)['left_ankle'])
        self.assertNotEqual(pose('walk', 0.1)['left_ankle'], pose('walk', 0.5)['left_ankle'])

    def test_a_cheer_sways_gently(self):
        ys = [pose('cheer', t / 10)['left_wrist'][2] for t in range(0, 20)]
        self.assertLess(max(ys) - min(ys), .12)
