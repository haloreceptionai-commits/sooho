"""Bounded engine-owned mechanism vocabulary, grounded in measured Cart/Mine shots."""
import math

OBJECTS={
    'perforated_cart':{'source':'cart','actions':['hold','roll','open']},
    'hand_drill':{'source':'cart','actions':['hold','drill']},
    'rocket_arrow':{'source':'cart','actions':['hold','fire']},
    'fuse_bundle':{'source':'cart','actions':['hold','fire']},
    'covered_cart':{'source':'cart','actions':['hold','open']},
    'gold_shotgun':{'source':'mine','actions':['hold','load','fire']},
    'gold_pan':{'source':'mine','actions':['hold','pour']},
    'magnifier':{'source':'mine','actions':['hold','swing']},
    'dynamite':{'source':'mine','actions':['hold','fire','explode']},
    'gold_vein':{'source':'mine','actions':['hold','open','explode']},
}


def validate_object(obj):
    if not isinstance(obj,dict) or set(obj)-{'kind','pos','yaw','scale','action'}:raise ValueError('unknown object fields')
    kind=obj.get('kind')
    if kind not in OBJECTS:raise ValueError('unknown story object')
    if obj.get('action','hold') not in OBJECTS[kind]['actions']:raise ValueError('unsupported object action')
    p=obj.get('pos')
    if not isinstance(p,(list,tuple)) or len(p)!=3 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>100 for v in p):raise ValueError('object position')
    for key,low,high in [('scale',.1,5),('yaw',-360,360)]:
        v=obj.get(key,1 if key=='scale' else 0)
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not low<=v<=high:raise ValueError(key)
    return obj


def holes():
    """Exactly 82 launch openings, not painted dots or a guessed count."""
    return [(col,row) for row in range(9) for col in range(10) if row*10+col<82]


def mechanism(action,t):
    u=max(0,min(1,t/2))
    return {'open':u*math.pi/2 if action=='open' else 0,
            'spin':t*math.tau*2 if action=='drill' else 0,
            'travel':t*1.5 if action in ('fire','roll') else 0,
            'tilt':math.sin(t*math.tau*.6)*.5 if action=='pour' else 0,
            'load':.25*math.sin(t*math.tau) if action=='load' else 0,
            'burst':u if action=='explode' else 0}