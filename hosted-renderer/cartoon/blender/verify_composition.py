"""Concrete synthetic Blender checks for geometry clearance and framing."""
import tempfile
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import bpy
from mathutils import Vector
from composition import enforce

def box(name,loc,size):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object;ob.name=name;ob.scale=size
    return ob

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc=bpy.context.scene
    bpy.ops.object.camera_add(location=(0,-5,2));sc.camera=bpy.context.object
    sc.camera.rotation_euler=(Vector((0,0,1))-sc.camera.location).to_track_quat('-Z','Y').to_euler()
    sc.camera.data.lens=35
    # Upright card, with a barrel deliberately between it and the camera.
    card=box('wave',(0,0,1),(.8,.02,2))
    barrel=box('barrel',(0,-2,1),(1,1,2))
    shot={'duration':1,'composition':{'face_max':.4,'wave_min':.25,'emotion':False}}
    with tempfile.TemporaryDirectory() as out:
        enforce(sc,shot,{barrel},[card],[],out)
        assert barrel.hide_render,'foreground barrel must be hidden'
        import json
        qa=json.load(open(out+'/composition-qa.json'))
        assert qa['wave_height_peak']>=.25,qa
        assert 'barrel' in qa['hidden_scenery'],qa
    print('PASS: barrel cleared; wave >=25%')

if __name__=='__main__':main()