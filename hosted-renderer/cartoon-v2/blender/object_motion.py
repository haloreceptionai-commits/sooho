"""Pure, bounded object trajectories shared by mesh animation and regression checks."""
import math


def progress(t,start=0,end=2):
    return max(0,min(1,(t-start)/(end-start)))


def fuse_position(t):
    u=progress(t,0,1.5);i=u*75
    return (.06*math.sin(i*.13),-1.45+i*.017,.04+.003*math.sin(i))


def pour_position(rest,t,index=0):
    # Release over the front lip after tipping; settle above the floor, never inside it.
    u=progress(t,.45,1.5)
    if u==0:return tuple(rest)
    return (rest[0]*(1-u)+.025*math.sin(index)*u,rest[1]*(1-u)-.8*u,max(.025,rest[2]*(1-u)+.25*math.sin(u*math.pi)))


def burst_position(t,index):
    u=progress(t,.65,1.65);a=index*math.tau/8
    return (.68*u*math.cos(a),.68*u*math.sin(a),max(.08,.38+.7*math.sin(u*math.pi)-.3*u))


def exploded(t):
    return t>=.65


def spin_angle(t):
    return t*math.tau*.65

# Rail joint (step 6, rail story): gap between bolted rail ends, welded-rail kink and snapped bolts.
RAIL_HALF=.9


def rail_gap(action,t):
    """Full gap width in metres between the two rail ends."""
    if action=='expand':return .16-.145*progress(t,.1,1.6)  # cold wide gap closes as steel heats
    if action=='break':return .03+.32*progress(t,.5,1.4)    # deep cold pulls the joint apart
    if action=='buckle':return 0.                           # continuous welded rail, no joint
    return .07  # resting expansion gap, wide enough to read on screen


def rail_end_shift(action,t,side):
    """x offset of a rail segment so that its inner end sits exactly half the gap from the centre."""
    if action=='break':return (rail_gap(action,t)-.04)*(1 if side>0 else 0)  # left rail and bars stay bolted
    if action=='buckle':return 0.
    return side*(rail_gap(action,t)-.04)/2


def kink_offset(t,u):
    """Sideways bow of a welded rail at position u (0..1 along the rail)."""
    return .3*progress(t,.2,1.3)*math.exp(-((u-.5)/.11)**2)  # one sharp sideways kink at mid-span


def bolt_piece(rest,t,index):
    """Snapped bolt halves fall from the joint after the break and rest on the ballast, never below it."""
    tau=max(0.,t-.75)
    if tau==0:return tuple(rest)
    side=1 if index%2 else -1
    return (rest[0]+.25*tau,rest[1]+side*.35*tau,max(.1,rest[2]+.9*tau-4.9*tau*tau))
