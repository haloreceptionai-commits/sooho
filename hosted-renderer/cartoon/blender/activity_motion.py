"""Body motion for the activities a story can show: cooking, typing, driving, eating, dancing, hugging, climbing, sleeping...

Pure maths (no Blender). Every action returns the same joint targets as character_motion.pose: hips, head, shoulders, wrists, ankles, plus
  lean  (radians, torso bends forward about the hips)    nod (head pitches down)    turn (head yaw)
Elbows and knees are solved afterwards by character_motion.finish(). Coordinates: x right, y forward is NEGATIVE, z up; a standing hip is at .895.

Design rules (they answer "the characters shake for no reason"):
  * an activity moves only what that activity needs; everything else holds still,
  * repeating motions are slow (cooking, writing) or short bursts with a rest (knocking, hammering),
  * gestures ease in and out; nothing jitters.
"""
import math

STAND_HIP = .895
SEAT_HIP = .53        # hip height on a chair or car seat


def sm(u):
    u = max(0., min(1., u)); return u * u * (3 - 2 * u)


def lerp(a, b, u): return tuple(x + (y - x) * u for x, y in zip(a, b))


def path(t, period, frames, offset=0.):
    """Loop through (u, position) keyframes with smooth easing between them. u runs 0..1 over `period` seconds."""
    u = ((t / period) + offset) % 1.0
    for (u0, a), (u1, b) in zip(frames, frames[1:]):
        if u0 <= u <= u1: return lerp(a, b, sm((u - u0) / max(1e-6, u1 - u0)))
    return frames[-1][1]


def burst(t, period, active):
    """0..1 envelope: moves during the first `active` seconds of every `period`, then rests. Used for knocking, hammering, waving bursts."""
    u = t % period
    return 0. if u > active else math.sin(math.pi * u / active)


def base(hip_z=STAND_HIP):
    return {'root': (0, 0, 0), 'hips': (0, 0, hip_z), 'head': (0, 0, hip_z + .84), 'tilt': 0, 'grip_angle': 0, 'lean': 0, 'nod': 0, 'turn': 0,
            'left_shoulder': (-.2, 0, hip_z + .44), 'right_shoulder': (.2, 0, hip_z + .44),
            'left_wrist': (-.27, -.03, hip_z - .15), 'right_wrist': (.27, -.03, hip_z - .15),
            'left_ankle': (-.09, 0, .055), 'right_ankle': (.09, 0, .055)}


def sit(p, hip_z=SEAT_HIP):
    """Seated: hips on the seat, thighs forward, feet flat on the floor in front. Arms are set by the caller."""
    d = STAND_HIP - hip_z
    p['hips'] = (0, 0, hip_z); p['head'] = (0, 0, hip_z + .84)
    p['left_shoulder'] = (-.2, 0, hip_z + .44); p['right_shoulder'] = (.2, 0, hip_z + .44)
    p['left_ankle'] = (-.11, -.43, .055); p['right_ankle'] = (.11, -.43, .055)
    for k in ('left_wrist', 'right_wrist'): p[k] = (p[k][0], p[k][1], p[k][2] - d)
    return d


def gait(p, t, speed, period, stance=.6, lift=.12):
    """Feet planted on the ground while the body travels at `speed` m/s; same foot-planting model as character_motion walk."""
    for side, sign in (('left', -1), ('right', 1)):
        u = t / period + (0 if side == 'left' else .5); cycle = math.floor(u); u -= cycle
        landing = -speed * period * (cycle - (0 if side == 'left' else .5) + stance / 2)
        if u < stance: wy, lf = landing, 0
        else:
            v = (u - stance) / (1 - stance); wy = landing - speed * period * (v * v * (3 - 2 * v)); lf = lift * math.sin(math.pi * v)
        p[side + '_ankle'] = (sign * .09, wy + speed * t, .055 + lf)
    p['root'] = (0, -speed * t, 0)


def gesture_arm(t, rest, period=2.8, seed=0.):
    """A speaking hand: it lifts into a gesture, holds, then returns, never jitters. Different seeds give different gestures."""
    a = (rest[0] + .12, rest[1] - .12, rest[2] + .42); b = (rest[0] + .22, rest[1] - .22, rest[2] + .62); c = (rest[0] + .04, rest[1] - .26, rest[2] + .32)
    return path(t, period, [(0, rest), (.18, a), (.4, a), (.55, b), (.75, b), (.88, c), (1, rest)], seed)


