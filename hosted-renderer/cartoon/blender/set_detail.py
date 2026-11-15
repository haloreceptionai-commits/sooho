"""Deterministic architectural detailing for the fixed CC0 set kits.

No caller code: masonry, timber framing, foliage and water are engine-owned.
Individual story objects and actors remain separate later plan steps.
"""
import math
import random
import bpy
from mathutils import Vector


def material(name, color, rough=.7, metal=0, emission=0):
    m=bpy.data.materials.get(name)
    if m: return m
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
    return m


def cube(name,pos,size,mat,bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.active_object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        b=o.modifiers.new('edge highlights','BEVEL');b.width=bevel;b.segments=2
    return o


def beam(a,b,width,mat):
    a,b=Vector(a),Vector(b);d=b-a
    o=cube('timber',tuple((a+b)/2),(width,width,d.length),mat,.015)
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o


def masonry(center,width,height,stone,seed=1):
    """Actual staggered block joints, instead of a texture on a single cube."""
    rng=random.Random(seed);x,y,z=center
    mortar=material('mortar',(.16,.17,.16))
    cube('mortar backing',(x,y,z+height/2),(width,.3,height),mortar)
    row_h=.38;brick_w=.72
    colors=[material('stone variation '+str(i),(.48+i*.025,.47+i*.025,.40+i*.025)) for i in range(5)]
    for row in range(int(height/row_h)):
        left=x-width/2
        while left<x+width/2-.02:
            w=min((brick_w/2 if left==x-width/2 and row%2 else brick_w),x+width/2-left)
            o=cube('masonry block',(left+w/2,y-.2-rng.random()*.015,z+row*row_h+row_h/2),(w-.025,.28,row_h-.025),stone,.025)
            o.data.materials.append(colors[rng.randrange(5)])
            left+=w


def mesh_object(name,verts,faces,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat)
    return obj


def rope(name,a,b,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(1)
    for point,position in zip(spline.points,[a,b]):point.co=(*position,1)
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);curve.materials.append(mat)
    return obj


def castle(surface):
    stone=surface('stone',3.6);dark=material('gate iron',(.055,.07,.08),.38,.65)
    # Closed gatehouse: spandrels fill the space above the arch and support the parapet.
    for x in [-5.1,5.1]:masonry((x,6,0),6.2,5.5,stone,int(x+20))
    for row in range(7):
        z=3.1+row*.38
        for col in range(10):
            x=-1.98+col*.44
            if z-0.19 >= 3+math.sqrt(max(0,2.08**2-x*x)):
                cube('gatehouse spandrel',(x,6,z),(.42,.7,.36),stone,.015)
    cube('continuous parapet',(0,6,5.47),(16.4,1.1,.3),stone,.025)
    for i in range(21):
        a,b=math.pi*i/21+.003,math.pi*(i+1)/21-.003
        verts=[(r*math.cos(t),y,3+r*math.sin(t)) for y in [5.5,6.4] for r,t in [(1.7,a),(2.1,a),(2.1,b),(1.7,b)]]
        mesh_object('arch wedge',verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],stone)
    for x in [-1.92,1.92]:masonry((x,5.8,0),.55,3.0,stone,30)
    for x in [i*.28 for i in range(-5,6)]:cube('portcullis',(x,6.12,2.3),(.055,.08,4.6),dark,.012)
    for z in [.4,1.4,2.4,3.4,4.3]:cube('gate crossbar',(0,6.08,z),(3.3,.08,.06),dark,.012)
    for x in [i*.8 for i in range(-10,11)]:cube('supported merlon',(x,6,5.92),(.48,.9,.6),stone,.03)
    # Round corner towers show curved silhouettes, a walkway and thick defensive walls.
    for tx in [-5.9,5.9]:
        for row in range(18):
            for j in range(20):
                a=(j+(row%2)*.5)*math.tau/20
                o=cube('tower masonry',(tx+1.65*math.cos(a),7.1+1.65*math.sin(a),.19+row*.38),(.51,.36,.36),stone,.017)
                o.rotation_euler.z=a+math.pi/2
        for j in range(12):
            a=j*math.tau/12
            o=cube('tower merlon',(tx+1.65*math.cos(a),7.1+1.65*math.sin(a),7.05),(.52,.42,.5),stone,.02);o.rotation_euler.z=a+math.pi/2
        cube('tower foundation',(tx,7.1,.18),(3.7,3.7,.36),stone,.04)
    # Receding courtyard architecture prevents a gate opening onto an empty horizon.
    masonry((0,17,0),14,6.0,stone,92)
    for z in [1.3,3.5]:
        for x in [-4,0,4]:cube('keep dark window',(x,16.76,z),(.45,.04,.8),dark,.04)
    cloth=material('royal blue cloth',(.045,.12,.36));gold=material('banner gold',(.8,.61,.17),.4,.1)
    for x in [-3.2,3.2]:
        cube('banner',(x,5.45,3.8),(.6,.035,1.8),cloth,.005)
        cube('banner stripe',(x,5.42,3.8),(.055,.01,1.75),gold,.001)


