"""Check the shared Ayuda rest pose and the inward palm angle in Hola."""
from pathlib import Path
import math
import bpy
from mathutils import Quaternion, Vector

root = Path(__file__).resolve().parents[1]
rig = bpy.data.objects['Armature']
scene = bpy.context.scene
with bpy.data.libraries.load(str(root / 'web/public/Animaciones/ayuda.blend')) as (source, destination):
    destination.actions = ['Ayudar']
reference = destination.actions[0]
components = {}
for layer in reference.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                if curve.data_path.endswith('rotation_quaternion'):
                    name = curve.data_path.split('"')[1]
                    components.setdefault(name, [0.0] * 4)[curve.array_index] = curve.evaluate(1)
rest = {name: Quaternion(values).normalized() for name, values in components.items()}
bpy.data.actions.remove(reference)
action = rig.animation_data.action
rig.animation_data.action = None
for name, rotation in rest.items():
    rig.pose.bones[name].rotation_quaternion = rotation
bpy.context.view_layer.update()
rest_hands = {side: rig.pose.bones[f'J_Bip_{side}_Hand'].matrix.copy() for side in ('R', 'L')}
rig.animation_data.action = action
max_rest_error = max_rest_hand_angle = 0.0
for frame in (1, 7, scene.frame_end):
    scene.frame_set(frame)
    for side, matrix in rest_hands.items():
        current = rig.pose.bones[f'J_Bip_{side}_Hand'].matrix
        max_rest_error = max(max_rest_error, (current.translation - matrix.translation).length)
        max_rest_hand_angle = max(max_rest_hand_angle, math.degrees(2 * math.acos(min(1, abs(current.to_quaternion().normalized().dot(matrix.to_quaternion().normalized()))))))
print('HOLA_SHARED_REST_ERROR', max_rest_error, 'HAND_ANGLE', max_rest_hand_angle)
# Shoulder/forearm roll may redistribute while preserving the visible pose.
assert max_rest_error < 1e-5 and max_rest_hand_angle < 0.1, 'Hola must preserve the hands-together pose from Ayuda'
max_idle_wrist_bend = max_idle_step = 0.0
previous = {}
for frame in range(1, scene.frame_end + 1):
    scene.frame_set(frame)
    bones = rig.pose.bones
    forearm = bones['J_Bip_L_Hand'].head - bones['J_Bip_L_LowerArm'].head
    forward = bones['J_Bip_L_Middle1'].head - bones['J_Bip_L_Hand'].head
    max_idle_wrist_bend = max(max_idle_wrist_bend, math.degrees(forearm.angle(forward)))
    for part in ('UpperArm', 'LowerArm', 'Hand'):
        rotation = bones[f'J_Bip_L_{part}'].matrix.to_quaternion().normalized()
        if part in previous:
            max_idle_step = max(max_idle_step, math.degrees(2 * math.acos(min(1, abs(rotation.dot(previous[part]))))))
        previous[part] = rotation
print('HOLA_IDLE_WRIST_BEND', max_idle_wrist_bend, 'MAX_STEP', max_idle_step)
assert max_idle_wrist_bend < 32, 'The passive wrist must remain aligned with the forearm'
assert max_idle_step < 20, 'The passive hand must settle smoothly'
for frame in (30, 34, 40, 45):
    scene.frame_set(frame)
    bones = rig.pose.bones
    forward = (bones['J_Bip_L_Middle1'].head - bones['J_Bip_L_Hand'].head).normalized()
    across = bones['J_Bip_L_Index1'].head - bones['J_Bip_L_Little1'].head
    palm = forward.cross(across).normalized()
    print('HOLA_IDLE_PALM', frame, tuple(palm), 'FINGERS', tuple(forward))
    assert palm.y > 0.75, 'Idle palm must face the body instead of the floor'
    assert abs(palm.z) < 0.35, 'Idle palm must lie along the body'
    assert forward.z < -0.50, 'Idle fingers must relax downward along the skirt'
for frame in (34, 40):
    scene.frame_set(frame)
    bones = rig.pose.bones
    forward = (bones['J_Bip_R_Middle1'].head - bones['J_Bip_R_Hand'].head).normalized()
    across = bones['J_Bip_R_Index1'].head - bones['J_Bip_R_Little1'].head
    palm = -forward.cross(across).normalized()
    print('HOLA_INWARD_PALM', frame, tuple(palm))
    assert palm.x > 0.30, 'The raised right palm must turn inward toward the body'
    assert 0.60 < palm.dot(Vector((0, -1, 0))) < 0.95, 'Palm must remain oblique rather than flat toward the viewer'
print('HOLA_START_AND_PALM_PASS')
