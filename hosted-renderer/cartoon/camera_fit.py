"""Fit upright character-card bounds at every camera key; no actor relocation."""
import math

def fit_camera_keys(keys, actors, aspect, full_body=True):
    if not actors:
        return keys
    out=[]
    for key in keys:
        k={**key, 'pos':list(key['pos']), 'look':list(key['look'])}
        forward=[k['look'][i]-k['pos'][i] for i in range(3)]
        length=math.sqrt(sum(x*x for x in forward))
        forward=[x/max(length, .001) for x in forward]
        right=[-forward[2], 0., forward[0]]
        rlen=math.sqrt(sum(x*x for x in right))
        right=[x/max(rlen,.001) for x in right]
        up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]]
        tan=math.tan(math.radians(k['fov'])/2)*.88
        needed=0.
        for a in actors:
            x,y,z=a['pos']
            for dx in [-.675,.675]:
                for dy in ([-.05625,2.19375] if full_body else [1.1,2.19375]):
                    delta=[x+dx-k['pos'][0],y+dy-k['pos'][1],z-k['pos'][2]]
                    dot=lambda axis:sum(delta[i]*axis[i] for i in range(3))
                    needed=max(needed,abs(dot(right))/(tan*aspect)-dot(forward),abs(dot(up))/tan-dot(forward))
        if needed>0:
            k['pos']=[k['pos'][i]-forward[i]*needed for i in range(3)]
        out.append(k)
    return out