def battlefield(surface):
    wood=surface('wood',1.5);canvas=material('camp linen',(.58,.57,.44));iron=material('camp iron',(.085,.1,.11),.5,.5)
    # Distinct siege encampment, not a duplicate close-up of the castle gate.
    for x,y in [(-4,7),(4.5,11),(-5,16)]:
        verts=[(x-2,y-2,0),(x+2,y-2,0),(x,y-2,2.7),(x-2,y+2,0),(x+2,y+2,0),(x,y+2,2.7)]
        mesh_object('campaign tent',verts,[(0,2,5,3),(2,1,4,5),(3,5,4)],canvas)
        beam((x,y-2,0),(x,y-2,2.85),.09,wood)
        for side in [-1,1]:rope('tent guy',(x,y-2,2.7),(x+side*2.7,y-2.7,.08),.018,canvas)
    for y in [4,8,12]:
        for x in [-7,7]:
            beam((x-.7,y,0),(x+.7,y,1.4),.12,wood);beam((x+.7,y,0),(x-.7,y,1.4),.12,wood)
            beam((x,y-.8,.75),(x,y+.8,.75),.12,wood)
    for i in range(8):
        x=2.7+(i%4)*.27;y=3+(i//4)*.28
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.13,location=(x,y,.13));bpy.context.active_object.data.materials.append(iron)
    for x,y in [(-2.8,6),(5,13)]:
        beam((x,y,0),(x,y,4),.075,wood)
        mesh_object('campaign standard',[(x,y,3.8),(x+1,y,3.8),(x+1,y+.12,2.6),(x,y,2.6)],[(0,1,2,3)],material('standard red',(.35,.045,.04)))


def ship_details(surface):
    wood=surface('wood',2.5);rope_mat=material('hemp rope',(.42,.34,.21));canvas=material('sail canvas',(.81,.79,.67))
    iron=material('ship fittings',(.06,.075,.08),.35,.7)
    # Raised stern with real stair treads, a cabin door and windows.
    cube('quarterdeck',(0,11.5,1.35),(7.6,3,.25),wood)
    cube('stern cabin',(0,12.2,.65),(7,1.8,1.3),wood)
    cube('cabin door',(0,11.26,.67),(.85,.035,1.2),iron,.02)
    for x in [-2.2,2.2]:
        cube('cabin glass',(x,11.25,.8),(1,.035,.65),material('cabin blue glass',(.075,.17,.22),.2),.02)
        for dx in [-.5,0,.5]:cube('cabin window frame',(x+dx,11.2,.8),(.035,.05,.72),wood)
    for i in range(7):cube('stern stair',(-2.7,8.55+i*.22,.1+i*.19),(1,.3,.2),wood)
    for side in [-1,1]:
        beam((side*3.7,10,1.55),(side*3.7,13,1.55),.13,wood)
        for y in [10,11,12,13]:beam((side*3.7,y,1.35),(side*3.7,y,2.2),.09,wood)
        beam((side*3.7,10,2.2),(side*3.7,13,2.2),.13,wood)
    # Wind-filled rectangular sail: actual cloth surface, seams and rigging.
    verts=[];faces=[]
    for row in range(13):
        for col in range(17):
            u=col/16;v=row/12
            verts.append((-3+6*u,7.65-.6*math.sin(math.pi*u)*math.sin(math.pi*v),6.9-3.3*v+.18*math.sin(math.pi*u)))
    for row in range(12):
        for col in range(16):
            j=row*17+col;faces.append((j,j+1,j+18,j+17))
    sail=mesh_object('wind filled sail',verts,faces,canvas)
    for p in sail.data.polygons:p.use_smooth=True
    beam((-3.3,7.7,7),(3.3,7.7,7),.13,wood)
    for side in [-1,1]:
        rope('mast stay',(0,8,7.8),(side*3.8,3,.8),.028,rope_mat)
        rope('sail sheet',(side*3,7.7,3.6),(side*3.8,5,.7),.025,rope_mat)
        for i in range(5):rope('shroud',(0,8,6.9),(side*3.8,7+i*.32,.8),.018,rope_mat)
    for col in [2,4,6,8,10,12,14]:
        for row in range(12):rope('sail seam',verts[row*17+col],verts[(row+1)*17+col],.006,rope_mat)
    cube('deck hatch',(0,3,.12),(1.7,1.5,.24),wood)
    for i in range(7):cube('hatch grille',(-.7+i*.23,3,.26),(.065,1.4,.045),iron,.005)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.28,depth=.65,location=(1.6,8.8,.325));bpy.context.active_object.data.materials.append(wood)
    for a in [0,math.pi/2]:
        o=cube('capstan handle',(1.6,8.8,.65),(1.5,.08,.08),wood);o.rotation_euler.z=a


