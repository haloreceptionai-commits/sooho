"""Engine-owned egg-head cast; connected joints and wrist-parented props."""
import math
import bpy
from mathutils import Vector
from character_motion import pose
from set_detail import material, cube, rope


def sphere(name,pos,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=pos)
    o=bpy.context.active_object;o.name=name;o.scale=size;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o


def build_character(c,duration=3,fps=30):
    ident=c.get('id','cast');black=material('cast ink',(.012,.013,.015),.65)
    skin=material('cast ivory',(.94,.93,.88),.58)
    cloth=material(ident+' cloth',tuple(c.get('shirt',(.13,.36,.3))),.88)
    hatmat=material(ident+' hat',tuple(c.get('hat_color',(.32,.19,.06))),.85)
    root=bpy.data.objects.new(ident,None);bpy.context.collection.objects.link(root)
    headroot=bpy.data.objects.new(ident+' head',None);bpy.context.collection.objects.link(headroot);headroot.parent=root
    head=sphere('egg head',(0,0,0),(.31,.27,.36),skin);head.parent=headroot
    expr=c.get('expression','neutral')
    for side in [-1,1]:
        eye=sphere('eye',(side*.105,-.259,.035),(.034,.014,.052 if expr in ('shock','worried') else .035),black);eye.parent=headroot
        brow=cube('eyebrow',(side*.105,-.258,.12),(.095,.022,.018),black,.008);brow.parent=headroot
        brow.rotation_euler.y=side*(.35 if expr in ('angry','determined') else -.25 if expr in ('sad','worried') else 0)
    if expr in ('shock','talk'):
        mouth=sphere('mouth',(0,-.256,-.13),(.055,.016,.066),black);mouth.parent=headroot
    else:
        curve=[]
        for j in range(13):
            x=-.085+j*.17/12
            z=-.13+(x/.085)**2*(.045 if expr in ('happy','smug') else -.035 if expr in ('sad','worried') else .006)
            curve.append((x,-.267,z))
        for a,b in zip(curve,curve[1:]):rope('mouth stroke',a,b,.01,black).parent=headroot
    hat=c.get('hat','beanie')
    if hat!='none':
        if hat=='beanie':sphere('beanie',(0,0,.27),(.325,.29,.17),hatmat).parent=headroot
        else:
            bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=.34,depth=.05,location=(0,0,.27));bpy.context.active_object.data.materials.append(hatmat);bpy.context.active_object.parent=headroot
            if hat=='helmet':sphere('helmet',(0,0,.28),(.34,.3,.2),hatmat).parent=headroot
            elif hat=='top':
                bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=.25,depth=.35,location=(0,0,.46));bpy.context.active_object.data.materials.append(hatmat);bpy.context.active_object.parent=headroot
            else:
                for side in [-1,1]:cube('tricorne brim',(side*.22,0,.31),(.2,.5,.09),hatmat,.05).parent=headroot
    body=sphere('coat',(0,0,1.04),(.21,.15,.3),cloth);body.parent=root
    outfit=c.get('outfit','worker')
    for z in [.94,1.08,1.2]:sphere('coat button',(0,-.153,z),(.014,.014,.014),black).parent=root
    if outfit=='merchant':
        cube('white shirt',(0,-.151,1.19),(.12,.03,.2),skin,.02).parent=root
        cube('bowtie',(0,-.179,1.24),(.16,.035,.06),black,.015).parent=root
    if outfit=='soldier':cube('belt',(0,-.01,.86),(.44,.32,.07),black,.02).parent=root
    if outfit=='sailor':
        for z in [.94,1.04,1.14]:cube('sailor stripe',(0,-.147,z),(.36,.02,.025),skin,.005).parent=root
    joints={};segments=[]
    for side in ['left','right']:
        for joint in ['elbow','wrist','knee','ankle']:
            o=sphere(side+' '+joint,(0,0,0),(.034,)*3,black);o.parent=root;joints[side+'_'+joint]=o
        for a,b in [('shoulder','elbow'),('elbow','wrist'),('hip','knee'),('knee','ankle')]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.021,depth=1)
            o=bpy.context.active_object;o.name=side+' '+a+'-'+b;o.data.materials.append(black);o.parent=root;segments.append((o,side+'_'+a,side+'_'+b))
    held=c.get('held')
    if held:
        wrist=joints['right_wrist']
        if held=='crate':o=cube('held crate',(0,-.13,-.04),(.32,.25,.24),hatmat,.025);o.parent=wrist
        else:
            o=cube('held handle',(0,0,.22),(.045,.045,.48),hatmat,.01);o.parent=wrist
            if held=='tool':cube('tool head',(0,0,.46),(.34,.09,.08),black,.025).parent=wrist
            if held=='cup':sphere('held cup',(0,-.04,.28),(.12,.12,.1),hatmat).parent=wrist
    action=c.get('action','stand');base=Vector((*c['pos'],0));yaw=math.radians(c.get('yaw',0));scale=c.get('scale',1)
    for f in range(round(duration*fps)):
        p=pose(action,f/fps);root.location=base+Vector(p['root'])*scale;root.scale=(scale,)*3;root.rotation_euler=(p['tilt'],0,yaw)
        root.keyframe_insert('location',frame=f+1);root.keyframe_insert('rotation_euler',frame=f+1)
        headroot.location=p['head'];headroot.keyframe_insert('location',frame=f+1)
        body.location=(0,0,p['hips'][2]+.22);body.keyframe_insert('location',frame=f+1)
        for key,o in joints.items():o.location=p[key];o.keyframe_insert('location',frame=f+1)
        for o,a,b in segments:
            av,bv=Vector(p[a]),Vector(p[b]);d=bv-av;o.location=(av+bv)*.5;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.scale=(1,1,d.length)
            for prop in ['location','rotation_euler','scale']:o.keyframe_insert(prop,frame=f+1)
    return root