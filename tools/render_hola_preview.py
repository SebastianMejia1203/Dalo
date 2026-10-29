"""Render a local review video from the corrected .blend (never saves scene changes)."""
from pathlib import Path
import argparse
import sys
import bpy
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=640
scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
if hasattr(scene.eevee,'taa_render_samples'):
    scene.eevee.taa_render_samples=8
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.85,.9,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for obj in scene.objects:
    if obj.type in {'CAMERA','LIGHT'}:
        obj.hide_render=True
camera_data=bpy.data.cameras.new('HolaReviewCamera')
camera=bpy.data.objects.new('HolaReviewCamera',camera_data)
scene.collection.objects.link(camera)
camera.location=(0,-2.6,1.30)
camera.rotation_euler=(Vector((0,0,1.22))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'
camera_data.ortho_scale=1.00
scene.camera=camera
for name,location,power,size in [('Key',(-2,-3,4),350,4),('Fill',(2,-2,2),180,3)]:
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.shape='DISK'
    data.size=size
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector((0,0,1.2))-obj.location).to_track_quat('-Z','Y').to_euler()
parser=argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path, default=root/'data/inspection/hola-preview')
parser.add_argument('--view', choices=('front', 'side'), default='front')
parser.add_argument('--frames', type=int, nargs='*')
parser.add_argument('--workbench', action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
if args.workbench:
    scene.render.engine='BLENDER_WORKBENCH'
    scene.display.shading.light='STUDIO'
    scene.display.shading.color_type='MATERIAL'
folder=args.output_dir.resolve()
folder.mkdir(parents=True,exist_ok=True)
if args.view == 'side':
    camera.location=(2.6,-0.7,1.30)
    camera.rotation_euler=(Vector((0,0,1.22))-camera.location).to_track_quat('-Z','Y').to_euler()
if args.frames:
    for frame in args.frames:
        scene.frame_set(frame)
        scene.render.filepath=str(folder/f'frame_{frame:04}.png')
        bpy.ops.render.render(write_still=True)
else:
    scene.render.filepath=str(folder/'frame_')
    bpy.ops.render.render(animation=True)