# ---------------------------------------------------------------- the actions
def talk(t, d=0):
    p = base(STAND_HIP - d)
    p['right_wrist'] = gesture_arm(t, (.27, -.03, p['hips'][2] - .15), 3.8)
    p['left_wrist'] = gesture_arm(t, (-.27, -.03, p['hips'][2] - .15), 4.8, .45)
    p['nod'] = .05 * math.sin(t * math.tau / 3.0); return p


def look_around(t, d=0):
    p = base(); p['turn'] = .75 * math.sin(t * math.tau / 4.2); p['nod'] = .05; p['left_wrist'] = (-.34, -.12, .78); p['right_wrist'] = (.34, -.12, .78); return p


def think(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]
    p['right_wrist'] = (.07, -.2, z + .66); p['left_wrist'] = (-.1, -.3, z + .28); p['turn'] = .12; p['nod'] = .1 + .02 * math.sin(t * 1.3); return p


def shrug(t, d=0):
    e = sm(t / .5); p = base(STAND_HIP - d); z = p['hips'][2]
    p['left_wrist'] = lerp(p['left_wrist'], (-.52, -.25, z + .3), e); p['right_wrist'] = lerp(p['right_wrist'], (.52, -.25, z + .3), e)
    for s in ('left', 'right'):
        x, y, zz = p[s + '_shoulder']; p[s + '_shoulder'] = (x, y, zz + .045 * e)
    p['nod'] = -.05 * e; return p


def bow(t, d=0):
    u = t / 2.4; e = sm(min(u / .3, 1)) if u < .6 else 1 - sm(min((u - .6) / .3, 1)) if u < .9 else 0
    p = base(); p['lean'] = .85 * e; p['nod'] = .1 * e; p['left_wrist'] = (-.2, -.08, .8 - .1 * e); p['right_wrist'] = (.2, -.08, .8 - .1 * e); return p


def salute(t, d=0):
    e = sm(t / .4); p = base(); p['right_wrist'] = lerp(p['right_wrist'], (.18, -.2, 1.8), e); p['left_wrist'] = (-.24, -.05, .76); return p


def wave(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]
    e = sm(t / .35); sway = .1 * math.sin(t * math.tau * 1.7)
    p['right_wrist'] = lerp(p['right_wrist'], (.46 + sway * e, -.15, z + .86), e); p['left_wrist'] = (-.27, -.03, z - .15); p['turn'] = -.05; return p


