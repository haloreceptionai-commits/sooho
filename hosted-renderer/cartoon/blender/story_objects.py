"""Safe shape-built story props. No external paths, scripts or render-time downloads."""
import math
import bpy
from set_detail import material,cube,rope
from characters import sphere
from object_specs import validate_object,holes,mechanism


def cylinder(name,pos,radius,depth,mat,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,location=pos,rotation=rotation)
    o=bpy.context.active_object;o.name=name;o.data.materials.append(mat)
    bevel=o.modifiers.new('soft edges','BEVEL');bevel.width=.01;bevel.segments=2
    return o


def build_object(spec,duration,fps):
    validate_object(spec)
    root=bpy.data.objects.new(spec['kind'],None);bpy.context.collection.objects.link(root)
    wood=material('object timber',(.34,.18,.065),.78);steel=material('object steel',(.11,.13,.14),.3,.8)
    paper=material('object paper',(.78,.75,.64),.85);gold=material('object gold',(.9,.57,.065),.25,.8)
    red=material('object dynamite',(.58,.06,.035));cloth=material('object cover',(.16,.25,.3),.95)
    created=set(bpy.data.objects);moving=[];kind=spec['kind']
    if kind in ('perforated_cart','covered_cart'):
        cube('cart chassis',(0,0,.45),(1.3,.8,.16),wood)
        for x in [-.48,.48]:
            for y in [-.47,.47]:
                w=cylinder('cart wheel',(x,y,.3),.3,.1,steel,(math.pi/2,0,0));moving.append((w,'wheel',w.location.copy()))
        rope('pull handle',(0,.3,.5),(0,1.35,.65),.05,wood)
        # Each aperture is an actual through-hole in a wooden launch board.
        board=cube('82 aperture board',(0,0,1.03),(1.3,.16,.99),wood,.005)
        for col,row in holes():
            cutter=cylinder('aperture cutter',(-.56+col*.124,0,.61+row*.105),.039,.4,steel,(math.pi/2,0,0))
            mod=board.modifiers.new('through aperture','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
            bpy.context.view_layer.objects.active=board;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
        if kind=='covered_cart':
            cover=cube('cloth cover',(0,-.13,1.05),(1.44,.2,1.15),cloth,.06);moving.append((cover,'cover',cover.location.copy()))
    elif kind=='hand_drill':
        cube('workpiece',(0,0,.15),(.85,.55,.3),wood)
        bit=cylinder('drill bit',(0,0,.55),.025,.65,steel);moving.append((bit,'spin',bit.location.copy()))
        for a,b in [((0,0,.86),(.25,0,.86)),((.25,0,.86),(.25,0,1.12)),((.25,0,1.12),(0,0,1.12))]:rope('crank',a,b,.035,steel)
        cylinder('drill grip',(0,0,1.2),.065,.16,wood)
    elif kind=='rocket_arrow':
        rope('arrow shaft',(0,0,.12),(0,0,1.5),.025,wood)
        cylinder('paper rocket tube',(0,0,.7),.09,.55,paper)
        bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.1,depth=.25,location=(0,0,1.55));bpy.context.active_object.data.materials.append(steel)
        for a in [0,math.pi/2]:
            fin=cube('arrow fletching',(0,0,.25),(.28,.015,.22),paper);fin.rotation_euler.z=a
    elif kind=='fuse_bundle':
        rope('common fuse',(0,-.7,.07),(0,0,.07),.035,paper)
        for i in range(10):rope('branch fuse',(0,0,.07),(-.6+i*.133,.7,.07),.018,paper)
    elif kind=='gold_shotgun':
        cube('wooden stock',(0,0,.3),(.22,.18,.5),wood,.06)
        for x in [-.065,.065]:cylinder('barrel',(x,0,.85),.05,.85,steel)
        cube('breech',(0,0,.52),(.19,.18,.18),steel)
        nugget=sphere('gold load',(0,-.16,.57),(.06,.04,.055),gold);moving.append((nugget,'load',nugget.location.copy()))
    elif kind=='gold_pan':
        # Open bowl mesh; gold flakes remain visible in its bottom.
        verts=[];faces=[]
        for r,z in [(.02,.03),(.36,.04),(.58,.22)]:
            for i in range(48):verts.append((r*math.cos(i*math.tau/48),r*math.sin(i*math.tau/48),z))
        for ring in range(2):
            for i in range(48):a=ring*48+i;b=ring*48+(i+1)%48;faces.append((a,b,b+48,a+48))
        me=bpy.data.meshes.new('open pan');me.from_pydata(verts,[],faces);me.materials.append(steel);o=bpy.data.objects.new('open gold pan',me);bpy.context.collection.objects.link(o)
        for i in range(18):sphere('gold flake',(.22*math.sin(i*2.4),.22*math.cos(i*2.4),.06),(.035,.025,.006),gold)
    elif kind=='magnifier':
        bpy.ops.mesh.primitive_torus_add(major_radius=.3,minor_radius=.035,location=(0,0,.5),rotation=(math.pi/2,0,0));bpy.context.active_object.data.materials.append(steel)
        rope('magnifier handle',(0,0,.17),(0,0,.03),.055,wood)
        sphere('inspection flake',(0,-.03,.5),(.085,.012,.055),gold)
    elif kind=='dynamite':
        cylinder('dynamite stick',(0,0,.38),.12,.7,red)
        for z in [.14,.62]:cylinder('paper band',(0,0,z),.124,.06,paper)
        rope('curved fuse',(0,0,.73),(.16,0,.94),.02,paper)
    else:
        rock=material('object rock',(.3,.32,.3),.92)
        sphere('vein rock',(0,0,.45),(.62,.4,.45),rock)
        for i in range(8):sphere('exposed gold vein',(-.45+i*.12,-.365,.45+.055*math.sin(i*2)),(.08,.04,.045),gold)
        lid=cube('rock crust',(0,-.41,.46),(1.1,.07,.28),rock);moving.append((lid,'cover',lid.location.copy()))
    for obj in set(bpy.data.objects)-created:obj.parent=root
    base=tuple(spec['pos']);s=spec.get('scale',1);root.scale=(s,)*3;action=spec.get('action','hold')
    for frame in range(round(duration*fps)):
        m=mechanism(action,frame/fps);root.location=base;root.rotation_euler=(m['tilt'],0,math.radians(spec.get('yaw',0)))
        if kind=='rocket_arrow':root.location=(base[0],base[1],base[2]+m['travel'])
        if action=='roll':root.location=(base[0],base[1]-m['travel'],base[2])
        for obj,role,rest in moving:
            obj.location=rest;obj.rotation_euler=(0,0,0)
            if role=='spin':obj.rotation_euler.z=m['spin']
            if role=='wheel':obj.rotation_euler=(math.pi/2,m['travel']/.3,0)
            if role=='cover':obj.location=(rest.x,rest.y-m['open']*.5,rest.z+m['open']*.5+m['burst'])
            if role=='load':obj.location=(rest.x,rest.y+m['load'],rest.z)
            obj.keyframe_insert('location',frame=frame+1);obj.keyframe_insert('rotation_euler',frame=frame+1)
        root.keyframe_insert('location',frame=frame+1);root.keyframe_insert('rotation_euler',frame=frame+1)
    return root