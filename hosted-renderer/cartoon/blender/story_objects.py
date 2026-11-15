"""Safe shape-built story props. No external paths, scripts or render-time downloads."""
import math
import bpy
from mathutils import Vector
from set_detail import material,cube,rope
from characters import sphere
from object_specs import validate_object,holes,mechanism
from object_motion import fuse_position,pour_position,burst_position,exploded,spin_angle,progress


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


def dynamite_fuse_point(u):
    # u=0 at the stick, u=1 at the free tip; follows the bent fuse shape.
    if u<.4:k=u/.4;return (.12*k,0,.73+.17*k)
    k=(u-.4)/.6;return (.12+.24*k,.04*k,.9+.08*k)


def glow(name,color,strength):
    # Emission-only fire: no diffuse/specular lighting, so flames stay saturated instead of pastel under AgX.
    m=bpy.data.materials.get(name)
    if m:return m
    m=bpy.data.materials.new(name);m.use_nodes=True;nt=m.node_tree;nt.nodes.clear()
    e=nt.nodes.new('ShaderNodeEmission');e.inputs['Color'].default_value=(*color,1);e.inputs['Strength'].default_value=strength
    out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(e.outputs[0],out.inputs['Surface'])
    return m


def spiky_burst(name,radius,mat,seed):
    # Cartoon starburst fireball: icosphere with alternating long spikes, casting no shadow.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1,location=(0,0,.42));o=bpy.context.active_object;o.name=name
    for v in o.data.vertices:
        d=v.co.normalized();k=abs(math.sin(d.x*5.3+seed)*math.sin(d.y*4.7-seed)*math.sin(d.z*6.1+2*seed))
        v.co*=.85+.9*k**1.5
    for f in o.data.polygons:f.use_smooth=True
    o.data.materials.append(mat);o.visible_shadow=False;o.scale=(radius,)*3
    return o


def add_blast(moving,ember,core,smoke):
    # Spiky yellow core inside an orange starburst, then lingering expanding smoke.
    for i,(mat,r) in enumerate([(core,.22),(ember,.34)]):
        o=spiky_burst('explosion fireball',r,mat,i);o['blast_radius']=r;moving.append((o,'burst_flash',o.location.copy()))
    for i in range(6):
        a=i*math.tau/6;o=sphere('explosion smoke',(0,0,.42),(.12,)*3,smoke);o.visible_shadow=False;moving.append((o,'blast_smoke',Vector((.22*math.cos(a),.22*math.sin(a),.42+.05*i))))