def clap(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; s = abs(math.sin(t * math.pi * 2.2)); gap = .03 + .24 * s
    p['left_wrist'] = (-gap, -.36, z + .26); p['right_wrist'] = (gap, -.36, z + .26); return p


def cry(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; s = .01 * math.sin(t * math.tau * 2.4)
    p['left_wrist'] = (-.1, -.24, z + .7 + s); p['right_wrist'] = (.1, -.24, z + .7 + s); p['nod'] = .2; p['lean'] = .12; return p


def laugh(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; b = .012 * math.sin(t * math.tau * 3.6)
    p['left_wrist'] = (-.13, -.3, z + .12 + b); p['right_wrist'] = (.13, -.3, z + .12 + b); p['nod'] = -.18; p['lean'] = -.12
    p['hips'] = (0, 0, z + b); return p


def cheer_big(t, d=0):  # raised arms with a gentle sway: same as the old cheer, kept for seated variants
    p = base(STAND_HIP - d); z = p['hips'][2]; w = .04 * math.sin(t * math.tau * .8)
    p['left_wrist'] = (-.54, -.22, z + .68 + w); p['right_wrist'] = (.54, -.22, z + .68 - w); return p


def jump(t, d=0):
    period = 1.05; u = (t / period) % 1; h = .42 * math.sin(math.pi * u) if u < .75 else 0.
    land = sm((u - .75) / .25) if u >= .75 else 0.; sq = .16 * math.sin(math.pi * land) if u >= .75 else .0
    p = base(STAND_HIP + h - sq); z = p['hips'][2]
    up = h / .42 if h else 0.
    p['left_wrist'] = (-.5, -.12, z + .55 * up + .02); p['right_wrist'] = (.5, -.12, z + .55 * up + .02)
    p['left_ankle'] = (-.09, 0, .055 + h * .85); p['right_ankle'] = (.09, 0, .055 + h * .85); return p


def dance(t, d=0):
    ph = t * math.tau * 1.1; p = base(STAND_HIP - .03 + .03 * abs(math.sin(ph * 2)))
    p['root'] = (.08 * math.sin(ph), 0, 0); p['turn'] = .3 * math.sin(ph)
    a = math.sin(ph * 2)
    p['left_wrist'] = (-.5, -.1, 1.35 + .35 * max(0, a)); p['right_wrist'] = (.5, -.1, 1.35 + .35 * max(0, -a))
    p['left_ankle'] = (-.12, 0, .055 + .08 * max(0, -a)); p['right_ankle'] = (.12, 0, .055 + .08 * max(0, a)); return p


def kick(t, d=0):
    period = 2.2; u = (t / period) % 1; e = math.sin(math.pi * min(1, u / .5)) if u < .5 else 0.
    p = base(); p['right_ankle'] = (.12, -.1 - .55 * e, .055 + .38 * e); p['lean'] = -.1 * e
    p['left_wrist'] = (-.45, -.1, 1.0); p['right_wrist'] = (.4, .1, 1.15); return p


def punch(t, d=0):
    p = base(STAND_HIP - .06); a = burst(t, 1.3, .35); b = burst(t + .65, 1.3, .35)
    p['right_wrist'] = (.17, -.2 - .5 * a, 1.3); p['left_wrist'] = (-.17, -.2 - .5 * b, 1.3); p['lean'] = .1; p['turn'] = .1
    p['left_ankle'] = (-.14, -.15, .055); p['right_ankle'] = (.14, .16, .055); return p


def throw(t, d=0):
    period = 2.6; u = (t / period) % 1
    wind = (.34, .28, 1.5); rel = (.3, -.6, 1.6); fol = (.05, -.5, 1.0)
    p = base(); p['right_wrist'] = path(t, period, [(0, (.27, -.03, .75)), (.25, wind), (.4, wind), (.5, rel), (.65, fol), (.85, fol), (1, (.27, -.03, .75))])
    p['left_wrist'] = (-.3, -.35, 1.3); p['lean'] = .25 * sm((u - .4) / .15) if u < .65 else .25 * (1 - sm((u - .65) / .2)); p['grip_angle'] = 0; return p


def knock(t, d=0):
    a = burst(t, 2.4, 1.0); p = base(); z = 1.28
    p['right_wrist'] = (.2, -.62 + .05 * a, z + .05 * math.sin(t * math.tau * 3.2) * (1 if a > 0 else 0)); p['left_wrist'] = (-.27, -.03, .75); p['lean'] = .05; return p


def push(t, d=0):
    p = base(); gait(p, t, .35, 1.5, .62, .08); p['lean'] = .35
    p['left_wrist'] = (-.16, -.66, 1.12); p['right_wrist'] = (.16, -.66, 1.12); return p


def pull(t, d=0):
    p = base(); gait(p, t, -.3, 1.5, .62, .08); p['lean'] = -.28
    p['left_wrist'] = (-.17, -.6, 1.05); p['right_wrist'] = (.17, -.6, 1.05); return p


def dig(t, d=0):
    period = 2.0; p = base(STAND_HIP - .05)
    p['lean'] = path(t, period, [(0, (.3, 0, 0)), (.3, (.45, 0, 0)), (.55, (.12, 0, 0)), (1, (.3, 0, 0))])[0]
    p['left_wrist'] = path(t, period, [(0, (-.14, -.42, .78)), (.3, (-.14, -.55, .62)), (.55, (-.14, -.3, 1.1)), (1, (-.14, -.42, .78))])
    p['right_wrist'] = path(t, period, [(0, (.14, -.45, 1.02)), (.3, (.14, -.58, .86)), (.55, (.14, -.35, 1.3)), (1, (.14, -.45, 1.02))])
    p['left_ankle'] = (-.15, -.1, .055); p['right_ankle'] = (.15, .12, .055); return p


def sweep(t, d=0):
    s = math.sin(t * math.tau * .55); p = base(); p['lean'] = .12
    p['left_wrist'] = (-.1 + .22 * s, -.45, .98); p['right_wrist'] = (.1 + .22 * s, -.5, 1.28); p['turn'] = .1 * s; return p


def paint(t, d=0):
    s = math.sin(t * math.tau * .45); p = base(); p['right_wrist'] = (.25 + .2 * s, -.55, 1.55 + .12 * math.sin(t * math.tau * .9)); p['left_wrist'] = (-.25, -.3, 1.0)
    p['turn'] = .12 * s; p['lean'] = .05; return p


def fish(t, d=0):
    u = (t / 5.0) % 1; pull_e = sm((u - .62) / .1) * (1 - sm((u - .78) / .12)) if u > .62 else 0.
    p = base(); p['lean'] = -.18 * pull_e + .05; p['left_wrist'] = (-.12, -.35, 1.1 + .1 * pull_e); p['right_wrist'] = (.12, -.45, 1.2 + .2 * pull_e); return p


def count(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; f = .5 + .5 * math.sin(t * math.tau * 1.3)
    p['left_wrist'] = (-.1, -.34, z + .22); p['right_wrist'] = (.08 + .06 * f, -.38, z + .22 + .04 * f); p['nod'] = .22; return p


def read(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; p['left_wrist'] = (-.1, -.36, z + .4); p['right_wrist'] = (.1, -.36, z + .4); p['nod'] = .22
    p['turn'] = .05 * math.sin(t * .6); return p


def phone(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; e = sm(t / .6)
    p['right_wrist'] = lerp(p['right_wrist'], (.28, -.1, z + .76), e); p['left_wrist'] = (-.2, -.3, z + .15); p['turn'] = -.15 * e; return p


def photo(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; e = sm(t / .6); click = burst(t, 3.0, .15)
    p['left_wrist'] = lerp(p['left_wrist'], (-.12, -.36, z + .72), e); p['right_wrist'] = lerp(p['right_wrist'], (.12, -.36, z + .72 - .01 * click), e); return p


def look(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]; s = .05 * math.sin(t * .8)
    p['right_wrist'] = (.2 + s, -.5, z + .45); p['left_wrist'] = (-.22, -.1, z - .05); p['lean'] = .18; p['nod'] = .22; p['turn'] = .1 * math.sin(t * .6); return p


def play(t, d=0):
    s = math.sin(t * math.tau * 1.8); p = base()
    p['left_wrist'] = (-.28, -.5, 1.28); p['right_wrist'] = (.1, -.3, 1.0 + .06 * s); p['nod'] = .1; p['turn'] = .1 * math.sin(t * .9); return p


def eat(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]
    p['right_wrist'] = path(t, 3.0, [(0, (.22, -.34, z + .08)), (.3, (.1, -.28, z + .66)), (.5, (.1, -.28, z + .66)), (.75, (.22, -.34, z + .08)), (1, (.22, -.34, z + .08))])
    p['left_wrist'] = (-.22, -.3, z + .02); p['nod'] = .08 + .05 * burst(t, 3.0, 1.5); return p


def drink(t, d=0):
    p = base(STAND_HIP - d); z = p['hips'][2]
    p['right_wrist'] = path(t, 4.0, [(0, (.24, -.34, z + .1)), (.28, (.07, -.26, z + .68)), (.62, (.07, -.26, z + .68)), (.85, (.24, -.34, z + .1)), (1, (.24, -.34, z + .1))])
    u = (t / 4.0) % 1; p['nod'] = -.2 * (sm((u - .2) / .1) * (1 - sm((u - .62) / .1))); p['left_wrist'] = (-.22, -.3, z - .02); return p


def pour(t, d=0):
    p = base(); p['right_wrist'] = (.22, -.36, 1.24); p['left_wrist'] = (-.18, -.34, 1.02); p['grip_angle'] = .35 + .9 * (.5 - .5 * math.cos(t * math.tau * .6)); return p


def cook(t, d=0):
    p = base(STAND_HIP - .03); a = t * math.tau * .55
    p['left_wrist'] = (-.2, -.52, 1.0); p['right_wrist'] = (.14 + .09 * math.cos(a), -.5 + .09 * math.sin(a), 1.08)
    p['lean'] = .14; p['nod'] = .22; p['turn'] = .05 * math.sin(t * .4); return p


def chop(t, d=0):
    p = base(STAND_HIP - .03); a = max(0., math.sin(t * math.tau * 2.0))
    p['right_wrist'] = (.15, -.5, 1.02 + .2 * a); p['left_wrist'] = (-.12, -.5, .98); p['lean'] = .14; p['nod'] = .25; return p


# ---- seated
def sit_idle(t, d=0):
    p = base(); sit(p); z = p['hips'][2]; p['left_wrist'] = (-.2, -.3, z + .1); p['right_wrist'] = (.2, -.3, z + .1); return p


def sit_talk(t, d=0):
    p = base(); sit(p); z = p['hips'][2]
    p['right_wrist'] = gesture_arm(t, (.2, -.3, z + .12), 3.8); p['left_wrist'] = (-.2, -.3, z + .1); p['nod'] = .04 * math.sin(t * math.tau / 3.4); return p


def type_(t, d=0):
    p = base(); sit(p); w = .014 * math.sin(t * math.tau * 3.1)
    p['left_wrist'] = (-.1, -.5, .8 + w); p['right_wrist'] = (.1, -.5, .8 - w); p['nod'] = .18; p['lean'] = .08; return p


def write(t, d=0):
    p = base(); sit(p); a = t * math.tau * .8
    p['right_wrist'] = (.14 + .05 * math.cos(a), -.5 + .03 * math.sin(a * 1.3), .79); p['left_wrist'] = (-.14, -.46, .79); p['nod'] = .28; p['lean'] = .12; return p


def drive(t, d=0):
    p = base(); sit(p, .55); s = .05 * math.sin(t * math.tau * .3)
    p['left_wrist'] = (-.17 + s, -.5, 1.0); p['right_wrist'] = (.17 + s, -.5, 1.0); p['left_ankle'] = (-.1, -.45, .15); p['right_ankle'] = (.12, -.42, .1)
    p['turn'] = .06 * math.sin(t * math.tau * .2); p['lean'] = .06; return p


def ride(t, d=0):
    ph = t * math.tau * 1.0; p = base(.99); p['lean'] = .28
    p['left_wrist'] = (-.22, -.52, 1.1); p['right_wrist'] = (.22, -.52, 1.1)
    p['left_ankle'] = (-.1, -.08 + .17 * math.cos(ph), .32 + .17 * math.sin(ph)); p['right_ankle'] = (.1, -.08 + .17 * math.cos(ph + math.pi), .32 + .17 * math.sin(ph + math.pi)); return p


def climb(t, d=0):
    ph = t * math.tau * .5; a = math.sin(ph); p = base(); p['root'] = (0, 0, min(1.2, .25 * t))
    p['left_wrist'] = (-.18, -.3, 1.5 + .22 * a); p['right_wrist'] = (.18, -.3, 1.5 - .22 * a)
    p['left_ankle'] = (-.1, -.25, .4 + .2 * max(0, -a)); p['right_ankle'] = (.1, -.25, .4 + .2 * max(0, a)); p['lean'] = .1; return p


def sleep(t, d=0):
    p = base(); p['tilt'] = -math.pi / 2; p['left_wrist'] = (-.18, -.2, .9); p['right_wrist'] = (.18, -.2, .9)
    p['left_ankle'] = (-.09, 0, .055); p['right_ankle'] = (.09, 0, .055); p['root'] = (0, .0, .5 + .006 * math.sin(t * 1.6)); return p


def hug(t, d=0):
    e = sm(t / .7); p = base(); p['left_wrist'] = lerp(p['left_wrist'], (-.3, -.5, 1.35), e); p['right_wrist'] = lerp(p['right_wrist'], (.3, -.5, 1.35), e)
    p['lean'] = .12 * e; p['nod'] = .1 * e; return p


def handshake(t, d=0):
    e = sm(t / .5); pump = .05 * math.sin(t * math.tau * 2.0) * (1 if t > .5 else 0)
    p = base(); p['right_wrist'] = lerp(p['right_wrist'], (.14, -.62, 1.08 + pump), e); p['left_wrist'] = (-.27, -.03, .75); p['turn'] = -.1; return p


ACTIVITY_POSES = {
    'talk': talk, 'look_around': look_around, 'think': think, 'shrug': shrug, 'bow': bow, 'salute': salute, 'wave': wave, 'clap': clap, 'cry': cry, 'laugh': laugh,
    'jump': jump, 'dance': dance, 'kick': kick, 'punch': punch, 'throw': throw, 'knock': knock, 'push': push, 'pull': pull, 'dig': dig, 'sweep': sweep, 'paint': paint,
    'fish': fish, 'count': count, 'read': read, 'phone': phone, 'photo': photo, 'look': look, 'play': play, 'eat': eat, 'drink': drink, 'cook': cook, 'chop': chop,
    'sit': sit_idle, 'sit_talk': sit_talk, 'type': type_, 'write': write, 'drive': drive, 'ride': ride, 'climb': climb, 'sleep': sleep, 'hug': hug, 'handshake': handshake,
}
ACTIONS = set(ACTIVITY_POSES)
SEATED = {'sit', 'sit_talk', 'type', 'write', 'drive'}


def pose(action, t, seat=None):
    """Joint targets for `action` at time t. `seat` (hip height) turns the standing upper-body actions (eat, drink, read, phone, think, talk...) into seated ones."""
    fn = ACTIVITY_POSES[action]
    if seat and action not in SEATED:
        p = fn(t, STAND_HIP - seat); q = base(); sit(q, seat)
        for k in ('left_ankle', 'right_ankle'): p[k] = q[k]
        return p
    return fn(t, 0)
