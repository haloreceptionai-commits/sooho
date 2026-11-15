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


def path(name,points,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=3
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for point,position in zip(spline.points,points):point.co=(*position,1)
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);curve.materials.append(mat)
    return obj


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
        # Familiar eggbeater hand drill: large toothed gear, offset crank, chuck and spiral bit.
        cube('drilled timber',(0,0,.09),(1,.7,.18),wood)
        cylinder('drill bit',(0,0,.32),.028,.46,steel)
        path('spiral cutting flute',[(.031*math.cos(i*.45),.031*math.sin(i*.45),.13+i*.006) for i in range(64)],.009,steel)
        cylinder('tapered drill chuck',(0,0,.61),.075,.16,steel)
        rope('drill frame',(0,0,.68),(0,0,1.18),.045,steel)
        cylinder('top wooden drill handle',(0,0,1.35),.085,.3,wood)
        center=(.12,-.075,.94)
        bpy.ops.mesh.primitive_torus_add(major_radius=.235,minor_radius=.027,location=center,rotation=(math.pi/2,0,0))
        gear=bpy.context.active_object;gear.name='large hand drill gear';gear.data.materials.append(steel)
        cylinder('gear axle',center,.055,.15,steel,(math.pi/2,0,0))
        for i in range(24):
            a=i*math.tau/24
            tooth=cube('gear tooth',(.12+.256*math.cos(a),-.075,.94+.256*math.sin(a)),(.035,.07,.035),steel,.004);tooth.rotation_euler.y=-a
        for i in range(5):
            a=i*math.tau/5;rope('gear spoke',center,(.12+.215*math.cos(a),-.075,.94+.215*math.sin(a)),.016,steel)
        crank=bpy.data.objects.new('drill crank pivot',None);bpy.context.collection.objects.link(crank);crank.location=center
        arm=rope('offset crank arm',(0,-.08,0),(.18,-.08,.12),.024,steel);arm.parent=crank
        grip=cylinder('wooden crank grip',(.18,-.19,.12),.065,.22,wood,(math.pi/2,0,0));grip.parent=crank
        moving.append((crank,'crank',crank.location.copy()))
    elif kind=='rocket_arrow':
        rope('arrow shaft',(0,0,.12),(0,0,1.5),.025,wood)
        cylinder('paper rocket tube',(0,0,.7),.09,.55,paper)
        bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.1,depth=.25,location=(0,0,1.55));bpy.context.active_object.data.materials.append(steel)
        for a in [0,math.pi/2]:
            fin=cube('arrow fletching',(0,0,.25),(.28,.015,.22),paper);fin.rotation_euler.z=a
    elif kind=='fuse_bundle':
        # Looped cords leading into three visibly cylindrical powder charges, not parallel rake teeth.
        fusemat=material('braided safety fuse',(.11,.075,.035),.95)
        path('loose common fuse',[(.06*math.sin(i*.13),-.7+i*.007,.04+.003*math.sin(i)) for i in range(76)],.015,fusemat)
        for i in range(76):
            x=.06*math.sin(i*.13);y=-.7+i*.007
            path('woven fuse strand',[(x+.016*math.cos(i*1.9+j),y+j*.001,.04+.016*math.sin(i*1.9+j)) for j in range(7)],.003,paper)
        sphere('glowing ignition tip',(0,-.7,.045),(.03,.025,.025),ember)
        for i in range(6):
            rope('fuse tip spark',(0,-.7,.045),(.07*math.cos(i*2),-.7+.07*math.sin(i*2),.085+i*.006),.003,ember)
        for i,(x,y,a) in enumerate([(-.47,.22,-.45),(0,.37,.1),(.46,.17,.6)]):
            # Charges lie on the ground with dark fuses entering their camera-facing ends.
            charge=cylinder('fused powder charge',(x,y,.13),.12,.52,red,(math.pi/2,0,a))
            for offset in [-.16,.16]:
                cylinder('charge paper binding',(x-offset*math.sin(a),y+offset*math.cos(a),.13),.123,.035,paper,(math.pi/2,0,a))
            end=(x+.26*math.sin(a),y-.26*math.cos(a),.13)
            # Smooth sagging cord, rather than right-angle metallic plumbing.
            start=Vector((0,-.17,.04));finish=Vector(end);control=Vector((x*.6,-.12,.02))
            points=[]
            for j in range(41):
                u=j/40;p=(1-u)**2*start+2*(1-u)*u*control+u*u*finish;points.append(tuple(p))
            path('curving branch fuse',points,.015,fusemat)
        if action=='fire':
            o=sphere('travelling fuse ember',(.32,-.7,.07),(.045,)*3,ember);moving.append((o,'fuse',o.location.copy()))
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
        # Shallow prospecting pan with concentric recovery riffles and angular gold in black sediment.
        verts=[];faces=[]
        for r,z in [(0,.035),(.36,.04),(.59,.13)]:
            for i in range(48):verts.append((r*math.cos(i*math.tau/48),r*math.sin(i*math.tau/48),z))
        for ring in range(2):
            for i in range(48):a=ring*48+i;b=ring*48+(i+1)%48;faces.append((a,b,b+48,a+48))
        me=bpy.data.meshes.new('open pan');me.from_pydata(verts,[],faces);me.materials.append(steel);o=bpy.data.objects.new('open gold pan',me);bpy.context.collection.objects.link(o)
        solid=o.modifiers.new('pan thickness','SOLIDIFY');solid.thickness=.012
        for r in [.42,.47,.52,.585]:
            bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.013,location=(0,0,.04+(r-.36)*.09/.23))
            bpy.context.active_object.name='gold catching pan riffle';bpy.context.active_object.data.materials.append(steel)
        sediment=material('black prospecting sand',(.028,.026,.021),.96)
        cylinder('black sand in pan',(0,0,.048),.32,.009,sediment)
        for i in range(13):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(.23*math.sin(i*2.4),.23*math.cos(i*2.4),.074))
            o=bpy.context.active_object;o.name='angular gold nugget';o.scale=(.038+i%3*.012,.03,.017+i%2*.009);o.data.materials.append(gold)
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
        rock=material('object rock',(.19,.21,.22),.92)
        quartz=material('vein quartz',(.73,.74,.68),.85)
        # Angular outcrop, broad exposed quartz ribbon, branching embedded gold; never an egg silhouette.
        verts=[(-.7,-.28,0),(.68,-.28,0),(.61,.3,0),(-.55,.32,0),(-.58,-.3,1.04),(.48,-.3,.91),(.43,.29,1.16),(-.47,.3,1.25),(-.22,-.39,.55),(.29,-.36,.48)]
        mesh=bpy.data.meshes.new('angular mineral outcrop');mesh.from_pydata(verts,[],[(0,1,9),(0,9,8),(0,8,4),(4,8,5),(8,9,5),(9,1,5),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6),(4,6,7),(0,3,2,1)]);mesh.materials.append(rock)
        outcrop=bpy.data.objects.new('gold bearing rock outcrop',mesh);bpy.context.collection.objects.link(outcrop)
        # Flat jagged mineral patches embedded in the rock, no tubular branches or connector-like knobs.
        ribbon=[(-.57,.14),(-.38,.33),(-.16,.43),(.02,.63),(.24,.74),(.39,.94)]
        for mat,width,depth,label in [(quartz,.12,-.407,'quartz fracture'),(gold,.043,-.414,'gold mineral seam')]:
            v=[];f=[]
            for i,(x,z) in enumerate(ribbon):
                w=width*(.7+.35*math.sin(i*2.1)**2);v.extend([(x-w,depth,z+.025*math.sin(i*3)),(x+w,depth,z-.02*math.cos(i*2))])
            for i in range(len(ribbon)-1):a=i*2;f.extend([(a,a+1,a+2),(a+1,a+3,a+2)])
            me=bpy.data.meshes.new(label);me.from_pydata(v,[],f);me.materials.append(mat);o=bpy.data.objects.new(label,me);bpy.context.collection.objects.link(o)
        for i in range(26):
            j=i%5;x,z=ribbon[j];x+=.075*math.sin(i*2.3);z+=.065*math.cos(i*1.7)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,-.425,z));o=bpy.context.active_object;o.name='rough embedded mineral fleck';o.scale=(.016+i%3*.006,.012,.02);o.data.materials.append(gold)
        if action in ('open','explode'):
            lid=cube('rock crust',(0,-.43,.55),(1.18,.07,1.03),rock);moving.append((lid,'cover',lid.location.copy()))
    for obj in set(bpy.data.objects)-created:
        if obj.parent is None:obj.parent=root
    base=tuple(spec['pos']);s=spec.get('scale',1);root.scale=(s,)*3
    for frame in range(round(duration*fps)):
        m=mechanism(action,frame/fps);root.location=base;root.rotation_euler=(m['tilt'],m['swing'],math.radians(spec.get('yaw',0)))
        if kind=='rocket_arrow':root.location=(base[0],base[1],base[2]+m['travel'])
        if action=='roll':root.location=(base[0],base[1]-m['travel'],base[2])
        for obj,role,rest in moving:
            obj.location=rest;obj.rotation_euler=(0,0,0)
            if role=='spin':obj.rotation_euler.z=m['spin']
            if role=='crank':obj.rotation_euler.y=m['spin']
            if role=='wheel':obj.rotation_euler=(math.pi/2,m['travel']/.3,0)
            if role=='cover':obj.location=(rest.x,rest.y-m['open']*.5,rest.z+m['open']*.5+m['burst'])
            if role=='load':obj.location=(rest.x,rest.y+m['load'],rest.z)
            if role=='projectile':obj.location=(rest.x,rest.y,rest.z+m['travel'])
            if role=='fuse':obj.location=(.32*(1-m['ignition']),-.7+.53*m['ignition'],rest.z)
            if role=='dynamite_fuse':obj.location=(.16*m['ignition'],0,.73+.21*m['ignition'])
            if role=='fragment':obj.location=(rest.x*m['burst'],rest.y*m['burst'],.38+rest.z*m['burst'])
            if role=='flake' and action=='pour':obj.location=(rest.x,rest.y-.18*abs(m['tilt']),rest.z)
            obj.keyframe_insert('location',frame=frame+1);obj.keyframe_insert('rotation_euler',frame=frame+1)
        root.keyframe_insert('location',frame=frame+1);root.keyframe_insert('rotation_euler',frame=frame+1)
    return root