"""Inspect Hola's elbows on the runtime avatar surface, without saving."""
import argparse
import json
import runpy
import sys
from pathlib import Path
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path, required=True)
parser.add_argument('--frame', type=int, default=40)
parser.add_argument('--posed-mesh', type=Path)
parser.add_argument('--materials', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.output_dir = args.output_dir.resolve()
runpy.run_path(str(root / 'tools/relax_hola_elbows.py'))['use_runtime_body']()
scene = bpy.context.scene
scene.frame_set(args.frame)
if args.posed_mesh:
    body, rig = bpy.data.objects['Body'], bpy.data.objects['Armature']
    posed = json.loads(args.posed_mesh.read_text(encoding='utf-8'))
    assert posed['frame'] == args.frame
    assert len(posed['positions']) == len(body.data.vertices)
    transform = (rig.matrix_world.inverted() @ body.matrix_world).inverted()
    for vertex, position in zip(body.data.vertices, posed['positions']):
        vertex.co = transform @ Vector(position)
    for modifier in body.modifiers:
        if modifier.type == 'ARMATURE':
            modifier.show_render = modifier.show_viewport = False
    body.data.normals_split_custom_set([(0, 0, 0)] * len(body.data.loops))
    body.data.update()
scene.render.engine = 'BLENDER_WORKBENCH'
if args.materials:
    scene.render.engine = 'BLENDER_EEVEE'
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.8,.85,.9,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .5
    for name, position, power in [('ElbowKey',(-2,-3,4),350),('ElbowFill',(2,-2,2),180)]:
        light_data=bpy.data.lights.new(name,'AREA')
        light_data.energy=power
        light_data.size=3
        light=bpy.data.objects.new(name,light_data)
        scene.collection.objects.link(light)
        light.location=position
        light.rotation_euler=(Vector((0,0,1.2))-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
data = bpy.data.cameras.new('ElbowReview')
camera = bpy.data.objects.new('ElbowReview', data)
scene.collection.objects.link(camera)
scene.camera = camera
data.type = 'ORTHO'
data.ortho_scale = .36
args.output_dir.mkdir(parents=True, exist_ok=True)
for side in ('L', 'R'):
    elbow = bpy.data.objects['Armature'].pose.bones[f'J_Bip_{side}_LowerArm'].head.copy()
    for label, offset in [('front', (0,-2,0)), ('outside', (2 if side == 'L' else -2, -.5, 0))]:
        camera.location = elbow + Vector(offset)
        camera.rotation_euler = (elbow-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(args.output_dir / f'{side}-{label}-{args.frame}.png')
        bpy.ops.render.render(write_still=True)