def build_object(spec,duration,fps):
    validate_object(spec)
    root=bpy.data.objects.new(spec['kind'],None);bpy.context.collection.objects.link(root)
    wood=material('object timber',(.34,.18,.065),.78);steel=material('object steel',(.11,.13,.14),.3,.8)
    paper=material('object paper',(.78,.75,.64),.85);gold=material('object gold',(.9,.57,.065),.25,.8)
    red=material('object dynamite',(.58,.06,.035));cloth=material('object cover',(.16,.25,.3),.95)
    created=set(bpy.data.objects);moving=[];intact=[];kind=spec['kind'];action=spec.get('action','hold')
    # Moderate warm emission: AgX desaturates very bright red light into pink.
    ember=glow('object fuse ember',(1,.22,0),1.1)
    fire_core=glow('blast fire core',(1,.66,.04),1.4);blast_smoke=material('blast smoke',(.16,.15,.14),.95)
    if kind in ('perforated_cart','covered_cart'):
        cube('cart chassis',(0,0,.45),(1.3,.8,.16),wood)
        for x in [-.48,.48]:
            for y in [-.47,.47]:
                w=cylinder('cart wheel',(x,y,.3),.3,.1,steel,(math.pi/2,0,0))
                pivot=bpy.data.objects.new('wheel axle',None);bpy.context.collection.objects.link(pivot);pivot.location=w.location.copy()
                w.location=(0,0,0);w.parent=pivot
                for a in [i*math.tau/8 for i in range(8)]:
                    spoke=rope('visible wheel spoke',(0,-.06,0),(.26*math.cos(a),-.06,.26*math.sin(a)),.015,wood);spoke.parent=pivot
                moving.append((pivot,'wheel',pivot.location.copy()))
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
        spindle=bpy.data.objects.new('drill spindle',None);bpy.context.collection.objects.link(spindle)
        for obj in [cylinder('drill bit',(0,0,.32),.028,.46,steel),path('spiral cutting flute',[(.031*math.cos(i*.45),.031*math.sin(i*.45),.13+i*.006) for i in range(64)],.009,steel),cylinder('tapered drill chuck',(0,0,.61),.075,.16,steel)]:obj.parent=spindle
        moving.append((spindle,'spin',spindle.location.copy()))
        drill_body=bpy.data.objects.new('drill body',None);bpy.context.collection.objects.link(drill_body)
        bore=material('drilled bore hole',(.035,.02,.01),.95);shaving_wood=material('fresh wood shaving',(.82,.6,.32),.8)
        o=cylinder('drilled bore hole',(0,0,.182),.07,.004,bore);moving.append((o,'bore',o.location.copy()))
        for i in range(12):
            o=cube('drilling wood shaving',(.12*math.cos(i),.12*math.sin(i),.2),(.07,.03,.02),shaving_wood,.004);moving.append((o,'shaving',Vector((.12*math.cos(i),.12*math.sin(i),.2))))
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
        for obj in set(bpy.data.objects)-created:
            if obj.name.startswith(('large hand drill gear','gear tooth','gear spoke')):
                obj.location-=Vector(center);obj.parent=crank
        moving.append((crank,'crank',crank.location.copy()))
        for obj in set(bpy.data.objects)-created:
            if obj.parent is None and obj is not drill_body and not obj.name.startswith(('drilled timber','drilled bore hole','drilling wood shaving')):obj.parent=drill_body
    elif kind=='rocket_arrow':
        rope('arrow shaft',(0,0,.12),(0,0,1.5),.025,wood)
        cylinder('paper rocket tube',(0,0,.7),.09,.55,paper)
        bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.1,depth=.25,location=(0,0,1.55));bpy.context.active_object.data.materials.append(steel)
        for a in [0,math.pi/2]:
            fin=cube('arrow fletching',(0,0,.25),(.28,.015,.22),paper);fin.rotation_euler.z=a
        if action=='fire':
            o=sphere('rocket exhaust flame',(0,0,.04),(.1,.1,.23),ember);moving.append((o,'rocket_flame',o.location.copy()))
            smoke=material('rocket smoke',(.32,.32,.32),.95)
            for i in range(4):
                o=sphere('rocket exhaust smoke',(0,0,-.1-i*.12),(.08+i*.025,)*3,smoke);moving.append((o,'rocket_smoke',o.location.copy()))
    elif kind=='fuse_bundle':
        # Looped cords leading into three visibly cylindrical powder charges, not parallel rake teeth.
        fusemat=material('braided safety fuse',(.11,.075,.035),.95)
        path('loose common fuse',[fuse_position(i/50) for i in range(76)],.015,fusemat)
        for i in range(76):
            x,y,z=fuse_position(i/50)
            path('woven fuse strand',[(x+.016*math.cos(i*1.9+j),y+j*.001,.04+.016*math.sin(i*1.9+j)) for j in range(7)],.003,paper)
        tip=sphere('glowing ignition tip',(0,-.7,.045),(.065,.055,.07),ember)
        if action=='fire':moving.append((tip,'fuse',tip.location.copy()))
        if action=='fire':
            flame=glow('fuse flame yellow',(1,.6,0),1.3)
            smoke=material('fuse smoke charcoal',(.085,.085,.085),.95)
            for i in range(3):
                o=sphere('fuse flame tongue',(0,0,0),(.04,.035,.12-i*.025),flame);moving.append((o,'fuse_flame',Vector((i*.025-.025,0,.085+i*.025))))
            for i in range(5):
                o=sphere('rising fuse smoke',(0,0,0),(.055+i*.012,)*3,smoke);moving.append((o,'fuse_smoke',Vector((i*.035-.05,0,.17+i*.065))))
            char=material('burned fuse charcoal',(.025,.018,.01),.95)
            for i in range(75):
                a=fuse_position(i/50);b=fuse_position((i+1)/50)
                o=rope('charred fuse trail',a,b,.02,char);moving.append((o,'charred',i/50))
        for i in range(6):
            spark=rope('fuse tip spark',(0,0,0),(.12*math.cos(i*2),.12*math.sin(i*2),.08+i*.012),.006,ember);spark.location=(0,-.7,.045)
            if action=='fire':moving.append((spark,'fuse',spark.location.copy()))
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
    elif kind=='gold_shotgun':
        stock=cube('shaped wooden stock',(0,0,.26),(.26,.17,.43),wood,.06);stock.rotation_euler.y=-.16
        cube('stock neck',(0,0,.5),(.11,.13,.22),wood,.025)
        cube('wooden fore-end',(0,.06,.75),(.17,.15,.26),wood,.025)
        for x in [-.065,.065]:cylinder('barrel',(x,0,.85),.05,.85,steel)
        cube('breech',(0,0,.52),(.19,.18,.18),steel)
        nugget=sphere('gold load',(0,-.48,.58),(.075,.055,.065),gold);moving.append((nugget,'load',nugget.location.copy()))
        if action=='load':
            cylinder('open loading chamber',(0,-.09,.58),.095,.05,steel,(math.pi/2,0,0))
        bpy.ops.mesh.primitive_torus_add(major_radius=.075,minor_radius=.012,location=(0,-.1,.47),rotation=(math.pi/2,0,0));bpy.context.active_object.data.materials.append(steel)
        if action=='fire':
            o=sphere('fired gold payload',(0,0,1.3),(.035,)*3,gold);moving.append((o,'projectile',o.location.copy()))
            o=sphere('muzzle flash',(0,0,1.34),(.12,.1,.2),ember);moving.append((o,'flash',o.location.copy()))
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
        stick=cylinder('dynamite stick',(0,0,.38),.12,.7,red)
        for z in [.14,.62]:cylinder('paper band',(0,0,z),.124,.025,paper)
        if action=='fire':
            # Fuse burns down: segments ahead of the ember vanish as it travels to the stick.
            fuse_cord=material('dynamite fuse cord',(.42,.3,.16),.9)
            for i in range(10):
                a=dynamite_fuse_point(i/10);b=dynamite_fuse_point((i+1)/10)
                o=rope('burning dynamite fuse',a,b,.02,fuse_cord);moving.append((o,'burnt',1.5*(1-(i+1)/10)))
        else:
            rope('curved fuse',(0,0,.73),(.07,0,.81),.012,wood)
            rope('bent fuse',(.07,0,.81),(.16,.03,.8),.012,wood)
        if action=='fire':
            o=sphere('burning fuse',(0,0,.73),(.065,.055,.1),ember);moving.append((o,'dynamite_fuse',o.location.copy()))
            smoke=material('dynamite fuse smoke',(.085,.085,.085),.95)
            for i in range(4):
                o=sphere('dynamite fuse smoke',(0,0,0),(.045+i*.012,)*3,smoke);moving.append((o,'dynamite_smoke',Vector((i*.035,0,.12+i*.055))))
        if action=='explode':
            intact=list(set(bpy.data.objects)-created)
            for i in range(8):
                size=(.05+.03*(i%3),.035+.02*((i+1)%2),.09+.05*(i%2))
                o=cube('dynamite fragment',(0,0,.38),size,paper if i%3==2 else red);moving.append((o,'fragment',i))
            add_blast(moving,ember,fire_core,blast_smoke)
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
        if action=='open':
            for side in (-1,1):
                lid=cube('cracked rock crust',(side*.3,-.45,.55),(.59,.07,1.03),rock);moving.append((lid,'crust',Vector((side*.3,-.45,.04))))
        if action=='explode':
            intact=list(set(bpy.data.objects)-created)
            for i in range(8):
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.17,location=(0,0,.38));o=bpy.context.active_object;o.name='ore rock fragment';o.data.materials.append(rock if i%2 else gold);moving.append((o,'fragment',i))
            add_blast(moving,ember,fire_core,blast_smoke)
    for obj in set(bpy.data.objects)-created:
        if obj.parent is None:obj.parent=root
    base=tuple(spec['pos']);s=spec.get('scale',1);root.scale=(s,)*3
    root['story_kind']=kind;root['story_action']=action
    for frame in range(round(duration*fps)):
        t=frame/fps;m=mechanism(action,t);root.location=base;root.rotation_euler=(m['tilt'],m['swing'],math.radians(spec.get('yaw',0)))
        if action=='pour':root.location=(base[0],base[1],base[2]+.48);root.rotation_euler.x=-progress(t,0,.65)*.9
        if kind=='rocket_arrow':root.location=(base[0],base[1],base[2]+m['travel'])
        if action=='swing':
            w=math.sin(t*math.tau*.75);root.location=(base[0]+.38*w,base[1],base[2]+.2-.15*abs(w));root.rotation_euler.y=.8*w
        if action=='roll':root.location=(base[0],base[1]-m['travel'],base[2])
        for index,(obj,role,rest) in enumerate(moving):
            obj['motion_role']=role
            if role not in ('fragment','charred','burnt'):obj.location=rest
            if role in ('spin','crank','wheel'):obj.rotation_euler=(0,0,0)
            if role=='spin':obj.rotation_euler.z=spin_angle(t)*3
            if role=='shaving':
                start=.1+.11*(index%12);f=progress(t,start,start+.45)
                obj.hide_render=t<start;obj.keyframe_insert('hide_render',frame=frame+1)
                a=index*2.4;obj.location=Vector((math.cos(a)*(.07+.25*f),math.sin(a)*(.07+.25*f),.2+.22*math.sin(math.pi*f)))
                obj.rotation_euler=(f*6,f*4,a)
            if role=='bore':
                r=.2+.8*progress(t,0,1.6);obj.scale=(r,r,1);obj.keyframe_insert('scale',frame=frame+1)
            if role=='rocket_flame':
                obj.scale=(.1,.1,.23+.08*math.sin(t*21));obj.keyframe_insert('scale',frame=frame+1)
            if role=='rocket_smoke':obj.location=rest+Vector((.04*math.sin(t*7+index),0,-.04*math.sin(t*5+index)))
            if role=='crank':obj.rotation_euler.y=spin_angle(t)
            if role=='wheel':obj.rotation_euler.y=-m['travel']/.3
            if role=='crust':
                side=1 if rest.x>0 else -1;a=1.45*progress(t,.25+(.15 if side>0 else 0),1.25+(.15 if side>0 else 0))
                obj.location=rest+Vector((side*.25*a,-.51*math.sin(a),.51*math.cos(a)));obj.rotation_euler=(a,0,-side*.35*a)
            if role=='cover':obj.location=(rest.x,rest.y+progress(t)*1.7,rest.z+progress(t)*.8)
            if role=='load':
                obj.location=(rest.x,rest.y+.48*progress(t,0,1.5),rest.z)
                if action=='load':obj.hide_render=t>=1.5;obj.keyframe_insert('hide_render',frame=frame+1)
            if role=='projectile':obj.location=(rest.x,rest.y,rest.z+max(0,t-.4)*1.5)
            if role=='fuse':obj.location=fuse_position(t)
            if role=='fuse_flame':
                obj.location=Vector(fuse_position(t))+rest;obj.rotation_euler.y=.3*math.sin(t*19+index)
            if role=='fuse_smoke':
                obj.location=Vector(fuse_position(max(0,t-.15)))+rest+Vector((.02*math.sin(t*9+index),0,.04*math.sin(t*6+index)))
            if role=='burnt':obj.hide_render=t>rest;obj.keyframe_insert('hide_render',frame=frame+1)
            if role=='charred':obj.hide_render=t<rest;obj.keyframe_insert('hide_render',frame=frame+1)
            if role=='dynamite_fuse':obj.location=dynamite_fuse_point(1-m['ignition'])
            if role=='dynamite_smoke':
                age=(t*.8+index*.21)%1
                obj.location=Vector(dynamite_fuse_point(1-m['ignition']))+Vector((age*.25+.05*math.sin(t*8+index),0,.1+age*.65))
                obj.scale=(.035+age*.07,)*3;obj.keyframe_insert('scale',frame=frame+1)
            if role=='dynamite_fuse':
                obj.scale=(.04+.012*math.sin(t*17),.04,.06+.025*math.sin(t*13));obj.keyframe_insert('scale',frame=frame+1)
            if role=='fragment':
                obj.rotation_euler=(t*(5+rest),t*(3+rest*.7),0)
                obj.location=burst_position(t,rest);obj.hide_render=not exploded(t);obj.keyframe_insert('hide_render',frame=frame+1)
            if role in ('flash','burst_flash'):
                center=.4 if role=='flash' else .65;length=.12 if role=='flash' else .6
                obj.hide_render=not center<=t<center+length;obj.keyframe_insert('hide_render',frame=frame+1)
                if role=='burst_flash':
                    r=obj['blast_radius']*(1.3+1.1*progress(t,.65,1.25))*(1+.08*math.sin(t*40));obj.scale=(r,r,r*.9);obj.rotation_euler.z=t*2;obj.keyframe_insert('scale',frame=frame+1)
            if role=='blast_smoke':
                u=progress(t,.9,2);obj.hide_render=t<.9;obj.keyframe_insert('hide_render',frame=frame+1)
                obj.location=Vector((rest.x*(1+1.5*u),rest.y*(1+1.5*u),rest.z+.5*u));r=.12+.22*u;obj.scale=(r,)*3;obj.keyframe_insert('scale',frame=frame+1)
            if role=='flake' and action=='pour':
                world=Vector(pour_position((rest.x,rest.y,rest.z+.48),t,index))
                if t>.45:
                    # Undo pan rotation for independent gravity-driven released nuggets.
                    world-=Vector((0,0,.48));world.rotate(root.rotation_euler.to_matrix().inverted());obj.location=world
            obj.keyframe_insert('location',frame=frame+1);obj.keyframe_insert('rotation_euler',frame=frame+1)
        for obj in intact:
            obj['intact_explosion_mesh']=True;obj.hide_render=exploded(t);obj.keyframe_insert('hide_render',frame=frame+1)
        if kind=='hand_drill':drill_body.location.z=-.25*progress(t,0,1.6);drill_body.keyframe_insert('location',frame=frame+1)
        root.keyframe_insert('location',frame=frame+1);root.keyframe_insert('rotation_euler',frame=frame+1)
    for obj in set(bpy.data.objects)-created:
        if obj.animation_data and obj.animation_data.action:
            for curve in obj.animation_data.action.fcurves:
                for key in curve.keyframe_points:key.interpolation='CONSTANT' if curve.data_path=='hide_render' else 'LINEAR'
    return root