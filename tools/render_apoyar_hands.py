"""Close hand review from multiple angles; does not save scene changes."""
from pathlib import Path
import argparse
import sys
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--workbench', action='store_true')
parser.add_argument('--frame', type=int, default=32)
parser.add_argument('--clip', choices=('apoyar', 'ayuda'), default='apoyar')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
scene = bpy.context.scene
scene.frame_set(args.frame)
scene.render.engine = 'BLENDER_WORKBENCH' if args.workbench else 'BLENDER_EEVEE'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world.color = (0.6, 0.6, 0.6)
for obj in scene.objects:
    if obj.type in {'CAMERA', 'LIGHT'}:
        obj.hide_render = True
target = Vector((0, -0.24, 1.185))
if args.clip == 'ayuda':
    bones = bpy.data.objects['Armature'].pose.bones
    target = (bones['J_Bip_R_Hand'].head + bones['J_Bip_L_Hand'].head) * 0.5 + Vector((0, -0.025, 0.025))
data = bpy.data.cameras.new('HandReview')
camera = bpy.data.objects.new('HandReview', data)
scene.collection.objects.link(camera)
scene.camera = camera
data.type = 'ORTHO'
data.ortho_scale = 0.30
if args.clip == 'ayuda':
    data.ortho_scale = 0.38
for name, position, energy in [('Key', (-2,-3,4), 350), ('Fill', (2,-2,2), 180)]:
    light_data = bpy.data.lights.new(name, 'AREA')
    light_data.energy = energy
    light_data.size = 3
    light = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (target - light.location).to_track_quat('-Z','Y').to_euler()
folder = Path(__file__).resolve().parents[1] / f'data/inspection/{args.clip}-thumb-review'
if args.clip == 'ayuda':
    folder = folder / f'frame-{args.frame}'
if args.workbench:
    folder = folder / f'geometry-{args.frame}'
folder.mkdir(exist_ok=True, parents=True)
for name, offset in [('front', (0,-2,0)), ('right', (2,-1,0)), ('left', (-2,-1,0)), ('back', (1,2,0))]:
    camera.location = target + Vector(offset)
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(folder / f'{name}.png')
    bpy.ops.render.render(write_still=True)
