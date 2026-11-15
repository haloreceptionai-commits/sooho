"""Engine-owned egg-head cast; connected joints and wrist-parented props."""
import math
import bpy
from mathutils import Vector
from character_motion import pose, face_shape
from set_detail import material, cube, rope


def sphere(name,pos,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=pos)
    o=bpy.context.active_object;o.name=name;o.scale=size;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o


def face_y(x,z):
    return -.27*math.sqrt(max(0,1-(x/.31)**2-(z/.36)**2))-.004


def build_character(c,duration=3,fps=30):
    ident=c.get('id','cast');black=material('cast ink',(.012,.013,.015),.65)
    skin=material('cast ivory',(.94,.93,.88),.58)
    cloth=material(ident+' cloth',tuple(c.get('shirt',(.13,.36,.3))),.88)
    hatmat=material(ident+' hat',tuple(c.get('hat_color',(.32,.19,.06))),.85)
    root=bpy.data.objects.new(ident,None);bpy.context.collection.objects.link(root)
    headroot=bpy.data.objects.new(ident+' head',None);bpy.context.collection.objects.link(headroot);headroot.parent=root
    head=sphere('egg head',(0,0,0),(.31,.27,.36),skin);head.parent=headroot
    expr=c.get('expression','neutral');face=face_shape(expr)
    for side in [-1,1]:
        eye=sphere('eye',(side*.105,face_y(side*.105,.035),.035),(.034,.014,face['eye']),black);eye.parent=headroot
        brow=cube('eyebrow',(side*.105,face_y(side*.105,.12),.12),(.095,.022,.018),black,.008);brow.parent=headroot
        brow.rotation_euler.y=side*face['brow']
        if expr=='smug' and side==1:eye.scale.z*=.5
    mouth=None
    if expr in ('shock','talk','worried','determined'):
        mouth=sphere('mouth',(0,face_y(0,-.13),-.13),(face['width'],.016,face['height']),black);mouth.parent=headroot
        if expr=='determined':cube('clenched teeth',(0,face_y(0,-.13)-.018,-.13),(.14,.014,.022),skin,.004).parent=headroot
    else:
        curve=[]
        for j in range(13):
            x=-face['width']+j*face['width']*2/12
            z=-.13+(x/face['width'])**2*face['curve']
            curve.append((x,face_y(x,z),z))
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
                sphere('tricorne crown',(0,0,.3),(.25,.22,.12),hatmat).parent=headroot
                for i in range(3):
                    a=i*math.tau/3
                    o=cube('tricorne folded brim',(.24*math.cos(a),.24*math.sin(a),.32),(.4,.1,.15),hatmat,.035);o.rotation_euler.z=a+math.pi/2;o.parent=headroot
    body=sphere('coat',(0,0,1.04),(.24,.16,.32),cloth);body.parent=root
    outfit=c.get('outfit','worker')
    body_details=[]
    for z in [.94,1.08,1.2]:body_details.append(sphere('coat button',(0,-.153,z),(.014,.014,.014),black))
    if outfit=='merchant':
        body_details.extend([cube('white shirt',(0,-.151,1.19),(.12,.03,.2),skin,.02),cube('bowtie',(0,-.179,1.24),(.16,.035,.06),black,.015)])
    if outfit=='soldier':body_details.append(cube('belt',(0,-.01,.86),(.44,.32,.07),black,.02))
    if outfit=='sailor':
        for z in [.94,1.04,1.14]:
            points=[(x,-.16*math.sqrt(max(0,1-(x/.24)**2-((z-1.04)/.32)**2))-.003,z) for x in [-.18+i*.36/16 for i in range(17)]]
            for a,b in zip(points,points[1:]):body_details.append(rope('sailor stripe',a,b,.009,skin))
    if outfit=='worker':body_details.append(cube('work apron',(0,-.16,1.02),(.25,.035,.35),hatmat,.018))
    detail_positions=[]
    for o in body_details:o.parent=root;detail_positions.append((o,o.location.copy()))
    joints={};segments=[]
    for side in ['left','right']:
        for joint in ['elbow','wrist','knee','ankle']:
            o=sphere(side+' '+joint,(0,0,0),(.034,)*3,black);o.parent=root;joints[side+'_'+joint]=o
        for a,b in [('shoulder','elbow'),('elbow','wrist'),('hip','knee'),('knee','ankle')]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.021,depth=1)
            o=bpy.context.active_object;o.name=side+' '+a+'-'+b;o.data.materials.append(black);o.parent=root;segments.append((o,side+'_'+a,side+'_'+b))
        sphere(side+' shoe',(0,-.05,-.025),(.058,.115,.03),black).parent=joints[side+'_ankle']
    held=c.get('held')
    if held:
        wrist=joints['right_wrist']
        if held=='crate':o=cube('held crate',(-.18,0,-.04),(.36,.25,.24),hatmat,.025);o.parent=wrist
        else:
            if held=='tool':
                cube('held handle',(0,0,.22),(.045,.045,.55),hatmat,.01).parent=wrist
                cube('tool head',(0,0,.46),(.4,.09,.08),black,.025).parent=wrist
            if held=='cup':
                bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.1,depth=.16,location=(0,0,.06));o=bpy.context.active_object;o.data.materials.append(hatmat);o.parent=wrist
                sphere('cup contents',(0,0,.145),(.088,.088,.009),skin).parent=wrist
    action=c.get('action','stand');base=Vector((*c['pos'],0));yaw=math.radians(c.get('yaw',0));scale=c.get('scale',1)
    for f in range(round(duration*fps)):
        p=pose(action,f/fps);root.location=base+Vector(p['root'])*scale;root.scale=(scale,)*3;root.rotation_euler=(p['tilt'],0,yaw)
        root.keyframe_insert('location',frame=f+1);root.keyframe_insert('rotation_euler',frame=f+1)
        headroot.location=p['head'];headroot.keyframe_insert('location',frame=f+1)
        body.location=(0,0,p['hips'][2]+.22);body.keyframe_insert('location',frame=f+1)
        for o,original in detail_positions:o.location=original+Vector((0,0,p['hips'][2]-.82));o.keyframe_insert('location',frame=f+1)
        for key,o in joints.items():o.location=p[key];o.keyframe_insert('location',frame=f+1)
        joints['right_wrist'].rotation_euler.x=p['grip_angle'];joints['right_wrist'].keyframe_insert('rotation_euler',frame=f+1)
        if mouth is not None and expr=='talk':
            shape=face_shape(expr,f/fps);mouth.scale=(shape['width'],.016,shape['height']);mouth.keyframe_insert('scale',frame=f+1)
        for o,a,b in segments:
            av,bv=Vector(p[a]),Vector(p[b]);d=bv-av;o.location=(av+bv)*.5;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.scale=(1,1,d.length)
            for prop in ['location','rotation_euler','scale']:o.keyframe_insert(prop,frame=f+1)
    return root