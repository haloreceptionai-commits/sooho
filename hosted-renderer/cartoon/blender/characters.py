"""Engine-owned egg-head cast; connected joints and wrist-parented props."""
import math
import bpy
from mathutils import Vector, Euler
from character_motion import pose, face_shape
from set_detail import material, cube, rope


_OUTLINE = None


def outline_material():
    """Inverted-hull ink line: black on the shell's back faces, transparent on its front faces."""
    global _OUTLINE
    if _OUTLINE is None:
        m = bpy.data.materials.new('benchmark ink'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); geo = nt.nodes.new('ShaderNodeNewGeometry'); mix = nt.nodes.new('ShaderNodeMixShader')
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.005, 0.005, 0.007, 1)
        nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac']); nt.links.new(em.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface']); _OUTLINE = m
    return _OUTLINE


def outline(o, width=0.014):
    """Thick black outline (benchmark look): a flipped, slightly inflated single-layer shell, camera-only, parented so it follows the animation."""
    hull = o.copy(); hull.data = o.data.copy(); hull.data.materials.clear(); hull.data.materials.append(outline_material())
    for m in list(hull.modifiers): hull.modifiers.remove(m)
    bpy.context.collection.objects.link(hull)
    for poly in hull.data.polygons: poly.flip()
    d = hull.modifiers.new('grow', 'DISPLACE'); d.strength = -width / max(min(o.scale), 1e-3); d.mid_level = 0
    hull.parent = o; hull.location = (0, 0, 0); hull.rotation_euler = (0, 0, 0); hull.scale = (1, 1, 1); hull.matrix_parent_inverse.identity()
    hull.visible_shadow = False; hull.visible_diffuse = False; hull.visible_glossy = False; hull.visible_transmission = False; hull.visible_volume_scatter = False
    return hull


def sphere(name,pos,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=pos)
    o=bpy.context.active_object;o.name=name;o.scale=size;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o


def face_y(x,z):
    return -.27*math.sqrt(max(0,1-(x/.31)**2-(z/.36)**2))-.004


def _mat(name,color,rough=.5):
    return material(name,tuple(color),rough)


def build_premium_face(c,headroot,skin,face,expr,ident):
    """Reference-style cartoon face: big glossy eyes with iris and catch-light, soft brows, nose, ears, smile and hair."""
    white=_mat(ident+' eye white',(.97,.97,.98),.2)
    iris=_mat(ident+' iris',tuple(c.get('eyes',(.12,.36,.78))),.25);pupil=_mat(ident+' pupil',(.01,.01,.015),.2)
    light=_mat(ident+' catchlight',(1,1,1),.1);hairm=_mat(ident+' hair',tuple(c.get('hair',(.33,.17,.07))),.55)
    browm=_mat(ident+' brow',tuple(x*.8 for x in c.get('hair',(.33,.17,.07))),.6);lip=_mat(ident+' lip',(.62,.28,.25),.5)
    blush=_mat(ident+' blush',(.95,.55,.48),.7);ink=_mat(ident+' face ink',(.05,.03,.03),.6)
    squint=.6 if expr in ('smug','sad','determined') else 1.0
    for side in (-1,1):
        ex=side*.115;ez=.04
        e=sphere('eye white',(ex,face_y(ex,ez)-.01,ez),(.082,.034,.088*squint),white);e.parent=headroot
        i=sphere('iris',(ex,face_y(ex,ez)-.035,ez-.005),(.052,.012,.058*squint),iris);i.parent=headroot
        sphere('pupil',(ex,face_y(ex,ez)-.043,ez-.005),(.026,.008,.03*squint),pupil).parent=headroot
        sphere('catchlight',(ex+side*.016,face_y(ex,ez)-.047,ez+.022),(.013,.006,.015),light).parent=headroot
        bz=.145+(.02 if expr in ('shock','worried') else -.015 if expr in ('angry','determined') else 0)
        b=cube('eyebrow',(ex,face_y(ex,bz)-.012,bz),(.105,.024,.02),browm,.009);b.parent=headroot;b.rotation_euler.y=side*face['brow']
        ear=sphere('ear',(side*.292,.01,-.02),(.045,.05,.085),skin);ear.parent=headroot
        sphere('cheek',(side*.15,face_y(side*.15,-.08)-.004,-.08),(.07,.012,.045),blush).parent=headroot
    sphere('nose',(0,face_y(0,-.045)-.03,-.045),(.042,.045,.045),skin).parent=headroot
    mouth=None
    if expr in ('shock','talk','worried','determined'):
        mouth=sphere('mouth',(0,face_y(0,-.15)-.004,-.15),(face['width']*1.1,.02,face['height']*1.3),ink);mouth.parent=headroot
        sphere('tongue',(0,face_y(0,-.158)-.018,-.16),(face['width']*.7,.012,face['height']*.7),lip).parent=headroot
    else:
        pts=[]
        for j in range(13):
            x=-face['width']*1.4+j*face['width']*1.4*2/12;z=-.15+(x/(face['width']*1.4))**2*face['curve']*1.3
            pts.append((x,face_y(x,z)-.004,z))
        for a,b in zip(pts,pts[1:]):rope('smile',a,b,.011,lip).parent=headroot
    # hair: a cap, a swept fringe and sideburns
    sphere('hair cap',(0,.05,.15),(.315,.285,.2),hairm).parent=headroot
    f=sphere('hair fringe',(.05,-.13,.255),(.2,.075,.065),hairm);f.rotation_euler.y=.15;f.parent=headroot
    for side in (-1,1):sphere('sideburn',(side*.285,-.02,.02),(.04,.07,.13),hairm).parent=headroot
    return mouth


