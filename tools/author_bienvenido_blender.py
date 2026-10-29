"""Author an editable, reference-guided Bienvenido clip, then export VRMA.

Run with Blender --background <working-copy bienvenido.blend> --python this_file.
Uses local LSC-54 Bienvenido references (participants 1, 3, 21, Cordialidad).
This is a manually reconstructed candidate, NOT linguistically validated.
The dataset and the Hola files are not overwritten.

Gesture (two-handed, symmetric welcoming offer):
reposo (manos juntas al frente bajo) -> elevacion -> centro pecho con
palmas enfrentadas -> apertura amplia hacia fuera-abajo-adelante con
palmas hacia arriba (ofrecimiento) -> sostener -> regreso suave.
Fingers extended together throughout; thumbs near index, no fist.
Palms end facing up; no waves, nods or facial motion invented.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build/animaciones/bienvenido-base.vrma"
BLEND = ROOT / "build/animaciones/bienvenido-base.blend"
REPORT = ROOT / "data/inspection/bienvenido-report.json"
FPS = 30
ACTION_NAME = "Bienvenido"

# Solved key frames (1-based). Playback uses these same frames; every frame
# between them is filled by smooth slerp of local quaternions. The palm flip
# up->down on the way back is spread over keys 46..71 to avoid per-frame jumps.
KEY_FRAMES = [1, 7, 15, 22, 30, 38, 46, 54, 61, 71]
KEY_TIMES = [(f - 1) / FPS for f in KEY_FRAMES]
FRAME_COUNT = KEY_FRAMES[-1]


def sym(x, y, z):
    return {"R": Vector((x, y, z)), "L": Vector((-x, y, z))}


# Wrist waypoints per side (Blender world: X=anatomical left, -Y=forward, Z=up).
WRISTS = [
    sym(-0.070, -0.160, 0.920),  # 1  reposo: manos juntas al frente bajo
    sym(-0.070, -0.160, 0.920),  # 7  reposo sostenido
    sym(-0.090, -0.150, 1.100),  # 15 elevacion media
    sym(-0.100, -0.140, 1.240),  # 22 centro pecho, manos proximas
    sym(-0.220, -0.170, 1.100),  # 30 apertura media
    sym(-0.330, -0.170, 1.000),  # 38 apertura maxima (ofrecimiento)
    sym(-0.330, -0.170, 1.000),  # 46 sostener apertura
    sym(-0.260, -0.170, 1.010),  # 54 regreso: apertura parcial, palma arriba
    sym(-0.150, -0.165, 0.970),  # 61 pre-reposo cercano, palma medial
    sym(-0.070, -0.160, 0.920),  # 71 reposo
]

# Elbow hints per side (pole targets, keep elbows down/out, no flips).
ELBOWS = [
    sym(-0.170, 0.000, 1.050),
    sym(-0.170, 0.000, 1.050),
    sym(-0.220, -0.020, 1.020),
    sym(-0.240, -0.020, 1.080),
    sym(-0.280, -0.030, 1.000),
    sym(-0.300, -0.020, 0.950),
    sym(-0.300, -0.020, 0.950),
    sym(-0.280, -0.020, 0.980),
    sym(-0.220, -0.010, 1.010),
    sym(-0.170, 0.000, 1.050),
]

# Finger (hand-fore) directions per side, per key.
DIRS = [
    {"R": Vector((0.70, -0.50, -0.20)).normalized(), "L": Vector((-0.70, -0.50, -0.20)).normalized()},
    {"R": Vector((0.70, -0.50, -0.20)).normalized(), "L": Vector((-0.70, -0.50, -0.20)).normalized()},
    {"R": Vector((-0.15, -0.50, 0.85)).normalized(), "L": Vector((0.15, -0.50, 0.85)).normalized()},
    {"R": Vector((0.00, -0.35, 0.94)).normalized(), "L": Vector((0.00, -0.35, 0.94)).normalized()},
    {"R": Vector((-0.45, -0.60, 0.65)).normalized(), "L": Vector((0.45, -0.60, 0.65)).normalized()},
    {"R": Vector((-0.55, -0.75, 0.25)).normalized(), "L": Vector((0.55, -0.75, 0.25)).normalized()},
    {"R": Vector((-0.55, -0.75, 0.25)).normalized(), "L": Vector((0.55, -0.75, 0.25)).normalized()},
    {"R": Vector((-0.45, -0.70, 0.30)).normalized(), "L": Vector((0.45, -0.70, 0.30)).normalized()},
    {"R": Vector((0.30, -0.85, -0.20)).normalized(), "L": Vector((-0.30, -0.85, -0.20)).normalized()},
    {"R": Vector((0.70, -0.50, -0.20)).normalized(), "L": Vector((-0.70, -0.50, -0.20)).normalized()},
]

# Palm normals per side, per key.
NORMALS = [
    {"R": Vector((0.0, 0.0, -1.0)).normalized(), "L": Vector((0.0, 0.0, -1.0)).normalized()},
    {"R": Vector((0.0, 0.0, -1.0)).normalized(), "L": Vector((0.0, 0.0, -1.0)).normalized()},
    {"R": Vector((1.0, 0.0, 0.10)).normalized(), "L": Vector((-1.0, 0.0, 0.10)).normalized()},
    {"R": Vector((1.0, 0.0, 0.0)).normalized(), "L": Vector((-1.0, 0.0, 0.0)).normalized()},
    {"R": Vector((0.30, -0.20, 0.93)).normalized(), "L": Vector((-0.30, -0.20, 0.93)).normalized()},
    {"R": Vector((0.0, -0.25, 0.97)).normalized(), "L": Vector((0.0, -0.25, 0.97)).normalized()},
    {"R": Vector((0.0, -0.25, 0.97)).normalized(), "L": Vector((0.0, -0.25, 0.97)).normalized()},
    {"R": Vector((0.55, -0.15, 0.82)).normalized(), "L": Vector((-0.55, -0.15, 0.82)).normalized()},
    {"R": Vector((0.95, 0.0, -0.30)).normalized(), "L": Vector((-0.95, 0.0, -0.30)).normalized()},
    {"R": Vector((0.0, 0.0, -1.0)).normalized(), "L": Vector((0.0, 0.0, -1.0)).normalized()},
]


def solve_elbow(shoulder, wrist, upper_length, lower_length, pole):
    delta = wrist - shoulder
    distance = delta.length
    if not abs(upper_length - lower_length) + 1e-5 < distance < upper_length + lower_length - 1e-5:
        raise ValueError(f"Unreachable wrist: {distance}")
    axis = delta.normalized()
    along = (upper_length ** 2 - lower_length ** 2 + distance ** 2) / (2 * distance)
    radius = math.sqrt(max(0, upper_length ** 2 - along ** 2))
    outward = pole - axis * pole.dot(axis)
    if outward.length < 1e-6:
        raise ValueError("Degenerate elbow pole")
    return shoulder + axis * along + outward.normalized() * radius


def aim(bone, target_direction, reference_direction=None):
    origin = bone.head.copy()
    rest = bone.bone.matrix_local.to_quaternion()
    direction = reference_direction or (bone.bone.tail_local - bone.bone.head_local)
    rotation = direction.normalized().rotation_difference(target_direction.normalized()) @ rest
    bone.matrix = Matrix.Translation(origin) @ rotation.to_matrix().to_4x4()
    bpy.context.view_layer.update()


def align_hand(bones, side, direction, normal):
    hand = bones[f"J_Bip_{side}_Hand"]
    rest_hand = hand.bone.head_local
    rest_fwd = (bones[f"J_Bip_{side}_Middle1"].bone.head_local - rest_hand).normalized()
    rest_across = bones[f"J_Bip_{side}_Index1"].bone.head_local - bones[f"J_Bip_{side}_Little1"].bone.head_local
    rest_n = rest_fwd.cross(rest_across).normalized()
    if side == "R":
        rest_n.negate()
    rest_n = (rest_n - rest_fwd * rest_n.dot(rest_fwd)).normalized()
    fwd = direction.normalized()
    n = (normal - fwd * normal.dot(fwd)).normalized()
    a = Matrix((rest_fwd, rest_n, rest_fwd.cross(rest_n))).transposed()
    b = Matrix((fwd, n, fwd.cross(n))).transposed()
    rotation_delta = b @ a.transposed()
    rotation = rotation_delta.to_quaternion() @ hand.bone.matrix_local.to_quaternion()
    hand.matrix = Matrix.Translation(hand.head.copy()) @ rotation.to_matrix().to_4x4()
    bpy.context.view_layer.update()
    return rotation_delta


def target_at(t, keys):
    def slope(k, axis):
        if k == 0 or k == len(keys) - 1:
            return 0.0
        a, b, c = keys[k - 1:k + 2]
        h0, h1 = b[0] - a[0], c[0] - b[0]
        d0, d1 = (b[1][axis] - a[1][axis]) / h0, (c[1][axis] - b[1][axis]) / h1
        if d0 * d1 <= 0:
            return 0.0
        w0, w1 = 2 * h1 + h0, h1 + 2 * h0
        return (w0 + w1) / (w0 / d0 + w1 / d1)
    for k, (a, b) in enumerate(zip(keys, keys[1:])):
        if t <= b[0]:
            h = b[0] - a[0]
            u = max(0, min(1, (t - a[0]) / h))
            h00, h10 = 2 * u ** 3 - 3 * u * u + 1, u ** 3 - 2 * u * u + u
            h01, h11 = -2 * u ** 3 + 3 * u * u, u ** 3 - u * u
            return Vector(tuple(h00 * a[1][j] + h10 * h * slope(k, j) + h01 * b[1][j] + h11 * h * slope(k + 1, j) for j in range(3)))
    return keys[-1][1].copy()


def orient_axes(bone, rest_direction, rest_normal, direction, normal):
    r = rest_direction.normalized()
    rn = (rest_normal - r * rest_normal.dot(r)).normalized()
    d = direction.normalized()
    n = (normal - d * normal.dot(d)).normalized()
    a = Matrix((r, rn, r.cross(rn))).transposed()
    b = Matrix((d, n, d.cross(n))).transposed()
    rotation = (b @ a.transposed()).to_quaternion() @ bone.bone.matrix_local.to_quaternion()
    bone.matrix = Matrix.Translation(bone.head.copy()) @ rotation.to_matrix().to_4x4()
    bpy.context.view_layer.update()


def bounded_direction(forearm, salute, weight):
    base = forearm.normalized()
    angle = base.angle(salute)
    fraction = min(weight, math.radians(25) / max(angle, 1e-6))
    return Quaternion().slerp(base.rotation_difference(salute), fraction) @ base


def main():
    bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.vrm")
    rig = bpy.data.objects.get("Armature")
    if not rig or rig.type != "ARMATURE":
        raise ValueError("Expected the already imported Armature")
    bpy.context.view_layer.objects.active = rig
    if rig.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(True)
    rig.animation_data_clear()
    rig.data.animation_data_clear()
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1
    scene.frame_start = 1
    scene.frame_end = FRAME_COUNT
    bones = rig.pose.bones
    measured = []
    all_quaternions = {}
    pose_samples = {}
    names = []
    for side in ("R", "L"):
        names.extend(f"J_Bip_{side}_{name}" for name in ("UpperArm", "LowerArm", "Hand"))
        names.extend(f"J_Bip_{side}_{digit}{seg}" for digit in ("Thumb", "Index", "Middle", "Ring", "Little") for seg in (1, 2, 3))
    for old in [a for a in bpy.data.actions if a.name == ACTION_NAME]:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(ACTION_NAME)
    rig.animation_data_create()
    rig.animation_data.action = action

    wrist_keys = {s: list(zip(KEY_TIMES, [w[s] for w in WRISTS])) for s in ("R", "L")}
    elbow_keys = {s: list(zip(KEY_TIMES, [e[s] for e in ELBOWS])) for s in ("R", "L")}

    # Envelope: both hands articulate together; gesture weight peaks at full opening.
    def weight_at(t):
        open_w = 1.0 / (1.0 + math.exp(-8.0 * (t - 0.55)))
        close_w = 1.0 / (1.0 + math.exp(8.0 * (t - 1.55)))
        return min(open_w + 0.15, 1.0) * close_w + 0.05

    for ki, frame in enumerate(KEY_FRAMES):
        scene.frame_set(frame)
        for bone in bones:
            bone.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        t = (frame - 1) / FPS
        for side in ("R", "L"):
            upper = bones[f"J_Bip_{side}_UpperArm"]
            lower = bones[f"J_Bip_{side}_LowerArm"]
            shoulder = upper.head.copy()
            l1 = (lower.bone.head_local - upper.bone.head_local).length
            l2 = (bones[f"J_Bip_{side}_Hand"].bone.head_local - lower.bone.head_local).length
            wrist = target_at(t, wrist_keys[side])
            hint = target_at(t, elbow_keys[side])
            elbow = solve_elbow(shoulder, wrist, l1, l2, hint - shoulder)
            udir = (elbow - shoulder).normalized()
            ldir = (wrist - elbow).normalized()
            hinge = udir.cross(ldir).normalized()
            rest_axis = Vector((0, 0, 1 if side == "R" else -1))
            orient_axes(upper, upper.bone.tail_local - upper.bone.head_local, rest_axis, udir, hinge)
            orient_axes(lower, lower.bone.tail_local - lower.bone.head_local, rest_axis, ldir, hinge)
            measured.append((bones[f"J_Bip_{side}_Hand"].head - wrist).length)
            salute = DIRS[ki][side]
            normal = NORMALS[ki][side]
            direction = bounded_direction(ldir, salute, 1.0)
            baseline = -hinge if side == "R" else hinge
            target = (normal - ldir * normal.dot(ldir)).normalized()
            roll = math.atan2(ldir.dot(baseline.cross(target)), baseline.dot(target))
            roll = max(-math.radians(85), min(math.radians(85), roll))
            twist = Quaternion(ldir, roll)
            rotated = twist @ lower.matrix.to_quaternion()
            lower.matrix = Matrix.Translation(lower.head.copy()) @ rotated.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            delta = align_hand(bones, side, direction, normal)
            rest_forward = (bones[f"J_Bip_{side}_Middle1"].bone.tail_local - bones[f"J_Bip_{side}_Middle1"].bone.head_local).normalized()
            for digit in ("Index", "Middle", "Ring", "Little"):
                for seg in (1, 2, 3):
                    bone = bones[f"J_Bip_{side}_{digit}{seg}"]
                    own = (bone.bone.tail_local - bone.bone.head_local).normalized()
                    if seg == 1:
                        desired = own.lerp(rest_forward, 0.80).normalized()
                    else:
                        desired = rest_forward
                    aim(bone, delta @ desired)
            thumb = bones[f"J_Bip_{side}_Thumb1"]
            thumb_dir = (thumb.bone.tail_local - thumb.bone.head_local).normalized()
            desired = thumb_dir.lerp(rest_forward, 0.55).normalized()
            for seg in (1, 2, 3):
                aim(bones[f"J_Bip_{side}_Thumb{seg}"], delta @ desired)
        for name in names:
            q = bones[name].rotation_quaternion.copy().normalized()
            previous = all_quaternions.get(name)
            if previous and previous.dot(q) < 0:
                q.negate()
            bones[name].rotation_quaternion = q
            all_quaternions[name] = q.copy()
            bones[name].keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
        pose_samples[frame] = {name: bones[name].rotation_quaternion.copy() for name in names}

    # Fill every frame by smooth local interpolation between solved poses.
    for frame in range(1, FRAME_COUNT + 1):
        if frame in pose_samples:
            continue
        left = max(f for f in KEY_FRAMES if f <= frame)
        right = min(f for f in KEY_FRAMES if f >= frame)
        u = 0.0 if left == right else (frame - left) / (right - left)
        u = u * u * (3 - 2 * u)
        for name in names:
            q = pose_samples[left][name].slerp(pose_samples[right][name], u)
            bones[name].rotation_quaternion = q
            bones[name].keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
    scene.frame_set(38)
    bpy.context.view_layer.update()
    curves = [c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    max_err = max(measured)
    assert max_err < 1e-4, f"Wrist placement error {max_err}"
    assert len(curves) == len(names) * 4
    assert all(len(c.keyframe_points) == FRAME_COUNT for c in curves)

    # Geometric sanity: no abrupt arm steps, limited wrist bend/twist.
    import math as _m
    from mathutils import Vector as _V
    max_step = 0.0
    max_bend = 0.0
    max_twist = 0.0
    previous = {}
    rest_forward_R = (rig.data.bones["J_Bip_R_Middle1"].head_local - rig.data.bones["J_Bip_R_Hand"].head_local).normalized()
    rest_across_R = rig.data.bones["J_Bip_R_Index1"].head_local - rig.data.bones["J_Bip_R_Little1"].head_local
    rest_palm_R = -rest_forward_R.cross(rest_across_R).normalized()
    rest_forward_L = (rig.data.bones["J_Bip_L_Middle1"].head_local - rig.data.bones["J_Bip_L_Hand"].head_local).normalized()
    rest_across_L = rig.data.bones["J_Bip_L_Index1"].head_local - rig.data.bones["J_Bip_L_Little1"].head_local
    rest_palm_L = rest_forward_L.cross(rest_across_L).normalized()
    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in ("J_Bip_R_UpperArm", "J_Bip_R_LowerArm", "J_Bip_R_Hand",
                     "J_Bip_L_UpperArm", "J_Bip_L_LowerArm", "J_Bip_L_Hand"):
            q = bones[name].matrix.to_quaternion()
            if name in previous:
                angle = 2 * _m.acos(min(1, abs(q.dot(previous[name]))))
                if _m.degrees(angle) > 20:
                    print("STEP_OUTLIER", frame, name, round(_m.degrees(angle), 1))
                max_step = max(max_step, _m.degrees(angle))
            previous[name] = q.copy()
        for side in ("R", "L"):
            forearm = (bones[f"J_Bip_{side}_Hand"].head - bones[f"J_Bip_{side}_LowerArm"].head).normalized()
            fingers = (bones[f"J_Bip_{side}_Middle1"].head - bones[f"J_Bip_{side}_Hand"].head).normalized()
            max_bend = max(max_bend, _m.degrees(forearm.angle(fingers)))
            lower = bones[f"J_Bip_{side}_LowerArm"]
            rest_palm = rest_palm_R if side == "R" else rest_palm_L
            transported = (lower.matrix.to_quaternion() @ lower.bone.matrix_local.to_quaternion().inverted()) @ rest_palm
            across = bones[f"J_Bip_{side}_Index1"].head - bones[f"J_Bip_{side}_Little1"].head
            actual = (-fingers.cross(across) if side == "R" else fingers.cross(across)).normalized()
            ref = (transported - forearm * transported.dot(forearm)).normalized()
            obs = (actual - forearm * actual.dot(forearm)).normalized()
            twist = _m.degrees(_m.atan2(forearm.dot(ref.cross(obs)), ref.dot(obs)))
            max_twist = max(max_twist, abs(twist))
    print("BIENVENIDO_CHECKS", max_step, max_bend, max_twist)
    assert max_step < 20, "Abrupt arm/hand orientation between adjacent frames"
    assert max_bend < 32, "Excessive wrist bend"
    assert max_twist < 45, "Excessive axial wrist twist relative to forearm reference"

    scene.frame_set(38)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.vrma(filepath=str(OUT), armature_object_name=rig.name)
    assert result == {"FINISHED"}, result
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "reference": [
            "LSC-54/RawVideos/Videos Courtesy/1/Cordialidad/Bienvenido/0.avi",
            "LSC-54/RawVideos/Videos Courtesy/3/Cordialidad/Bienvenido/1.avi",
            "LSC-54/RawVideos/Videos Courtesy/21/Cordialidad/Bienvenido/0.avi",
        ],
        "method": "Reference-guided authored IK key poses (both hands); anatomical palm orientation; local quaternion interpolation",
        "source_frames": [40, 49, 64], "source_fps": 30,
        "output_frames": FRAME_COUNT, "output_fps": FPS,
        "key_frames": KEY_FRAMES,
        "max_anchor_wrist_error_m": max_err,
        "rotation_curves": len(curves),
        "max_world_step_deg": max_step, "max_wrist_bend_deg": max_bend,
        "max_wrist_twist_proxy_deg": max_twist,
        "two_handed": True, "linguistically_validated": False,
        "blend": str(BLEND), "vrma": str(OUT),
    }, indent=2), encoding="utf-8")
    print("BIENVENIDO_RESULT", REPORT.read_text())


if __name__ == "__main__":
    main()
