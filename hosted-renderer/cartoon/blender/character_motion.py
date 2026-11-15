"""Pure, deterministic joint targets for the isolated benchmark cast."""
import math

EXPRESSIONS = {'neutral','happy','angry','sad','shock','worried','smug','determined','talk'}
OUTFITS = {'worker','merchant','soldier','sailor'}
HATS = {'none','beanie','top','helmet','tricorne'}
ACTIONS = {'stand','walk','run','carry','point','swing','aim','load','pour','crouch','fall','cheer','panic'}


def elbow(a,b,length=.34,side=1):
    """Equal-length two-bone joint, clamped within reach with a stable bend."""
    delta=[b[i]-a[i] for i in range(3)];distance=math.sqrt(sum(x*x for x in delta))
    if distance>2*length+1e-6:raise ValueError('unreachable wrist')
    mid=[(a[i]+b[i])*.5 for i in range(3)]
    # Cross the aim vector with a nonparallel reference, preserving bend plane.
    ref=(0,1,0) if abs(delta[1])<distance*.9 else (0,0,1)
    normal=[delta[1]*ref[2]-delta[2]*ref[1],delta[2]*ref[0]-delta[0]*ref[2],delta[0]*ref[1]-delta[1]*ref[0]]
    norm=math.sqrt(sum(x*x for x in normal)) or 1
    h=math.sqrt(max(0,length*length-distance*distance*.25))
    return tuple(mid[i]+side*h*normal[i]/norm for i in range(3))


def pose(action,t):
    if action not in ACTIONS:raise ValueError('unknown action')
    phase=t*math.tau*(2.8 if action in ('run','panic') else 1.2)
    crouch=.33 if action=='crouch' else 0
    p={'root':(0,t*(.7 if action=='walk' else 1.3) if action in ('walk','run') else 0,0),
       'hips':(0,0,.82-crouch),'head':(0,0,1.66-crouch),'tilt':0,
       'left_shoulder':(-.2,0,1.26-crouch),'right_shoulder':(.2,0,1.26-crouch),
       'left_wrist':(-.27,-.03,.67-crouch),'right_wrist':(.27,-.03,.67-crouch),
       'left_ankle':(-.09,0,.055),'right_ankle':(.09,0,.055)}
    if action in ('walk','run','panic'):
        stride=.28 if action=='walk' else .38
        for side,sign in [('left',-1),('right',1)]:
            wave=math.sin(phase)*sign
            p[side+'_ankle']=(sign*.09,stride*wave,.055+.12*max(0,wave))
            p[side+'_wrist']=(sign*.27,-.3*wave,.78)
    if action in ('carry','aim','load','pour'):
        p['left_wrist']=(-.18,-.38,1.04);p['right_wrist']=(.18,-.38,1.04)
        if action=='load':p['right_wrist']=(.18,-.35,1.04+.12*math.sin(t*math.tau))
        if action=='pour':p['right_wrist']=(.18,-.42,1.22+.06*math.sin(t*math.tau))
    if action=='point':p['right_wrist']=(.48,-.4,1.35)
    if action=='swing':
        a=math.sin(t*math.tau*.8);p['right_wrist']=(.28,-.35,1.27+.32*a)
        p['left_wrist']=(-.09,-.38,1.18+.27*a)
    if action in ('cheer','panic'):
        p['left_wrist']=(-.4,-.1,1.72);p['right_wrist']=(.4,-.1,1.72)
    if action=='fall':p['tilt']=min(1,t)*math.pi/2;p['root']=(0,0,0)
    for side,sign in [('left',-1),('right',1)]:
        p[side+'_elbow']=elbow(p[side+'_shoulder'],p[side+'_wrist'],.34,sign)
        hip=(sign*.09,0,.82-crouch)
        p[side+'_hip']=hip;p[side+'_knee']=elbow(hip,p[side+'_ankle'],.42,sign)
    return p