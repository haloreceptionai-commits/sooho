"""Safe shape-built story props. No external paths, scripts or render-time downloads."""
import math
import bpy
from mathutils import Vector
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
    created=set(bpy.data.objects);moving=[];kind=spec['kind'];action=spec.get('action','hold')
    ember=material('object fuse ember',(1,.18,.015),.4,emission=4)
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
            # Draped across the apparatus top and down both faces, rather than a rigid plate.
            verts=[];faces=[]
            profile=[(-.58,.5),(-.3,.9),(-.13,1.56),(.13,1.56),(.3,.9),(.58,.5)]
            for i in range(19):
                x=-.76+i*1.52/18
                for y,z in profile:verts.append((x,y,z+.025*math.cos(i*2.2)))
            for i in range(18):
                for j in range(5):a=i*6+j;faces.append((a,a+6,a+7,a+1))
            mesh=bpy.data.meshes.new('draped cover');mesh.from_pydata(verts,[],faces);mesh.materials.append(cloth)
            cover=bpy.data.objects.new('cloth cover',mesh);bpy.context.collection.objects.link(cover)
            solid=cover.modifiers.new('cloth thickness','SOLIDIFY');solid.thickness=.015
            moving.append((cover,'cover',cover.location.copy()))
    elif kind=='hand_drill':
        cube('workpiece',(0,0,.15),(.85,.55,.3),wood)
        bit=cylinder('drill bit',(0,0,.55),.025,.65,steel);moving.append((bit,'spin',bit.location.copy()))
        for a,b in [((0,0,.86),(.25,0,.86)),((.25,0,.86),(.25,0,1.12)),((.25,0,1.12),(0,0,1.12))]:rope('crank',a,b,.035,steel)
        cylinder('drill grip',(0,0,1.2),.065,.16,wood)
        cylinder('crank wooden side grip',(.25,0,.99),.07,.22,wood)
        for z in [.35,.4,.45,.5,.55,.6]:
            bpy.ops.mesh.primitive_torus_add(major_radius=.03,minor_radius=.008,location=(0,0,z));bpy.context.active_object.data.materials.append(steel)
    elif kind=='rocket_arrow':
        rope('arrow shaft',(0,0,.12),(0,0,1.5),.025,wood)
        cylinder('paper rocket tube',(0,0,.7),.09,.55,paper)
        bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.1,depth=.25,location=(0,0,1.55));bpy.context.active_object.data.materials.append(steel)
        for a in [0,math.pi/2]:
            fin=cube('arrow fletching',(0,0,.25),(.28,.015,.22),paper);fin.rotation_euler.z=a
    elif kind=='fuse_bundle':
        fusemat=material('rope fuse tan',(.42,.27,.12),.95)
        rope('common fuse',(0,-.7,.07),(0,0,.07),.035,fusemat)
        for i in range(10):
            end=(-.6+i*.133,.7,.07)
            rope('branch fuse',(0,0,.07),end,.018,fusemat)
            cylinder('paper charge at fuse end',(end[0],end[1],.13),.055,.16,paper)
        if action=='fire':
            o=sphere('travelling fuse ember',(0,-.7,.07),(.045,)*3,ember);moving.append((o,'fuse',o.location.copy()))
    elif kind=='gold_shotgun':
        stock=cube('shaped wooden stock',(0,0,.26),(.26,.17,.43),wood,.06);stock.rotation_euler.y=-.16
        cube('stock neck',(0,0,.5),(.11,.13,.22),wood,.025)
        cube('wooden fore-end',(0,.06,.75),(.17,.15,.26),wood,.025)
        for x in [-.065,.065]:cylinder('barrel',(x,0,.85),.05,.85,steel)
        cube('breech',(0,0,.52),(.19,.18,.18),steel)
        nugget=sphere('gold load',(0,-.16,.57),(.06,.04,.055),gold);moving.append((nugget,'load',nugget.location.copy()))
        bpy.ops.mesh.primitive_torus_add(major_radius=.075,minor_radius=.012,location=(0,-.1,.47),rotation=(math.pi/2,0,0));bpy.context.active_object.data.materials.append(steel)
        if action=='fire':
            o=sphere('fired gold payload',(0,0,1.3),(.035,)*3,gold);moving.append((o,'projectile',o.location.copy()))
    elif kind=='gold_pan':
        # Open bowl mesh; gold flakes remain visible in its bottom.
        verts=[];faces=[]
        for r,z in [(.02,.03),(.36,.04),(.58,.22)]:
            for i in range(48):verts.append((r*math.cos(i*math.tau/48),r*math.sin(i*math.tau/48),z))
        for ring in range(2):
            for i in range(48):a=ring*48+i;b=ring*48+(i+1)%48;faces.append((a,b,b+48,a+48))
        me=bpy.data.meshes.new('open pan');me.from_pydata(verts,[],faces);me.materials.append(steel);o=bpy.data.objects.new('open gold pan',me);bpy.context.collection.objects.link(o)
        for i in range(18):
            o=sphere('gold flake',(.22*math.sin(i*2.4),.22*math.cos(i*2.4),.06),(.035,.025,.006),gold)
            moving.append((o,'flake',o.location.copy()))
    elif kind=='magnifier':
        bpy.ops.mesh.primitive_torus_add(major_radius=.3,minor_radius=.035,location=(0,0,.5),rotation=(math.pi/2,0,0));bpy.context.active_object.data.materials.append(steel)
        rope('magnifier handle',(0,0,.17),(0,0,.03),.055,wood)
        lens=material('magnifier glass',(.88,.96,1),.04)
        bs=lens.node_tree.nodes['Principled BSDF'];bs.inputs['Transmission Weight'].default_value=.95;bs.inputs['IOR'].default_value=1.45
        sphere('convex glass lens',(0,0,.5),(.285,.018,.285),lens)
        sphere('inspection flake',(0,-.03,.5),(.085,.012,.055),gold)
    elif kind=='dynamite':
        cylinder('dynamite stick',(0,0,.38),.12,.7,red)
        for z in [.14,.62]:cylinder('paper band',(0,0,z),.124,.025,paper)
        rope('curved fuse',(0,0,.73),(.07,0,.81),.012,wood)
        rope('bent fuse',(.07,0,.81),(.16,.03,.8),.012,wood)
        if action=='fire':
            o=sphere('burning fuse',(0,0,.73),(.035,)*3,ember);moving.append((o,'dynamite_fuse',o.location.copy()))
        if action=='explode':
            for i in range(8):
                o=cube('dynamite fragment',(0,0,.38),(.09,.09,.15),red);moving.append((o,'fragment',Vector((math.cos(i*math.tau/8),math.sin(i*math.tau/8),.5))))
    else:
        rock=material('object rock',(.3,.32,.3),.92)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,location=(0,0,.45));o=bpy.context.active_object;o.name='fractured vein rock';o.scale=(.62,.4,.45);o.data.materials.append(rock)
        for i in range(8):
            x=-.4+i*.115;z=.45+.055*math.sin(i*2)
            rope('gold mineral seam',(x,-.39,z),(x+.115,-.39,.45+.055*math.sin((i+1)*2)),.022,gold)
        if action in ('open','explode'):
            lid=cube('rock crust',(0,-.46,.46),(.98,.07,.28),rock);moving.append((lid,'cover',lid.location.copy()))
    for obj in set(bpy.data.objects)-created:obj.parent=root
    base=tuple(spec['pos']);s=spec.get('scale',1);root.scale=(s,)*3
    for frame in range(round(duration*fps)):
        m=mechanism(action,frame/fps);root.location=base;root.rotation_euler=(m['tilt'],m['swing'],math.radians(spec.get('yaw',0)))
        if kind=='rocket_arrow':root.location=(base[0],base[1],base[2]+m['travel'])
        if action=='roll':root.location=(base[0],base[1]-m['travel'],base[2])
        for obj,role,rest in moving:
            obj.location=rest;obj.rotation_euler=(0,0,0)
            if role=='spin':obj.rotation_euler.z=m['spin']
            if role=='wheel':obj.rotation_euler=(math.pi/2,m['travel']/.3,0)
            if role=='cover':obj.location=(rest.x,rest.y-m['open']*.5,rest.z+m['open']*.5+m['burst'])
            if role=='load':obj.location=(rest.x,rest.y+m['load'],rest.z)
            if role=='projectile':obj.location=(rest.x,rest.y,rest.z+m['travel'])
            if role=='fuse':obj.location=(rest.x,-.7+1.4*m['ignition'],rest.z)
            if role=='dynamite_fuse':obj.location=(.16*m['ignition'],0,.73+.21*m['ignition'])
            if role=='fragment':obj.location=(rest.x*m['burst'],rest.y*m['burst'],.38+rest.z*m['burst'])
            if role=='flake' and action=='pour':obj.location=(rest.x,rest.y-.18*abs(m['tilt']),rest.z)
            obj.keyframe_insert('location',frame=frame+1);obj.keyframe_insert('rotation_euler',frame=frame+1)
        root.keyframe_insert('location',frame=frame+1);root.keyframe_insert('rotation_euler',frame=frame+1)
    return root