def house_details(x,y,surface):
    wood=surface('wood',1.1);plaster=material('warm plaster',(.73,.68,.52));roof=material('slate roof',(.13,.2,.25))
    cube('house rear',(x,y+3.6,1.5),(4.2,.2,3),plaster)
    for side in [-1,1]:cube('house side',(x+side*2.1,y+1.8,1.5),(.18,3.6,3),plaster)
    for dx in [-2.1,0,2.1]:beam((x+dx,y-.15,0),(x+dx,y-.15,3.0),.12,wood)
    for z in [.25,1.5,2.95]:beam((x-2.1,y-.15,z),(x+2.1,y-.15,z),.12,wood)
    beam((x-2,y-.16,.3),(x-.2,y-.16,1.45),.1,wood)
    beam((x+.2,y-.16,1.5),(x+2,y-.16,2.95),.1,wood)
    # Roof planes built from separate shingles give fine detail at mid distance.
    for side in [-1,1]:
        for row in range(7):
            dx=side*(.16+row*.32);z=4.05-row*.17
            for j in range(10):
                o=cube('roof shingle',(x+dx,y-.2+j*.4,z),(.38,.42,.055),roof,.009)
                o.rotation_euler.y=side*math.radians(28)
    # Timber gable triangle seals the facade below the roof.
    verts=[(x-2.2,y-.08,3),(x+2.2,y-.08,3),(x,y-.08,4.2)]
    me=bpy.data.meshes.new('gable');me.from_pydata(verts,[],[(0,1,2)])
    o=bpy.data.objects.new('gable',me);bpy.context.collection.objects.link(o);me.materials.append(plaster)
    beam((x-2.2,y-.16,3),(x,y-.16,4.2),.13,wood);beam((x,y-.16,4.2),(x+2.2,y-.16,3),.13,wood)


def ground_detail(name):
    rng=random.Random(72);verts=[];faces=[];indices=[]
    mats=[material('grass blade '+str(i),c) for i,c in enumerate([(.12,.26,.055),(.23,.38,.08),(.34,.43,.12)])]
    for i in range(5000):
        x,y=rng.uniform(-12,12),rng.uniform(-3,20)
        if name in ('castle','battlefield') and abs(x)<2:continue
        if name in ('village','street') and abs(x)<2.5:continue
        if name=='rail_yard' and abs(x)<1.2:continue
        h=rng.uniform(.07,.22);w=.025;j=len(verts)
        verts += [(x-w,y,.015),(x+w,y,.015),(x+rng.uniform(-.08,.08),y,h)]
        faces.append((j,j+1,j+2));indices.append(rng.randrange(3))
    me=bpy.data.meshes.new('grass detail');me.from_pydata(verts,[],faces)
    o=bpy.data.objects.new('grass detail',me);bpy.context.collection.objects.link(o)
    for m in mats:me.materials.append(m)
    for p,i in zip(me.polygons,indices):p.material_index=i
    # A low-cost ring of distant hills stops the horizon looking like a studio.
    hill=material('distant hills',(.12,.22,.16))
    for i in range(12):
        a=i*math.pi/6
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,location=(40*math.cos(a),40*math.sin(a),-1))
        o=bpy.context.active_object;o.scale=(12,10,4+i%3);o.data.materials.append(hill)


