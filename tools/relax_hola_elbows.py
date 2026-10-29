"""Redistribute roll along Hola's arms while preserving both hand poses."""
import math
import runpy
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
PARTS = ('UpperArm', 'LowerArm', 'Hand')


def relax_elbows(rig, scene):
    helper = runpy.run_path(str(ROOT / 'tools/fix_bienvenido_elbows.py'))
    count = scene.frame_end
    samples = {}
    rolls = {s: [] for s in ('R', 'L')}
    previous = {s: (0.0, 0.0, 0.0) for s in rolls}
    for frame in range(1, count + 1):
        scene.frame_set(frame)
        samples[frame] = {}
        for side in rolls:
            bones = [rig.pose.bones[f'J_Bip_{side}_{part}'] for part in PARTS]
            matrices = [b.matrix.copy() for b in bones]
            world = [m.to_quaternion().normalized() for m in matrices]
            parent = bones[0].parent
            parent_frame = (parent.matrix.to_quaternion()
                            @ parent.bone.matrix_local.to_quaternion().inverted()
                            @ bones[0].bone.matrix_local.to_quaternion())
            links = [bones[i].bone.matrix_local.to_quaternion().inverted()
                     @ bones[i + 1].bone.matrix_local.to_quaternion() for i in (0, 1)]
            axis = (matrices[2].translation - matrices[0].translation).normalized()
            previous[side] = helper['fit_roll'](world, parent_frame, links, previous[side], True, axis)
            rolls[side].append(previous[side])
            samples[frame][side] = (matrices, world, parent_frame, links, axis)
    for side in rolls:
        for _ in range(2):
            values = rolls[side]
            rolls[side] = [tuple(sum(values[min(count - 1, max(0, i + d))][axis] * w
                                    for d, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))) / 16
                                 for axis in range(3)) for i in range(count)]
    last = {}
    max_hand_shift = max_hand_angle = max_elbow_shift = 0.0
    for frame in range(1, count + 1):
        scene.frame_set(frame)
        for side in rolls:
            matrices, world, parent_frame, links, axis = samples[frame][side]
            rotations = helper['local_rotations'](world, parent_frame, links, *rolls[side][frame - 1], reach_axis=axis)
            for part, q in zip(PARTS, rotations):
                bone = rig.pose.bones[f'J_Bip_{side}_{part}']
                q.normalize()
                if bone.name in last and last[bone.name].dot(q) < 0:
                    q.negate()
                last[bone.name] = q.copy()
                bone.rotation_quaternion = q
                bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
            bpy.context.view_layer.update()
            hand = rig.pose.bones[f'J_Bip_{side}_Hand']
            elbow = rig.pose.bones[f'J_Bip_{side}_LowerArm']
            max_hand_shift = max(max_hand_shift, (hand.head - matrices[2].translation).length)
            max_elbow_shift = max(max_elbow_shift, (elbow.head - matrices[1].translation).length)
            max_hand_angle = max(max_hand_angle, math.degrees(2 * math.acos(min(1, abs(hand.matrix.to_quaternion().normalized().dot(world[2]))))))
    print('HOLA_ELBOW_RELAX', max_hand_shift, max_hand_angle, max_elbow_shift)
    assert max_hand_shift < 1e-5
    assert max_hand_angle < 0.1
    assert max_elbow_shift < 0.055
    return {'max_hand_displacement_m': max_hand_shift,
            'max_hand_orientation_error_deg': max_hand_angle,
            'max_elbow_displacement_m': max_elbow_shift}


def use_runtime_body():
    """Use the same elbow geometry/weights as the VRM loaded by Dalo."""
    body = bpy.data.objects['Body']
    with bpy.data.libraries.load(str(ROOT / 'tools/assets/avatar-superficie.blend')) as (source, destination):
        destination.objects = ['Body']
    runtime = destination.objects[0]
    assert [g.name for g in body.vertex_groups] == [g.name for g in runtime.vertex_groups], 'Runtime vertex-group order differs'
    assert len(body.data.vertices) == len(runtime.data.vertices)
    body.data = runtime.data.copy()
    bpy.data.objects.remove(runtime, do_unlink=True)
