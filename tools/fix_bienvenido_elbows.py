"""Distribute axial roll without changing hand orientation or joint positions.

Run in Blender with bienvenido-fluido.blend. Keeps the input animation intact.
Local Y is the longitudinal bone axis. Optimize upper/lower roll together,
then compensate the hand's local rotation to preserve its world orientation.
With --shoulder-safe, allow up to 15 degrees of elbow swivel about the reach
axis; wrist positions stay fixed, while elbow displacement is bounded.
"""
import json
import argparse
import math
import runpy
import sys
from itertools import product
from pathlib import Path
import bpy
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[1]
PARTS = ('UpperArm', 'LowerArm', 'Hand')


def axial(q):
    return q.normalized().to_swing_twist('Y')[1]


def local_rotations(world, parent_frame, rest_links, a, b, swivel=0.0, reach_axis=None):
    turn = Quaternion(reach_axis, swivel) if reach_axis is not None else Quaternion()
    upper = turn @ world[0] @ Quaternion((0, 1, 0), a)
    lower = turn @ world[1] @ Quaternion((0, 1, 0), b)
    return (parent_frame.inverted() @ upper,
            (upper @ rest_links[0]).inverted() @ lower,
            (lower @ rest_links[1]).inverted() @ world[2])


def fit_roll(world, parent_frame, rest_links, start, shoulder_safe=False, reach_axis=None):
    def cost(a, b, swivel=0.0):
        qs = local_rotations(world, parent_frame, rest_links, a, b, swivel, reach_axis)
        twists = [axial(q) for q in qs]
        # The shoulder profile balances all three joints rather than treating
        # the shoulder as an unrestricted way to unload the elbow.
        weights = (2.0, 1.2, 1.3) if shoulder_safe else (0.35, 2.5, 1.0)
        limits = (45, 36, 40) if shoulder_safe else (85, 38, 42)
        return (sum(w * t * t for w, t in zip(weights, twists))
                + 0.04 * (a * a + b * b) + 0.8 * swivel * swivel
                + sum((10000 if shoulder_safe else 100) * max(0, abs(t) - math.radians(limit)) ** 2
                      for t, limit in zip(twists, limits)))
    values = tuple(start)
    for step_deg in (8, 2, 0.5, 0.1):
        step = math.radians(step_deg)
        for _ in range(40):
            candidates = [tuple(v + d * step for v, d in zip(values, ds))
                          for ds in product((-1, 0, 1), repeat=len(values))]
            candidates = [v for v in candidates if abs(v[0]) < math.radians(100)
                          and abs(v[1]) < math.radians(100)
                          and (len(v) == 2 or abs(v[2]) <= math.radians(15))]
            best = min(candidates, key=lambda pair: cost(*pair))
            if best == values:
                break
            values = best
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--shoulder-safe', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    bpy.ops.preferences.addon_enable(module='bl_ext.blender_org.vrm')
    rig = bpy.data.objects['Armature']
    scene = bpy.context.scene
    source = rig.animation_data.action
    frames = {}
    rolls = {s: [] for s in ('R', 'L')}
    previous = {s: (0.0, 0.0, 0.0) if args.shoulder_safe else (0.0, 0.0) for s in rolls}
    for frame in range(1, 72):
        scene.frame_set(frame)
        frames[frame] = {}
        for side in rolls:
            bones = [rig.pose.bones[f'J_Bip_{side}_{p}'] for p in PARTS]
            matrices = [bone.matrix.copy() for bone in bones]
            world = [m.to_quaternion().normalized() for m in matrices]
            parent = bones[0].parent
            parent_frame = (parent.matrix.to_quaternion()
                            @ parent.bone.matrix_local.to_quaternion().inverted()
                            @ bones[0].bone.matrix_local.to_quaternion())
            rest_links = [bones[i].bone.matrix_local.to_quaternion().inverted()
                          @ bones[i + 1].bone.matrix_local.to_quaternion()
                          for i in (0, 1)]
            reach_axis = (matrices[2].translation - matrices[0].translation).normalized() if args.shoulder_safe else None
            previous[side] = fit_roll(world, parent_frame, rest_links, previous[side], args.shoulder_safe, reach_axis)
            rolls[side].append(previous[side])
            frames[frame][side] = (matrices, world, parent_frame, rest_links)

    # Remove tiny optimizer quantization steps without changing sign/phase.
    for side in rolls:
        for _ in range(2):
            values = rolls[side]
            rolls[side] = [tuple(sum(values[min(70, max(0, i + d))][axis] * w
                                    for d, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))) / 16
                                 for axis in range(len(values[0]))) for i in range(71)]

    action = source.copy()
    action.name = 'Bienvenido_hombros_corregidos' if args.shoulder_safe else 'Bienvenido_codos_corregidos'
    rig.animation_data.action = action
    max_position_error = max_hand_angle = max_step = max_elbow_shift = 0.0
    last = {}
    for frame in range(1, 72):
        scene.frame_set(frame)
        for side in rolls:
            matrices, world, parent_frame, rest_links = frames[frame][side]
            reach_axis = (matrices[2].translation - matrices[0].translation).normalized() if args.shoulder_safe else None
            qs = local_rotations(world, parent_frame, rest_links, *rolls[side][frame - 1], reach_axis=reach_axis)
            for part, q in zip(PARTS, qs):
                bone = rig.pose.bones[f'J_Bip_{side}_{part}']
                q.normalize()
                if bone.name in last and last[bone.name].dot(q) < 0:
                    q.negate()
                last[bone.name] = q.copy()
                bone.rotation_quaternion = q
                bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
            bpy.context.view_layer.update()
            bones = [rig.pose.bones[f'J_Bip_{side}_{p}'] for p in PARTS]
            for index, (bone, old) in enumerate(zip(bones, matrices)):
                distance = (bone.head - old.translation).length
                if args.shoulder_safe and index == 1:
                    max_elbow_shift = max(max_elbow_shift, distance)
                else:
                    max_position_error = max(max_position_error, distance)
            hand_angle = 2 * math.acos(min(1, abs(bones[2].matrix.to_quaternion().normalized().dot(world[2]))))
            max_hand_angle = max(max_hand_angle, math.degrees(hand_angle))
    assert max_position_error < 1e-5, max_position_error
    assert max_hand_angle < 0.1, max_hand_angle
    assert max_elbow_shift < 0.055, max_elbow_shift
    joint_checks = runpy.run_path(str(ROOT / 'tools/check_bienvenido_elbows.py'))
    if args.shoulder_safe:
        runpy.run_path(str(ROOT / 'tools/check_bienvenido_shoulders.py'))
    runpy.run_path(str(ROOT / 'tools/check_bienvenido_flow.py'))
    previous_world = {}
    for frame in range(1, 72):
        scene.frame_set(frame)
        for side in rolls:
            for part in PARTS:
                bone = rig.pose.bones[f'J_Bip_{side}_{part}']
                q = bone.matrix.to_quaternion().normalized()
                if bone.name in previous_world:
                    step = math.degrees(2 * math.acos(min(1, abs(q.dot(previous_world[bone.name])))))
                    max_step = max(max_step, step)
                previous_world[bone.name] = q.copy()
    assert max_step < 20, max_step
    scene.frame_set(1)
    stem = 'bienvenido' if args.shoulder_safe else 'bienvenido-codos-corregidos'
    out = ROOT / (f'web/public/avatar/{stem}.vrma' if args.shoulder_safe else f'build/animaciones/{stem}.vrma')
    blend = ROOT / (f'web/public/Animaciones/{stem}.blend' if args.shoulder_safe else f'build/animaciones/{stem}.blend')
    out.parent.mkdir(parents=True, exist_ok=True)
    blend.parent.mkdir(parents=True, exist_ok=True)
    assert bpy.ops.export_scene.vrma(filepath=str(out), armature_object_name=rig.name) == {'FINISHED'}
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report = dict(source=source.name, frames=71,
                  method='Joint axial roll redistribution; bounded elbow swivel with fixed wrists and hand world rotations' if args.shoulder_safe else 'Joint axial roll redistribution; fixed joint heads and hand world rotations',
                  max_joint_displacement_m=max(max_position_error, max_elbow_shift),
                  max_fixed_joint_displacement_m=max_position_error,
                  max_elbow_displacement_m=max_elbow_shift,
                  max_local_axial_twist_deg=joint_checks['maximum'],
                  max_hand_orientation_error_deg=max_hand_angle,
                  max_world_step_deg=max_step, linguistically_validated=False)
    report_name = f'{stem}-report.json' if args.shoulder_safe else 'bienvenido-codos-report.json'
    (ROOT / 'data/inspection').mkdir(parents=True, exist_ok=True)
    (ROOT / 'data/inspection' / report_name).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('ELBOW_FIX_RESULT', json.dumps(report))


if __name__ == '__main__':
    main()
