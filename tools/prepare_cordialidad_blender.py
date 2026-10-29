"""First editable versions of the 23 remaining Cordialidad expressions.

Run in Blender with losiento.blend as the base; -- --sign <id>.
Input: public/avatar/<id>.json; wrist trajectories plus authored palm/finger targets.
Output: public/avatar/<id>.vrma, public/Animaciones/<id>.blend and a report.
Only IDs explicitly listed in cordialidad.json are accepted. Existing manually
authored expressions are never processed. Retargeting is experimental: these
first versions require per-sign anatomical and linguistic review.
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
from author_esperar_losiento_blender import hand_orientation
from poses_cordialidad import targets, finger_angles, RIGHT_ONLY

ROOT = Path(__file__).resolve().parents[1]
FPS = 30
MAX_STEP = math.radians(14)


def build(sign):
    manifest = json.loads((ROOT / 'web/src/app/cordialidad.json').read_text(encoding='utf-8'))
    entry = next(e for e in manifest if e['id'] == sign)
    source = json.loads((ROOT / f'web/public/avatar/{sign}.json').read_text(encoding='utf-8'))
    bpy.ops.preferences.addon_enable(module='bl_ext.blender_org.vrm')
    rig = bpy.data.objects['Armature']
    bpy.context.view_layer.objects.active = rig
    if rig.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1
    scene.frame_set(1)
    bpy.context.view_layer.update()
    names = [f'J_Bip_{side}_{part}' for side in ('R', 'L')
             for part in ('Shoulder', 'UpperArm', 'LowerArm', 'Hand')]
    names += [f'J_Bip_{side}_{digit}{seg}' for side in ('R', 'L')
              for digit in ('Thumb', 'Index', 'Middle', 'Ring', 'Little') for seg in (1, 2, 3)]
    # Build anatomical poses; the raw 3D landmark export is deliberately unused.
    # Two-dimensional wrist paths retain the reference movement. Palm and finger
    # targets are authored per expression to avoid the initial retarget artefacts.
    rig.animation_data_clear()
    rig.data.animation_data_clear()
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    bones = rig.pose.bones
    refs = {}
    for side in ('R', 'L'):
        fwd = (bones[f'J_Bip_{side}_Middle1'].bone.tail_local - bones[f'J_Bip_{side}_Middle1'].bone.head_local).normalized()
        across = bones[f'J_Bip_{side}_Index1'].bone.head_local - bones[f'J_Bip_{side}_Little1'].bone.head_local
        palm = fwd.cross(across).normalized() * (-1 if side == 'R' else 1)
        own = {(digit, seg): (bones[f'J_Bip_{side}_{digit}{seg}'].bone.tail_local - bones[f'J_Bip_{side}_{digit}{seg}'].bone.head_local).normalized()
               for digit in ('Thumb', 'Index', 'Middle', 'Ring', 'Little') for seg in (1, 2, 3)}
        refs[side] = (fwd, palm, own)
    frames = source['fotogramas']
    # The long reference videos contain repeated demonstrations: use the first.
    frames = frames[:60] if sign in {'no', 'muchasgracias'} else frames
    count = len(frames)
    shoulder_center = (bones['J_Bip_L_UpperArm'].head + bones['J_Bip_R_UpperArm'].head) * .5
    width = abs(bones['J_Bip_L_UpperArm'].head.x - bones['J_Bip_R_UpperArm'].head.x)
    centers = [(Vector(f['pose'][11]) + Vector(f['pose'][12])) * .5 for f in frames]
    center = sum(centers, Vector()) / count
    source_width = sum(abs(f['pose'][11][0] - f['pose'][12][0]) for f in frames) / count
    scale = width / (source_width * (640 / 360))
    wrist_paths = {}
    for side, index in (('R', 16), ('L', 15)):
        path = [Vector(f['pose'][index]) for f in frames]
        wrist_paths[side] = [sum(path[max(0, i-2):min(count, i+3)], Vector()) / len(path[max(0, i-2):min(count, i+3)]) for i in range(count)]
    # Subida maxima por lado: la rotacion de la seña solo existe con la mano
    # arriba del todo (como en el video de referencia: primero sube, despues
    # gira). Con el umbral antiguo (rise / .13) la mano ya rotaba a medio
    # camino de la subida.
    rise_max = {}
    for side in ('R', 'L'):
        base = wrist_paths[side][0]
        rise_max[side] = max([max(0.0, base.y - p.y) for p in wrist_paths[side]] + [0.0])
    smoothed = []
    max_wrist_error = max_bend = 0.0
    for index in range(count):
        t = index / max(1, count - 1)
        for bone in bones:
            bone.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        for side in ('R', 'L'):
            mirror = -1 if side == 'R' else 1
            tracked = wrist_paths[side][index]
            baseline = wrist_paths[side][0]
            rise = max(0, baseline.y - tracked.y)
            # Puerta alta: la seña aparece solo con la mano arriba (>65% de
            # su subida maxima), no a medio camino.
            techo = rise_max[side]
            if techo > 1e-6:
                active = max(0, min(1, (rise - .65 * techo) / (.35 * techo)))
            else:
                active = 0.0
            active = active * active * (3 - 2 * active)
            if side == 'L' and sign in RIGHT_ONLY:
                active = 0.0
            forward, normal, shape, thumb_mode, depth = targets(sign, side, t)
            rest = Vector((mirror * .07, -.16, .92))
            target = Vector(((tracked.x - center.x) * (640 / 360) * scale,
                             depth, shoulder_center.z + (center.y - tracked.y) * scale))
            target.x = max(-.38, min(.38, target.x))
            target.z = max(.94, min(1.48, target.z))
            wrist = rest.lerp(target, active)
            upper, lower, hand = [bones[f'J_Bip_{side}_{part}'] for part in ('UpperArm', 'LowerArm', 'Hand')]
            shoulder = upper.head.copy()
            l1 = (lower.bone.head_local - upper.bone.head_local).length
            l2 = (hand.bone.head_local - lower.bone.head_local).length
            displacement = wrist - shoulder
            if displacement.length > l1 + l2 - .015:
                wrist = shoulder + displacement.normalized() * (l1 + l2 - .015)
            pole = Vector((mirror * .28, -.025, 1.05))
            elbow = solve_elbow(shoulder, wrist, l1, l2, pole - shoulder)
            udir, ldir = (elbow - shoulder).normalized(), (wrist - elbow).normalized()
            hinge = udir.cross(ldir).normalized()
            axis = Vector((0, 0, 1 if side == 'R' else -1))
            orient_axes(upper, upper.bone.tail_local - upper.bone.head_local, axis, udir, hinge)
            orient_axes(lower, lower.bone.tail_local - lower.bone.head_local, axis, ldir, hinge)
            max_wrist_error = max(max_wrist_error, (hand.head - wrist).length)
            rest_dir = Vector((-mirror * .7, -.5, -.2))
            orientation = hand_orientation(rest_dir, Vector((0, 0, -1))).slerp(hand_orientation(forward, normal), active)
            forward = orientation @ Vector((1, 0, 0))
            normal = orientation @ Vector((0, 1, 0))
            baseline_normal = -hinge if side == 'R' else hinge
            palm_target = (normal - ldir * normal.dot(ldir)).normalized()
            roll = math.atan2(ldir.dot(baseline_normal.cross(palm_target)), baseline_normal.dot(palm_target))
            roll = max(-math.radians(85), min(math.radians(85), roll))
            lower.matrix = Matrix.Translation(lower.head.copy()) @ (Quaternion(ldir, roll) @ lower.matrix.to_quaternion()).to_matrix().to_4x4()
            bpy.context.view_layer.update()
            angle = ldir.angle(forward)
            forward = Quaternion().slerp(ldir.rotation_difference(forward), min(1, math.radians(40) / max(angle, 1e-6))) @ ldir
            max_bend = max(max_bend, math.degrees(ldir.angle(forward)))
            delta = align_hand(bones, side, forward, normal)
            fwd, palm, own = refs[side]
            bend_axis = fwd.cross(palm).normalized()
            for digit in ('Index', 'Middle', 'Ring', 'Little'):
                cumulative = 0.0
                for seg, flexion in enumerate(finger_angles(shape, digit, t), 1):
                    cumulative += math.radians(flexion) * active
                    bend = Quaternion(bend_axis, cumulative)
                    adduction = .1 if shape == 'spread' else .85
                    direction = own[digit, seg].lerp(fwd, adduction).normalized()
                    aim_roll(bones[f'J_Bip_{side}_{digit}{seg}'], delta @ (bend @ direction), -palm, delta @ (bend @ -palm))
            thumb_rest = own['Thumb', 1].lerp(fwd, .50).normalized()
            thumb_direction = delta @ thumb_rest
            if thumb_mode in {'up', 'down'}:
                thumb_target = Vector((0, 0, 1 if thumb_mode == 'up' else -1))
            elif thumb_mode == 'fold':
                thumb_target = (forward * .25 + Vector((-mirror * .85, 0, -.15))).normalized()
            elif thumb_mode == 'pinch':
                thumb_target = (forward * .55 + (delta @ palm) * .70).normalized()
            elif thumb_mode == 'open':
                thumb_target = delta @ own['Thumb', 1]
            else:
                thumb_target = thumb_direction
            for seg in (1, 2, 3):
                aim_roll(bones[f'J_Bip_{side}_Thumb{seg}'], thumb_direction.lerp(thumb_target, active).normalized(), -palm, -(delta @ palm))
        smoothed.append({name: bones[name].rotation_quaternion.copy().normalized() for name in names})
    # Identical rest at both ends; preserve the full reference gesture between.
    neutral = smoothed[0]
    padded = [neutral.copy() for _ in range(7)]
    for i in range(1, 16):
        u = i / 15
        amount = u * u * (3 - 2 * u)
        padded.append({n: neutral[n].slerp(smoothed[0][n], amount) for n in names})
    padded.extend(smoothed[1:])
    for i in range(1, 16):
        u = i / 15
        amount = u * u * (3 - 2 * u)
        padded.append({n: smoothed[-1][n].slerp(neutral[n], amount) for n in names})
    padded.extend(neutral.copy() for _ in range(7))
    # Shared resampling preserves synchrony of the two hands. Abrupt detections
    # receive intermediate spherical poses rather than a per-bone speed clamp.
    samples = [padded[0]]
    inserted = 0
    for a, b in zip(padded, padded[1:]):
        angle = max(2 * math.acos(min(1, abs(a[n].dot(b[n])))) for n in names)
        steps = max(1, math.ceil(angle / MAX_STEP))
        inserted += steps - 1
        for step in range(1, steps + 1):
            samples.append({n: a[n].slerp(b[n], step / steps) for n in names})
    rig.animation_data_clear()
    rig.data.animation_data_clear()
    # Remove unused historical actions from each newly saved editable.
    for action in list(bpy.data.actions):
        if action.users == 0:
            bpy.data.actions.remove(action)
    action = bpy.data.actions.new(entry['nombre'])
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame, pose in enumerate(samples, 1):
        for name in names:
            bone = rig.pose.bones[name]
            bone.rotation_mode = 'QUATERNION'
            q = pose[name].copy()
            if frame > 1 and samples[frame - 2][name].dot(q) < 0:
                q.negate()
            bone.rotation_quaternion = q
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=name)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = 'LINEAR'
    assert max_wrist_error < 1e-4, max_wrist_error
    assert max_bend < 40.01, max_bend
    scene.frame_start, scene.frame_end = 1, len(samples)
    scene.frame_set(len(samples) // 2)
    out = ROOT / f'web/public/avatar/{sign}.vrma'
    blend = ROOT / f'web/public/Animaciones/{sign}.blend'
    assert bpy.ops.export_scene.vrma(filepath=str(out), armature_object_name=rig.name) == {'FINISHED'}
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.context.preferences.filepaths.save_version = 0
    assert bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True) == {'FINISHED'}
    report = dict(id=sign, nombre=entry['nombre'], estado='Primera versión',
                  source=source['fuente'], source_frames=count, frames=len(samples), fps=FPS,
                  inserted_frames=inserted, rotation_tracks=len(names),
                  max_local_step_limit_deg=14, max_wrist_error_m=max_wrist_error,
                  max_wrist_bend_deg=max_bend, linguistic_validation=False,
                  limitations=['Retargeting inicial: revisar contacto, palmas y dedos en cada seña.',
                               'No reproduce rostro, cabeza ni movimiento del tronco.'],
                  vrma=str(out), blend=str(blend))
    report_path = ROOT / f'data/inspection/cordialidad/{sign}-report.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('CORDIALIDAD_RESULT', sign, len(samples), inserted, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sign', required=True)
    build(parser.parse_args(sys.argv[sys.argv.index('--') + 1:]).sign)
