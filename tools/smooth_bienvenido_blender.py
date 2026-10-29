"""Smooth the existing Bienvenido poses, preserving the user's source .blend.

Run Blender --background bienvenido.blend --python this_file.
Spherical cubic Bezier segments share angular tangents at passing poses.
The duplicated opening hold is replaced by a continuous turnaround.
"""
import json
import math
import runpy
from pathlib import Path
import bpy
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
ANCHORS = [1, 7, 15, 22, 30, 38, 54, 61, 71]


def cubic_rotation(a, b, va, vb, duration, u):
    c1 = a @ Quaternion(va * (duration / 3))
    c2 = b @ Quaternion(-vb * (duration / 3))
    p, q, r = a.slerp(c1, u), c1.slerp(c2, u), c2.slerp(b, u)
    return p.slerp(q, u).slerp(q.slerp(r, u), u).normalized()


def main():
    bpy.ops.preferences.addon_enable(module='bl_ext.blender_org.vrm')
    rig = bpy.data.objects['Armature']
    scene = bpy.context.scene
    original = rig.animation_data.action
    curves = [c for layer in original.layers for strip in layer.strips
              for bag in strip.channelbags for c in bag.fcurves]
    names = sorted({c.data_path.split('"')[1] for c in curves
                    if c.data_path.endswith('rotation_quaternion')})
    poses = {}
    for frame in ANCHORS:
        scene.frame_set(frame)
        poses[frame] = {n: rig.pose.bones[n].rotation_quaternion.copy().normalized()
                        for n in names}
    for name in names:
        for a, b in zip(ANCHORS, ANCHORS[1:]):
            if poses[a][name].dot(poses[b][name]) < 0:
                poses[b][name].negate()

    velocities = {}
    for i, frame in enumerate(ANCHORS):
        velocities[frame] = {}
        for name in names:
            v = Vector((0, 0, 0))
            if i not in (0, 1, len(ANCHORS) - 1):
                a, b = ANCHORS[i - 1], ANCHORS[i + 1]
                center = poses[frame][name]
                incoming = -(center.inverted() @ poses[a][name]).to_exponential_map() / (frame - a)
                outgoing = (center.inverted() @ poses[b][name]).to_exponential_map() / (b - frame)
                # Average vector velocities even around a curved path: opposing
                # components do not mean the entire joint should stop.
                v = (incoming * (b - frame) + outgoing * (frame - a)) / (b - a)
                limit = 2 * min(incoming.length, outgoing.length)
                if v.length > limit:
                    v = v.normalized() * limit
            velocities[frame][name] = v

    action = bpy.data.actions.new('Bienvenido_fluido')
    rig.animation_data.action = action
    for frame in range(1, 72):
        i = next((i for i, b in enumerate(ANCHORS[1:]) if frame <= b), len(ANCHORS) - 2)
        a, b = ANCHORS[i:i + 2]
        for name in names:
            q = cubic_rotation(poses[a][name], poses[b][name],
                               velocities[a][name], velocities[b][name],
                               b - a, (frame - a) / (b - a))
            bone = rig.pose.bones[name]
            bone.rotation_mode = 'QUATERNION'
            bone.rotation_quaternion = q
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=name)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'
    scene.frame_start, scene.frame_end = 1, 71
    runpy.run_path(str(ROOT / 'tools/check_bienvenido_flow.py'))

    max_anchor_error = 0.0
    max_step, max_bend = 0.0, 0.0
    previous = {}
    for frame in range(1, 72):
        scene.frame_set(frame)
        for name in names:
            bone = rig.pose.bones[name]
            assert abs(bone.rotation_quaternion.magnitude - 1) < 1e-5
            if frame in poses:
                max_anchor_error = max(max_anchor_error,
                    1 - abs(bone.rotation_quaternion.dot(poses[frame][name])))
            if name.endswith(('UpperArm', 'LowerArm', 'Hand')):
                q = bone.matrix.to_quaternion().normalized()
                if name in previous:
                    max_step = max(max_step, math.degrees(2 * math.acos(min(1, abs(q.dot(previous[name]))))))
                previous[name] = q
        for side in ('R', 'L'):
            bones = rig.pose.bones
            wrist = bones[f'J_Bip_{side}_Hand'].head
            forearm = wrist - bones[f'J_Bip_{side}_LowerArm'].head
            fingers = bones[f'J_Bip_{side}_Middle1'].head - wrist
            max_bend = max(max_bend, math.degrees(forearm.angle(fingers)))
    assert max_anchor_error < 1e-5, max_anchor_error
    assert max_step < 20, max_step
    assert max_bend < 32, max_bend
    scene.frame_set(38)
    out = ROOT / 'build/animaciones/bienvenido-fluido.vrma'
    blend = ROOT / 'build/animaciones/bienvenido-fluido.blend'
    out.parent.mkdir(parents=True, exist_ok=True)
    assert bpy.ops.export_scene.vrma(filepath=str(out), armature_object_name=rig.name) == {'FINISHED'}
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report = dict(source='bienvenido.blend / Bienvenido', anchors=ANCHORS,
                  method='Time-aware spherical cubic Bezier, shared angular tangents; no duplicated opening hold',
                  frames=71, fps=scene.render.fps, max_world_step_deg=max_step,
                  max_wrist_bend_deg=max_bend, max_anchor_quaternion_error=max_anchor_error,
                  linguistically_validated=False)
    (ROOT / 'data/inspection').mkdir(parents=True, exist_ok=True)
    (ROOT / 'data/inspection/bienvenido-fluido-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('SMOOTH_RESULT', json.dumps(report))


if __name__ == '__main__':
    main()
