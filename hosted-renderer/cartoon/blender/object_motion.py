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