def indoor_detail(name,surface):
    wood=surface('wood',1.5);black=material('window iron',(.04,.055,.065));glass=material('blue window',(.24,.42,.65),.25,0,1.5)
    # Repeated panel joints, ceiling beams and skirting carry visible scale.
    for x in range(-5,6):cube('ceiling beam',(x,4,4.48),(.12,12,.18),wood)
    for x in range(-5,6):cube('wall stud',(x,8.82,2.2),(.1,.12,4.4),wood)
    cube('skirting',(0,8.72,.15),(12,.16,.3),wood)
    cube('window pane',(2.8,8.74,2.7),(2.4,.03,2.0),glass,0)
    for x in [1.55,2.8,4.05]:cube('window mullion',(x,8.66,2.7),(.09,.12,2.2),black)
    for z in [1.6,2.7,3.8]:cube('window mullion',(2.8,8.66,z),(2.6,.12,.09),black)
    if name=='saloon':
        cube('bar front',(0,5.2,.65),(5.8,.8,1.3),wood)
        cube('bar top',(0,5.1,1.34),(6.2,1.1,.12),wood)
        for x in [-2.4,-1.2,0,1.2,2.4]:cube('bar panel',(x,4.75,.7),(.08,.08,1.0),wood)
        for z in [1.3,2,2.7]:cube('bottle shelf',(0,8.5,z),(5,.4,.09),wood)
    elif name=='office':
        paper=material('paper',(.84,.81,.69));ink=material('writing',(.13,.12,.1))
        for i in range(4):
            x=-.6+i*.28;cube('documents',(x,1.8,1.025+i*.003),(.5,.4,.003),paper,.001)
            for j in range(5):cube('document lines',(x,1.67+j*.055,1.032+i*.003),(.32,.009,.001),ink,0)
    elif name=='workshop':
        cube('tool rack',(-3,8.55,2),(3.8,.15,1.5),wood)
        for x in [-4.4,-3.7,-3,-2.3,-1.6]:cube('tool hooks',(x,8.4,2.5),(.04,.2,.13),black)


def ocean():
    m=bpy.data.materials.new('ocean water');m.use_nodes=True;nt=m.node_tree;bs=nt.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value=(.012,.13,.2,1);bs.inputs['Roughness'].default_value=.19;bs.inputs['Metallic'].default_value=.3
    noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4;noise.inputs['Detail'].default_value=3
    geo=nt.nodes.new('ShaderNodeNewGeometry');nt.links.new(geo.outputs['Position'],noise.inputs[0])
    bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.5;bump.inputs['Distance'].default_value=.15
    nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],bs.inputs['Normal'])
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=100,y_subdivisions=100,size=160,location=(0,0,-1.2))
    o=bpy.context.active_object;o.data.materials.append(m)
    for v in o.data.vertices:v.co.z+=.12*math.sin(v.co.x*.6)+.08*math.sin(v.co.y*.9)
    for p in o.data.polygons:p.use_smooth=True


def practical_lights(name,mode):
    """Visible lamps generate real light; night must remain readable."""
    if name not in ('castle','battlefield','village','street','ship_deck'):return
    iron=material('lamp frame',(.06,.065,.07),.38,.7)
    glow=material('lamp flame',(1,.39,.08),.3,0,8)
    positions=[(-2.4,5.4,2.1),(2.4,5.4,2.1)] if name in ('castle','battlefield') else [(-2,4,1.8),(2.5,7,1.8)]
    for x,y,z in positions:
        cube('lamp bracket',(x,y+.2,z-.25),(.06,.5,.06),iron,.01)
        cube('lamp base',(x,y,z-.16),(.22,.2,.06),iron,.01)
        cube('lamp glow',(x,y,z),(.12,.1,.25),glow,.02)
        cube('lamp cap',(x,y,z+.16),(.22,.2,.07),iron,.01)
        for dx in [-.09,.09]:cube('lamp frame',(x+dx,y-.04,z),(.015,.02,.3),iron,.004)
        bpy.ops.object.light_add(type='POINT',location=(x,y-.22,z))
        l=bpy.context.active_object.data;l.energy=90 if mode=='night' else 18;l.color=(1,.55,.2);l.shadow_soft_size=.12


def detail_set(name,surface):
    if name=='castle':castle(surface)
    if name=='battlefield':battlefield(surface)
    # Complete CC0 buildings replace the earlier partial kit facades.
    if name in ('castle','battlefield','village','street','rail_yard'):ground_detail(name)
    if name in ('office','saloon','workshop','room'):indoor_detail(name,surface)
    if name=='ship_deck':ocean();ship_details(surface)