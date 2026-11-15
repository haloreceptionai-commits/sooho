"""Pure, deterministic joint targets for the isolated benchmark cast."""
import math

EXPRESSIONS = {'neutral','happy','angry','sad','shock','worried','smug','determined','talk'}
OUTFITS = {'worker','merchant','soldier','sailor'}
HATS = {'none','beanie','top','helmet','tricorne'}
ACTIONS = {'stand','walk','run','carry','point','swing','aim','load','pour','crouch','fall','cheer','panic'}


def elbow(a,b,length=.34,side=1,bend=None):
    """Equal-length two-bone joint, clamped within reach with a stable bend."""
    delta=[b[i]-a[i] for i in range(3)];distance=math.sqrt(sum(x*x for x in delta))
    if distance>2*length+1e-6:raise ValueError('unreachable wrist')
    mid=[(a[i]+b[i])*.5 for i in range(3)]
    if bend is not None:
        dot=sum(bend[i]*delta[i] for i in range(3))/(distance*distance or 1)
        normal=[bend[i]-dot*delta[i] for i in range(3)]
    else:
        ref=(0,1,0) if abs(delta[1])<distance*.9 else (0,0,1)
        normal=[delta[1]*ref[2]-delta[2]*ref[1],delta[2]*ref[0]-delta[0]*ref[2],delta[0]*ref[1]-delta[1]*ref[0]]
    norm=math.sqrt(sum(x*x for x in normal)) or 1
    h=math.sqrt(max(0,length*length-distance*distance*.25))
    return tuple(mid[i]+side*h*normal[i]/norm for i in range(3))


def pose(action,t):
    if action not in ACTIONS:raise ValueError('unknown action')
    phase=t*math.tau*(2.8 if action in ('run','panic') else 1.2)
    moving=action in ('walk','run','panic')
    crouch=.33 if action=='crouch' else .075 if moving else 0
    hip_z=.895-crouch
    p={'root':(0,-t*(.7 if action=='walk' else 1.3) if action in ('walk','run') else 0,0),
       'hips':(0,0,hip_z),'head':(0,0,hip_z+.84),'tilt':0,'grip_angle':0,
       'left_shoulder':(-.2,0,hip_z+.44),'right_shoulder':(.2,0,hip_z+.44),
       'left_wrist':(-.27,-.03,hip_z-.15),'right_wrist':(.27,-.03,hip_z-.15),
       'left_ankle':(-.09,0,.055),'right_ankle':(.09,0,.055)}
    if action in ('walk','run','panic'):
        for side,sign in [('left',-1),('right',1)]:
            wave=math.sin(phase)*sign
            period=1/1.2 if action=='walk' else 1/2.8
            speed=.7 if action=='walk' else 1.3 if action=='run' else 0
            u=t/period+(0 if side=='left' else .5);cycle=math.floor(u);u-=cycle
            stance=.6 if action=='walk' else .4
            landing=-speed*period*(cycle-(0 if side=='left' else .5)+stance/2)
            if u<stance:world_y=landing;lift=0
            else:
                v=(u-stance)/(1-stance);world_y=landing-speed*period*(v*v*(3-2*v));lift=.12*math.sin(math.pi*v)
            p[side+'_ankle']=(sign*.09,world_y-p['root'][1],.055+lift)
            p[side+'_wrist']=(sign*.27,-.3*wave,.78)
    if action=='carry':
        p['left_wrist']=(-.18,-.4,1.06);p['right_wrist']=(.18,-.4,1.06)
    if action in ('aim','load'):
        p['right_wrist']=(.12,-.3,1.23);p['left_wrist']=(.12,-.53,1.23)
        p['grip_angle']=math.pi/2
        if action=='load':p['left_wrist']=(-.12,-.3,1.04+.14*math.sin(t*math.tau))
    if action=='pour':
        p['right_wrist']=(.22,-.36,1.24);p['left_wrist']=(-.18,-.34,1.02)
        p['grip_angle']=.35+.9*(.5-.5*math.cos(t*math.tau*.6))
    if action=='point':p['right_wrist']=(.48,-.4,1.35)
    if action=='swing':
        a=math.sin(t*math.tau*.8);p['grip_angle']=.85*a
        p['right_wrist']=(-.02,-.3,1.12+.2*a)
        p['left_wrist']=(-.02,-.3-.16*math.sin(p['grip_angle']),p['right_wrist'][2]+.16*math.cos(p['grip_angle']))
    if action in ('cheer','panic'):
        wave=math.sin(t*math.tau*(3 if action=='panic' else 1.6))
        p['left_wrist']=(-.54,-.22,1.58+.1*wave);p['right_wrist']=(.54,-.22,1.58-.1*wave)
    if action=='fall':p['tilt']=max(0,min(1,t))*math.pi/2
    for side,sign in [('left',-1),('right',1)]:
        p[side+'_elbow']=elbow(p[side+'_shoulder'],p[side+'_wrist'],.34,1,bend=(sign,-.5,0))
        hip=(sign*.09,0,hip_z)
        p[side+'_hip']=hip;p[side+'_knee']=elbow(hip,p[side+'_ankle'],.42,1,bend=(0,-1,0))
    if action=='fall':
        # Tilt about the ground origin, then solve support height, not an arbitrary lift.
        co,si=math.cos(p['tilt']),math.sin(p['tilt'])
        support=[v[1]*si+v[2]*co-.034 for k,v in p.items() if k.endswith(('wrist','elbow','knee','ankle'))]
        support.append(p['head'][1]*si+p['head'][2]*co-math.hypot(.27*si,.36*co))
        support.append(p['hips'][2]*co+.22*co-math.hypot(.15*si,.3*co))
        for side in ['left','right']:
            ankle=p[side+'_ankle']
            support.append((ankle[1]-.05)*si+(ankle[2]-.025)*co-.115*abs(si)-.03*abs(co))
        p['root']=(0,0,max(0,-min(support)))
    return p


def face_shape(expression,t=0):
    """Distinct engine-owned face parameters; talk cycles are preview-only, not speech alignment."""
    if expression not in EXPRESSIONS:raise ValueError('unknown expression')
    profiles={
        'neutral':(.035,0,.006,.085,.012), 'happy':(.025,0,.06,.09,.018),
        'angry':(.025,.45,-.018,.075,.014), 'sad':(.03,-.38,-.055,.075,.012),
        'shock':(.06,0,0,.045,.075), 'worried':(.048,-.24,-.025,.045,.03),
        'smug':(.02,.12,.035,.075,.012), 'determined':(.025,.25,0,.085,.02),
        'talk':(.035,0,0,.04+.02*abs(math.sin(t*8)),.015+.055*abs(math.sin(t*11)))}
    eye,brow,curve,width,height=profiles[expression]
    return dict(eye=eye,brow=brow,curve=curve,width=width,height=height)