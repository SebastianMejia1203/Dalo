"""Create Esperar / Lo siento from the local LSC-54 references.

Blender --background web/public/Animaciones/perfecto.blend --python this_file
-- --sign esperar|losiento. Writes only the selected sign, its editable and report.
References inspected: participants 1, 3, 21, Cordialidad/<sign>/0.avi.
Technical reconstruction; linguistic validation remains pending.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from author_perdon_blender import solve_elbow, orient_axes, align_hand, aim_roll

ROOT = Path(__file__).resolve().parents[1]
FPS = 30
FRAMES = 91


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def envelope(frame):
    return smooth((frame - 8) / 22) * (1 - smooth((frame - 64) / 22))


def hand_orientation(direction, normal):
    d = direction.normalized()
    n = (normal - d * normal.dot(d)).normalized()
    return Matrix((d, n, d.cross(n))).transposed().to_quaternion()


def author(sign):
    bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.vrm")
    rig = bpy.data.objects['Armature']
    bpy.context.view_layer.objects.active = rig
    if rig.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(True)
    rig.animation_data_clear()
    rig.data.animation_data_clear()
    bones = rig.pose.bones
    for bone in bones:
        bone.rotation_mode = 'QUATERNION'
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1
    scene.frame_start, scene.frame_end = 1, FRAMES
    action = bpy.data.actions.new('Esperar' if sign == 'esperar' else 'Lo siento')
    rig.animation_data_create()
    rig.animation_data.action = action
    names = [f'J_Bip_{s}_{b}' for s in ('R', 'L')
             for b in ('UpperArm', 'LowerArm', 'Hand')]
    names += [f'J_Bip_{s}_{d}{i}' for s in ('R', 'L')
              for d in ('Thumb', 'Index', 'Middle', 'Ring', 'Little') for i in (1, 2, 3)]
    refs = {}
    for side in ('R', 'L'):
        fwd = (bones[f'J_Bip_{side}_Middle1'].bone.tail_local -
               bones[f'J_Bip_{side}_Middle1'].bone.head_local).normalized()
        across = (bones[f'J_Bip_{side}_Index1'].bone.head_local -
                  bones[f'J_Bip_{side}_Little1'].bone.head_local)
        palm = fwd.cross(across).normalized() * (-1 if side == 'R' else 1)
        own = {(d, i): (bones[f'J_Bip_{side}_{d}{i}'].bone.tail_local -
                       bones[f'J_Bip_{side}_{d}{i}'].bone.head_local).normalized()
               for d in ('Thumb', 'Index', 'Middle', 'Ring', 'Little') for i in (1, 2, 3)}
        refs[side] = (fwd, palm, own)
    previous = {}
    samples = []
    max_error = max_step = max_bend = 0.0
    for frame in range(1, FRAMES + 1):
        scene.frame_set(frame)
        for bone in bones:
            bone.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        amount = envelope(frame)
        wrists = {}
        for side in ('R', 'L'):
            mirror = -1 if side == 'R' else 1
            rest = Vector((mirror * .07, -.16, .92))
            active = amount if sign == 'esperar' or side == 'R' else 0.0
            wave = math.sin((frame - 30) / 34 * 4 * math.pi) * .5 + .5
            if sign == 'esperar':
                wrist = rest.lerp(Vector((mirror * .19, -.25, 1.18)), active)
                direction = Vector((mirror * .12, -.85, .50))
                normal = Vector((0, .50, .85))
                pole = Vector((mirror * .28, -.02, 1.05))
            else:
                # Flat right hand across the upper left chest; left at rest.
                wrist = rest.lerp(Vector((-.085, -.155, 1.230)), active)
                direction = Vector((.98, .03, .20))
                normal = Vector((0, 1, 0))
                pole = Vector((mirror * .23, -.08, 1.06))
            upper, lower, hand = [bones[f'J_Bip_{side}_{b}'] for b in ('UpperArm', 'LowerArm', 'Hand')]
            shoulder = upper.head.copy()
            l1 = (lower.bone.head_local - upper.bone.head_local).length
            l2 = (hand.bone.head_local - lower.bone.head_local).length
            elbow = solve_elbow(shoulder, wrist, l1, l2, pole - shoulder)
            udir, ldir = (elbow - shoulder).normalized(), (wrist - elbow).normalized()
            hinge = udir.cross(ldir).normalized()
            axis = Vector((0, 0, 1 if side == 'R' else -1))
            orient_axes(upper, upper.bone.tail_local - upper.bone.head_local, axis, udir, hinge)
            orient_axes(lower, lower.bone.tail_local - lower.bone.head_local, axis, ldir, hinge)
            max_error = max(max_error, (hand.head - wrist).length)
            rest_dir = Vector((-mirror * .70, -.50, -.20)).normalized()
            orientation = hand_orientation(rest_dir, Vector((0, 0, -1))).slerp(
                hand_orientation(direction, normal), active)
            direction = orientation @ Vector((1, 0, 0))
            normal = orientation @ Vector((0, 1, 0))
            # Transport forearm roll toward the intended palm before orienting hand.
            baseline = -hinge if side == 'R' else hinge
            target = (normal - ldir * normal.dot(ldir)).normalized()
            roll = math.atan2(ldir.dot(baseline.cross(target)), baseline.dot(target))
            roll = max(-math.radians(85), min(math.radians(85), roll))
            lower.matrix = Matrix.Translation(lower.head.copy()) @ (
                Quaternion(ldir, roll) @ lower.matrix.to_quaternion()).to_matrix().to_4x4()
            bpy.context.view_layer.update()
            # Limit wrist bend while preserving the hand's intended palm orientation.
            angle = ldir.angle(direction)
            direction = Quaternion().slerp(ldir.rotation_difference(direction),
                min(1, math.radians(40) / max(angle, 1e-6))) @ ldir
            max_bend = max(max_bend, math.degrees(ldir.angle(direction)))
            delta = align_hand(bones, side, direction, normal)
            fwd, palm, own = refs[side]
            nail = -palm
            inward = -(delta @ palm).normalized()
            for digit in ('Index', 'Middle', 'Ring', 'Little'):
                # Esperar: separated curved fingers flex twice, as in the references.
                curl = active * (12 + 10 * wave) if sign == 'esperar' else 0
                for seg in (1, 2, 3):
                    bone = bones[f'J_Bip_{side}_{digit}{seg}']
                    adduction = .20 if sign == 'esperar' else .80
                    d = own[digit, seg].lerp(fwd, adduction).normalized()
                    a = math.radians(curl * (1 if seg == 1 else 1.25))
                    if seg > 1:
                        parent = bones[f'J_Bip_{side}_{digit}{seg-1}']
                        d = (parent.tail - parent.head).normalized()
                        p = delta @ palm
                    else:
                        d, p = delta @ d, delta @ palm
                    bend = (p - d * p.dot(d)).normalized()
                    aim_roll(bone, d * math.cos(a) + bend * math.sin(a), nail, inward)
            thumb = own['Thumb', 1].lerp(fwd, .10 if sign == 'esperar' else .55).normalized()
            for seg in (1, 2, 3):
                aim_roll(bones[f'J_Bip_{side}_Thumb{seg}'], delta @ thumb, nail, inward)
            wrists[side] = list(hand.head)
        for name in names:
            q = bones[name].rotation_quaternion.copy().normalized()
            if name in previous:
                if q.dot(previous[name]) < 0:
                    q.negate()
                step = math.degrees(q.rotation_difference(previous[name]).angle)
                if step > 20:
                    print('STEP', frame, name, step, flush=True)
                max_step = max(max_step, step)
            previous[name] = q.copy()
            bones[name].rotation_quaternion = q
            bones[name].keyframe_insert(data_path='rotation_quaternion', frame=frame, group=name)
        samples.append(wrists)
    curves = [c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'
    assert max_error < 1e-4, max_error
    assert max_step < 20, max_step
    assert max_bend <= 40.01, max_bend
    assert len(curves) == len(names) * 4
    assert all(len(c.keyframe_points) == FRAMES for c in curves)
    for side in ('R', 'L'):
        assert (Vector(samples[0][side]) - Vector(samples[-1][side])).length < 1e-5
    out = ROOT / f'web/public/avatar/{sign}.vrma'
    blend = ROOT / f'web/public/Animaciones/{sign}.blend'
    scene.frame_set(45)
    assert bpy.ops.export_scene.vrma(filepath=str(out), armature_object_name=rig.name) == {'FINISHED'}
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report = dict(sign=sign, frames=FRAMES, fps=FPS, max_wrist_error_m=max_error,
                  max_local_step_deg=max_step, max_wrist_bend_deg=max_bend,
                  wrists=samples, linguistically_validated=False,
                  references=[f'LSC-54/RawVideos/Videos Courtesy/{p}/Cordialidad/'
                              f'{"Esperar" if sign == "esperar" else "Lo siento"}/0.avi' for p in (1, 3, 21)])
    (ROOT / 'data/inspection').mkdir(parents=True, exist_ok=True)
    (ROOT / f'data/inspection/{sign}-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('RESULT', sign, max_error, max_step, max_bend)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sign', choices=('esperar', 'losiento'), required=True)
    author(parser.parse_args(sys.argv[sys.argv.index('--') + 1:]).sign)