def build_character(c,duration=3,fps=30):
    if c.get('model'):
        from uploaded_humans import build_uploaded_human
        return build_uploaded_human(c,duration,fps)
    ident=c.get('id','cast');black=material('cast ink',(.012,.013,.015),.65)
    skin=material('cast skin '+ident,tuple(c.get('skin',(.94,.93,.88))),.58)
    cloth=material(ident+' cloth',tuple(c.get('shirt',(.13,.36,.3))),.88)
    hatmat=material(ident+' hat',tuple(c.get('hat_color',(.32,.19,.06))),.85)
    trim=material(ident+' trim',tuple(c.get('trim',(.72,.55,.12))),.35)
    root=bpy.data.objects.new(ident,None);bpy.context.collection.objects.link(root)
    headroot=bpy.data.objects.new(ident+' head',None);bpy.context.collection.objects.link(headroot);headroot.parent=root
    style=c.get('style','benchmark');premium=style=='premium';bench=style=='benchmark'
    head=sphere('egg head',(0,0,0),(.31,.27,.36) if not premium else (.3,.27,.34),skin);head.parent=headroot
    expr=c.get('expression','neutral');face=face_shape(expr)
    if premium:
        mouth=build_premium_face(c,headroot,skin,face,expr,ident)
    for side in ([] if premium else [-1,1]):
        eye=sphere('eye',(side*.105,face_y(side*.105,.035),.035),(.034,.014,face['eye']),black);eye.parent=headroot
        brow=cube('eyebrow',(side*.105,face_y(side*.105,.12),.12),(.095,.022,.018),black,.008);brow.parent=headroot
        brow.rotation_euler.y=side*face['brow']
        if expr=='smug' and side==1:eye.scale.z*=.5
    if not premium: mouth=None
    if premium: pass
    elif expr in ('shock','talk','worried','determined'):
        mouth=sphere('mouth',(0,face_y(0,-.13),-.13),(face['width'],.016,face['height']),black);mouth.parent=headroot
        if expr=='determined':cube('clenched teeth',(0,face_y(0,-.13)-.018,-.13),(.14,.014,.022),skin,.004).parent=headroot
    else:
        curve=[]
        for j in range(13):
            x=-face['width']+j*face['width']*2/12
            z=-.13+(x/face['width'])**2*face['curve']
            curve.append((x,face_y(x,z),z))
        for a,b in zip(curve,curve[1:]):rope('mouth stroke',a,b,.01,black).parent=headroot
    facial=c.get('facial','none')
    if facial in ('mustache','beard','goatee'):
        hair=material(ident+' hair',(.06,.045,.035),.8)
        if facial=='mustache':
            for sx in (-1,1):
                o=sphere('mustache',(sx*.075,face_y(sx*.075,-.075)-.02,-.075),(.085,.03,.032),hair);o.rotation_euler.y=sx*.35;o.parent=headroot
        else:
            sphere('beard',(0,-.1,-.3),(.2,.12,.11),hair).parent=headroot
    hat=c.get('hat','beanie')
    if hat!='none':
        if hat=='beanie':sphere('beanie',(0,0,.27),(.325,.29,.17),hatmat).parent=headroot
        else:
            if hat in ('helmet','top','tricorne'):
                bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=.34,depth=.05,location=(0,0,.27));bpy.context.active_object.data.materials.append(hatmat);bpy.context.active_object.parent=headroot
            if hat=='crested':
                sphere('legion helmet',(0,0,.28),(.34,.3,.2),hatmat).parent=headroot
                crest=cube('helmet crest',(0,0,.5),(.06,.34,.14),trim,.02);crest.parent=headroot
            elif hat=='crown':
                for k in range(5):
                    a=k*math.tau/5;o=cube('crown point',(.22*math.cos(a),.22*math.sin(a),.36),(.07,.07,.16),trim,.01);o.parent=headroot
                bpy.ops.mesh.primitive_torus_add(major_radius=.25,minor_radius=.04,location=(0,0,.3));bpy.context.active_object.data.materials.append(trim);bpy.context.active_object.parent=headroot
            elif hat=='turban':
                for k in range(3):sphere('turban wrap',(0,0,.28+.07*k),(.34-.03*k,.3-.03*k,.12),hatmat).parent=headroot
            elif hat=='hood':
                sphere('hood',(0,.05,.1),(.38,.36,.42),hatmat).parent=headroot
            elif hat=='cap':sphere('cap',(0,0,.27),(.31,.27,.13),hatmat).parent=headroot;cube('cap peak',(0,-.28,.24),(.3,.2,.03),hatmat,.012).parent=headroot
            elif hat=='straw':
                bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=.5,depth=.03,location=(0,0,.27));bpy.context.active_object.data.materials.append(trim);bpy.context.active_object.parent=headroot
                sphere('straw crown',(0,0,.34),(.28,.25,.15),trim).parent=headroot
            elif hat=='hardhat':sphere('hardhat',(0,0,.3),(.35,.31,.2),trim).parent=headroot
            elif hat=='laurel':
                for k in range(9):
                    a=math.pi*.15+k*math.pi*.7/8;o=sphere('laurel leaf',(.3*math.cos(a)*1.0,-.3*math.sin(a)*.2+.0,.25),(.05,.03,.02),trim);o.parent=headroot
            elif hat=='headband':bpy.ops.mesh.primitive_torus_add(major_radius=.31,minor_radius=.03,location=(0,0,.2));bpy.context.active_object.data.materials.append(trim);bpy.context.active_object.parent=headroot
            elif hat=='helmet':sphere('helmet',(0,0,.28),(.34,.3,.2),hatmat).parent=headroot
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
    if outfit in ('tunic','rags'):
        body_details.append(cube('tunic hem',(0,0,.74),(.52,.34,.1),hatmat,.03));body_details.append(cube('rope belt',(0,-.01,.9),(.44,.32,.04),trim,.012))
    if outfit=='armor':
        body_details.extend([sphere('breastplate',(0,-.07,1.1),(.215,.12,.3),trim),cube('skirt strips',(0,0,.78),(.5,.34,.12),hatmat,.02),sphere('shoulder guard L',(-.24,0,1.28),(.1,.1,.06),trim),sphere('shoulder guard R',(.24,0,1.28),(.1,.1,.06),trim)])
    if outfit=='robe':
        body_details.extend([cube('robe skirt',(0,0,.62),(.56,.36,.5),cloth,.04),cube('robe sash',(0,-.01,.95),(.46,.32,.05),trim,.012)])
    if outfit=='dress':
        body_details.extend([cube('dress skirt',(0,0,.55),(.62,.4,.6),cloth,.05),cube('dress waist',(0,-.01,.93),(.42,.3,.05),trim,.01)])
    if outfit=='labcoat':
        body_details.extend([cube('lab coat',(0,0,.8),(.52,.36,.5),skin,.03),cube('coat pocket',(.12,-.18,.78),(.1,.02,.1),black,.005)])
    if outfit=='uniform':
        body_details.extend([cube('uniform sash',(0,-.15,1.1),(.1,.03,.5),trim,.008),cube('uniform belt',(0,-.01,.86),(.44,.32,.06),black,.015)])
    if outfit=='royal':
        body_details.extend([cube('royal mantle',(0,.1,.85),(.54,.1,.7),trim,.04),cube('fur collar',(0,-.02,1.32),(.46,.32,.08),skin,.03),sphere('royal brooch',(0,-.16,1.2),(.03,.02,.03),trim)])
    if premium and outfit not in ('armor','dress','robe','royal','labcoat'):
        body_details.extend([cube('shirt collar L',(-.075,-.13,1.3),(.1,.05,.055),cloth,.012),cube('shirt collar R',(.075,-.13,1.3),(.1,.05,.055),cloth,.012),
                             cube('placket',(0,-.158,1.08),(.03,.015,.4),skin if outfit=='labcoat' else cloth,.004)])
    detail_positions=[]
    for o in body_details:o.parent=root;detail_positions.append((o,o.location.copy()))
    joints={};segments=[];anchors={}
    pants=material(ident+' trousers',tuple(c.get('pants',(.42,.37,.2))),.85);shoe=material(ident+' shoes',(.35,.2,.1),.55)
    for side in ['left','right']:
        for joint in ['elbow','wrist','knee','ankle']:
            jm=black if not premium else (cloth if joint in ('elbow','wrist') else pants)
            jr=.034 if not premium else (.043 if joint=='elbow' else .036 if joint=='wrist' else .06 if joint=='knee' else .05)
            o=sphere(side+' '+joint,(0,0,0),(jr,)*3,jm);o.parent=root;joints[side+'_'+joint]=o
            if joint in ('wrist','ankle'):
                anchor=bpy.data.objects.new(side+' '+joint+' attachment',None);bpy.context.collection.objects.link(anchor);anchor.parent=root;anchors[side+'_'+joint]=anchor
        for a,b in [('shoulder','elbow'),('elbow','wrist'),('hip','knee'),('knee','ankle')]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.021,depth=1)
            o=bpy.context.active_object;o.name=side+' '+a+'-'+b
            o.data.materials.append(black if not premium else (cloth if a in ('shoulder','elbow') else pants));o.parent=root
            if premium:
                for pl in o.data.polygons:pl.use_smooth=True
                o['girth']=(.043 if a=='shoulder' else .038) if a in ('shoulder','elbow') else (.06 if a=='hip' else .052)
            segments.append((o,side+'_'+a,side+'_'+b))
        if premium:
            sphere(side+' shoe',(0,-.07,.0),(.075,.14,.046),shoe).parent=anchors[side+'_ankle']
            sphere(side+' shoe sole',(0,-.07,-.04),(.078,.145,.014),black).parent=anchors[side+'_ankle']
            sphere(side+' hand',(0,0,.07),(.052,.034,.075),skin).parent=anchors[side+'_wrist']
            th=sphere(side+' thumb',((-1 if side=='left' else 1)*.04,-.02,.05),(.018,.018,.04),skin);th.parent=anchors[side+'_wrist']
            for fi in range(3):sphere(side+' finger',(-.026+fi*.026,0,.14),(.014,.014,.04),skin).parent=anchors[side+'_wrist']
        else:
            sphere(side+' shoe',(0,-.05,-.025),(.058,.115,.03),black).parent=anchors[side+'_ankle']
    held=c.get('held')
    if held:
        wrist=anchors['right_wrist']
        if held=='crate':o=cube('held crate',(-.18,0,-.04),(.36,.25,.24),hatmat,.025);o.parent=wrist
        else:
            if held=='tool':
                cube('held handle',(0,0,.22),(.045,.045,.55),hatmat,.01).parent=wrist
                cube('tool head',(0,0,.46),(.4,.09,.08),black,.025).parent=wrist
            if held=='rifle':
                # wooden stock behind the grip, dark barrel forward along the aiming direction
                # built along the wrist's +z like the tools: the aim pose turns +z to point forward
                cube('rifle stock',(0,.02,-.2),(.06,.11,.34),hatmat,.01).parent=wrist
                cube('rifle body',(0,0,.1),(.055,.07,.32),hatmat,.008).parent=wrist
                cube('rifle barrel',(0,.015,.48),(.028,.028,.5),black,.004).parent=wrist
            if held=='cup':
                bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.1,depth=.16,location=(0,0,.06));o=bpy.context.active_object;o.data.materials.append(hatmat);o.parent=wrist
                sphere('cup contents',(0,0,.145),(.088,.088,.009),skin).parent=wrist
    if bench:
        for side in ['left','right']:
            hand=sphere(side+' hand',(0,0,.05),(.06,.045,.07),skin);hand.parent=anchors[side+'_wrist'];outline(hand,.01)
        for o in list(headroot.children):
            if o.type=='MESH' and not any(k in o.name for k in ('eye','brow','mouth','mustache','beard','ink','tongue','cheek','nose','ear','smile','crown point','laurel','crest')):outline(o,.013)
        for o in list(root.children):
            if o.type=='MESH' and o.name.startswith(('coat','tricorne','work apron','robe','dress','lab coat','royal','breastplate','tunic')):outline(o,.013)
    action=c.get('action','stand');base=Vector((*c['pos'],0));yaw=math.radians(c.get('yaw',0));scale=c.get('scale',1)
    for f in range(round(duration*fps)):
        p=pose(action,f/fps);off=Vector(p['root']);off.rotate(Euler((0,0,yaw)));root.location=base+off*scale;root.scale=(scale,)*3;root.rotation_euler=(p['tilt'],0,yaw)
        root.keyframe_insert('location',frame=f+1);root.keyframe_insert('rotation_euler',frame=f+1)
        headroot.location=p['head'];headroot.keyframe_insert('location',frame=f+1)
        body.location=(0,0,p['hips'][2]+.22);body.keyframe_insert('location',frame=f+1)
        for o,original in detail_positions:o.location=original+Vector((0,0,p['hips'][2]-.82));o.keyframe_insert('location',frame=f+1)
        for key,o in joints.items():o.location=p[key];o.keyframe_insert('location',frame=f+1)
        for key,o in anchors.items():o.location=p[key];o.keyframe_insert('location',frame=f+1)
        anchors['right_wrist'].rotation_euler.x=p['grip_angle'];anchors['right_wrist'].keyframe_insert('rotation_euler',frame=f+1)
        if mouth is not None and expr=='talk':
            shape=face_shape(expr,f/fps);mouth.scale=(shape['width'],.016,shape['height']);mouth.keyframe_insert('scale',frame=f+1)
        for o,a,b in segments:
            av,bv=Vector(p[a]),Vector(p[b]);d=bv-av;o.location=(av+bv)*.5;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();g=o.get('girth',.021)/.021;o.scale=(g,g,d.length)
            for prop in ['location','rotation_euler','scale']:o.keyframe_insert(prop,frame=f+1)
    return root