"""Author an editable, reference-guided Ayudar clip, then export VRMA.

Run with Blender --background <working-copy ayuda.blend> --python this_file.
Uses local LSC-54 Cordialidad/Ayudar references (18 participants, 54 videos;
observed in detail: 1, 3, 21, 22, 26, 30). This is a manually reconstructed
candidate, NOT linguistically validated. The dataset and the Hola, Bienvenido
and Apoyar files are not overwritten.

Gesture (right-dominant fist on open left palm):
rest (hands low, relaxed) -> right fist with thumb up rises while the left
hand opens below -> fist lands on the flat left palm (palm up) at chest
height -> both extend forward together (push) with contact held -> hold ->
retract, separate and lower -> rest.
No waves, nods or facial motion invented.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/avatar/ayuda.vrma"
BLEND = ROOT / "web/public/Animaciones/ayuda.blend"
REPORT = ROOT / "data/inspection/ayuda-report.json"
FPS = 30
ACTION_NAME = "Ayudar"

# Solved key frames (1-based). Every in-between frame is filled by smooth
# spherical cubic interpolation of local quaternions.
KEY_FRAMES = [1, 9, 15, 21, 27, 34, 42, 50, 58, 66, 75]
KEY_TIMES = [(f - 1) / FPS for f in KEY_FRAMES]
FRAME_COUNT = KEY_FRAMES[-1]  # 75 frames at 30 fps (2.47 s)


def mk(rx, ry, rz, lx, ly, lz):
    return {"R": Vector((rx, ry, rz)), "L": Vector((lx, ly, lz))}


def vmk(rx, ry, rz, lx, ly, lz):
    return {"R": Vector((rx, ry, rz)).normalized(),
            "L": Vector((lx, ly, lz)).normalized()}


# Wrist waypoints per key (Blender world: X=anatomical left, -Y=forward, Z=up).
WRISTS = [
    mk(-0.070, -0.160, 0.920, 0.070, -0.160, 0.920),  # 1  rest
    mk(-0.070, -0.160, 0.920, 0.070, -0.160, 0.920),  # 9  rest hold
    mk(-0.060, -0.165, 1.000, 0.070, -0.160, 0.940),  # 15 rise begins
    mk(-0.045, -0.175, 1.100, 0.050, -0.180, 0.980),  # 21 hands rise
    mk(-0.030, -0.180, 1.160, 0.030, -0.190, 1.020),  # 27 right at chest, left rising
    mk(-0.020, -0.180, 1.130, 0.000, -0.200, 1.100),  # 34 CONTACT: fist on palm
    mk(-0.020, -0.300, 1.100, 0.000, -0.320, 1.070),  # 42 PUSH: both extend forward
    mk(-0.020, -0.300, 1.100, 0.000, -0.320, 1.070),  # 50 hold push
    mk(-0.020, -0.180, 1.130, 0.000, -0.200, 1.100),  # 58 retract to contact
    mk(-0.050, -0.175, 1.060, 0.035, -0.185, 1.005),  # 66 lowering
    mk(-0.070, -0.160, 0.920, 0.070, -0.160, 0.920),  # 75 rest
]

# Elbow hints per key (pole targets, keep elbows down/out, no flips).
ELBOWS = [
    mk(-0.170, 0.000, 1.050, 0.170, 0.000, 1.050),
    mk(-0.170, 0.000, 1.050, 0.170, 0.000, 1.050),
    mk(-0.200, -0.010, 1.040, 0.170, 0.000, 1.030),
    mk(-0.220, -0.020, 1.060, 0.190, -0.015, 1.020),
    mk(-0.230, -0.020, 1.080, 0.210, -0.020, 1.020),
    mk(-0.230, -0.020, 1.060, 0.210, -0.020, 1.020),
    mk(-0.250, -0.060, 0.980, 0.250, -0.060, 0.980),
    mk(-0.250, -0.060, 0.980, 0.250, -0.060, 0.980),
    mk(-0.230, -0.020, 1.060, 0.210, -0.020, 1.020),
    mk(-0.210, -0.020, 1.030, 0.200, -0.015, 1.020),
    mk(-0.170, 0.000, 1.050, 0.170, 0.000, 1.050),
]

# Hand-forward (knuckle) directions per key.
DIRS = [
    vmk(0.70, -0.50, -0.20, -0.70, -0.50, -0.20),
    vmk(0.70, -0.50, -0.20, -0.70, -0.50, -0.20),
    vmk(0.30, -0.75, 0.15, -0.55, -0.65, -0.10),
    vmk(0.00, -0.90, 0.30, -0.35, -0.85, 0.10),
    vmk(-0.05, -0.95, 0.10, -0.10, -0.93, 0.15),
    vmk(-0.15, -0.80, 0.55, 0.00, -0.97, 0.10),
    vmk(-0.15, -0.80, 0.55, 0.00, -0.97, 0.10),
    vmk(-0.15, -0.80, 0.55, 0.00, -0.97, 0.10),
    vmk(-0.15, -0.80, 0.55, 0.00, -0.97, 0.10),
    vmk(0.20, -0.87, -0.05, -0.30, -0.85, 0.00),
    vmk(0.70, -0.50, -0.20, -0.70, -0.50, -0.20),
]

# Palm normals per key (fists face medially while stacked).
NORMALS = [
    vmk(0.0, 0.0, -1.0, 0.0, 0.0, -1.0),
    vmk(0.0, 0.0, -1.0, 0.0, 0.0, -1.0),
    vmk(0.5, 0.0, -0.85, -0.87, 0.0, -0.50),
    vmk(0.95, 0.0, -0.25, -0.87, 0.0, 0.50),
    vmk(1.0, 0.0, 0.00, 0.0, -0.05, 0.99),
    vmk(0.88, -0.45, -0.12, 0.0, -0.15, 0.99),
    vmk(0.88, -0.45, -0.12, 0.0, -0.15, 0.99),
    vmk(0.88, -0.45, -0.12, 0.0, -0.15, 0.99),
    vmk(0.88, -0.45, -0.12, 0.0, -0.15, 0.99),
    vmk(0.7, -0.25, -0.65, -1.0, 0.0, 0.0),
    vmk(0.0, 0.0, -1.0, 0.0, 0.0, -1.0),
]

# Right fist closure per key (0 = relaxed, 1 = closed fist + thumb up).
# The left hand stays a flat open platform (palm up) the whole time.
FIST_R = [0.0, 0.0, 0.2, 0.55, 0.9, 1.0, 1.0, 1.0, 1.0, 0.45, 0.0]
SIDE_MODE = {"R": "fist", "L": "flat"}

# Finger curls: absolute knuckle angle + chain-relative folds, in degrees.
# Relaxed -> closed fist. Chain-relative folds avoid the shortest-arc flip
# that absolute >180 deg targets would cause in aim().
# Spread is mostly removed as the fist closes; each finger keeps its
# own slight curl so the fist reads as a hand, not a mannequin.
OPEN_CURL = (8.0, 6.0, 6.0)
FIST_CURL = (65.0, 85.0, 45.0)
FINGER_CURL_SCALE = {'Index': 0.94, 'Middle': 1.00, 'Ring': 1.03, 'Little': 1.06}


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

    # Rest-frame references for finger curls (constant for the rig).
    rest_fwd = {}
    rest_palm = {}
    own_dir = {}
    for side in ("R", "L"):
        rest_fwd[side] = (bones[f"J_Bip_{side}_Middle1"].bone.tail_local - bones[f"J_Bip_{side}_Middle1"].bone.head_local).normalized()
        across = bones[f"J_Bip_{side}_Index1"].bone.head_local - bones[f"J_Bip_{side}_Little1"].bone.head_local
        n = rest_fwd[side].cross(across).normalized()
        if side == "R":
            n.negate()
        rest_palm[side] = (n - rest_fwd[side] * n.dot(rest_fwd[side])).normalized()
        for digit in ("Index", "Middle", "Ring", "Little", "Thumb"):
            for seg in (1, 2, 3):
                b = bones[f"J_Bip_{side}_{digit}{seg}"]
                own_dir[(side, digit, seg)] = (b.bone.tail_local - b.bone.head_local).normalized()

    wrist_keys = {s: list(zip(KEY_TIMES, [w[s] for w in WRISTS])) for s in ("R", "L")}
    elbow_keys = {s: list(zip(KEY_TIMES, [e[s] for e in ELBOWS])) for s in ("R", "L")}

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
            if SIDE_MODE[side] == "fist":
                fa = FIST_R[ki]
                # Flex each joint around its rest-space hinge. Inherit parent
                # roll instead of re-aiming nail normals in world space (which
                # flips the axial roll by 180 degrees past a right-angle curl).
                for digit in ("Index", "Middle", "Ring", "Little"):
                    for seg in (1, 2, 3):
                        bone = bones[f"J_Bip_{side}_{digit}{seg}"]
                        forward = own_dir[(side, digit, seg)]
                        hinge = forward.cross(rest_palm[side]).normalized()
                        local_hinge = bone.bone.matrix_local.to_quaternion().inverted() @ hinge
                        angle = math.radians((OPEN_CURL[seg - 1] +
                                (FIST_CURL[seg - 1] - OPEN_CURL[seg - 1]) * fa)
                                * FINGER_CURL_SCALE[digit])
                        bone.rotation_quaternion = Quaternion(local_hinge, angle)
                # Author the thumb in the hand's anatomical frame. The rest
                # metacarpal already forms the thenar eminence; retain it rather
                # than forcing the entire chain to world-up or the index joint.
                # Mild abduction gives an extended, diagonal thumb with no sharp
                # bend at the MCP and no compression of the thumb web.
                thumb = bones[f"J_Bip_{side}_Thumb1"]
                across = (bones[f"J_Bip_{side}_Index1"].bone.head_local -
                          bones[f"J_Bip_{side}_Little1"].bone.head_local).normalized()
                rest_thumb = own_dir[(side, "Thumb", 1)]
                desired = (rest_thumb * 0.82 + across * 0.18).normalized()
                swing = Quaternion().slerp(rest_thumb.rotation_difference(desired), fa)
                rest_rotation = thumb.bone.matrix_local.to_quaternion()
                thumb.rotation_quaternion = rest_rotation.inverted() @ swing @ rest_rotation
                for seg, degrees in ((2, 5), (3, 12)):
                    bone = bones[f"J_Bip_{side}_Thumb{seg}"]
                    axis = own_dir[(side, "Thumb", seg)].cross(rest_palm[side]).normalized()
                    local_axis = bone.bone.matrix_local.to_quaternion().inverted() @ axis
                    bone.rotation_quaternion = Quaternion(local_axis, math.radians(degrees * fa))
                bpy.context.view_layer.update()
            else:
                # Keep the platform hand open. Rotate only the base of
                # each finger to remove spread; distal joints inherit the
                # parent's roll and retain the rig's natural straight shape.
                for digit in ("Index", "Middle", "Ring", "Little"):
                    bone = bones[f"J_Bip_{side}_{digit}1"]
                    own = own_dir[(side, digit, 1)]
                    desired = own.lerp(rest_fwd[side], 0.80).normalized()
                    rest_rotation = bone.bone.matrix_local.to_quaternion()
                    swing = own.rotation_difference(desired)
                    bone.rotation_quaternion = rest_rotation.inverted() @ swing @ rest_rotation
                    for seg in (2, 3):
                        bones[f"J_Bip_{side}_{digit}{seg}"].rotation_quaternion = Quaternion()
                thumb = bones[f"J_Bip_{side}_Thumb1"]
                own = own_dir[(side, "Thumb", 1)]
                desired = (own * 0.82 + rest_fwd[side] * 0.18).normalized()
                rest_rotation = thumb.bone.matrix_local.to_quaternion()
                thumb.rotation_quaternion = rest_rotation.inverted() @ own.rotation_difference(desired) @ rest_rotation
                for seg in (2, 3):
                    bones[f"J_Bip_{side}_Thumb{seg}"].rotation_quaternion = Quaternion()
                bpy.context.view_layer.update()
        for name in names:
            q = bones[name].rotation_quaternion.copy().normalized()
            previous = all_quaternions.get(name)
            if previous and previous.dot(q) < 0:
                q.negate()
            bones[name].rotation_quaternion = q
            all_quaternions[name] = q.copy()
            bones[name].keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
        pose_samples[frame] = {name: bones[name].rotation_quaternion.copy() for name in names}

    # Shared angular tangents avoid braking at each passing key. Repeated
    # rest/stack poses get zero tangents, preserving deliberate holds.
    velocities = {}
    for i, frame in enumerate(KEY_FRAMES):
        velocities[frame] = {}
        for name in names:
            v = Vector((0, 0, 0))
            if 0 < i < len(KEY_FRAMES) - 1:
                a, b = KEY_FRAMES[i - 1], KEY_FRAMES[i + 1]
                center = pose_samples[frame][name]
                incoming = -(center.inverted() @ pose_samples[a][name]).to_exponential_map() / (frame - a)
                outgoing = (center.inverted() @ pose_samples[b][name]).to_exponential_map() / (b - frame)
                v = (incoming * (b - frame) + outgoing * (frame - a)) / (b - a)
                # Preserve exact static holds without limiting a passing
                # tangent to the slower neighbouring segment.
                if min(incoming.length, outgoing.length) < 1e-7:
                    v = Vector((0, 0, 0))
                limit = incoming.length + outgoing.length
                if v.length > limit:
                    v = v.normalized() * limit
            velocities[frame][name] = v
    for frame in range(1, FRAME_COUNT + 1):
        i = next(i for i, end in enumerate(KEY_FRAMES[1:]) if frame <= end)
        left, right = KEY_FRAMES[i:i + 2]
        duration = right - left
        u = (frame - left) / duration
        for name in names:
            a, b = pose_samples[left][name], pose_samples[right][name]
            c1 = a @ Quaternion(velocities[left][name] * (duration / 3))
            c2 = b @ Quaternion(-velocities[right][name] * (duration / 3))
            p, q, r = a.slerp(c1, u), c1.slerp(c2, u), c2.slerp(b, u)
            rotation = p.slerp(q, u).slerp(q.slerp(r, u), u).normalized()
            bones[name].rotation_quaternion = rotation
            bones[name].keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
    scene.frame_set(39)
    bpy.context.view_layer.update()
    curves = [c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    max_err = max(measured)
    assert max_err < 1e-4, f"Wrist placement error {max_err}"
    assert len(curves) == len(names) * 4
    assert all(len(c.keyframe_points) == FRAME_COUNT for c in curves)

    # Geometric sanity: no abrupt arm steps; wrist bend measured on the hand
    # back (finger curl must not count as wrist bend); limited axial twist.
    import math as _m
    max_step = 0.0
    max_bend = 0.0
    max_twist = 0.0
    previous = {}
    hand_local_fwd = {}
    for side in ("R", "L"):
        q_rest = bones[f"J_Bip_{side}_Hand"].bone.matrix_local.to_quaternion()
        hand_local_fwd[side] = q_rest.inverted() @ rest_fwd[side]
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
            hand_back = (bones[f"J_Bip_{side}_Hand"].matrix.to_quaternion() @ hand_local_fwd[side]).normalized()
            max_bend = max(max_bend, _m.degrees(forearm.angle(hand_back)))
            lower = bones[f"J_Bip_{side}_LowerArm"]
            transported = (lower.matrix.to_quaternion() @ lower.bone.matrix_local.to_quaternion().inverted()) @ rest_palm[side]
            across = bones[f"J_Bip_{side}_Index1"].head - bones[f"J_Bip_{side}_Little1"].head
            if across.length < 1e-6:
                continue
            actual = (-hand_back.cross(across) if side == "R" else hand_back.cross(across)).normalized()
            ref = (transported - forearm * transported.dot(forearm)).normalized()
            obs = (actual - forearm * actual.dot(forearm)).normalized()
            twist = _m.degrees(_m.atan2(forearm.dot(ref.cross(obs)), ref.dot(obs)))
            if abs(twist) > 45:
                print("WRIST_TWIST_OUTLIER", frame, side, round(twist, 1))
            max_twist = max(max_twist, abs(twist))
    print("AYUDAR_CHECKS", round(max_step, 2), round(max_bend, 2), round(max_twist, 2))
    assert max_step < 20, "Abrupt arm/hand orientation between adjacent frames"
    assert max_bend < 32, "Excessive wrist bend"
    assert max_twist < 45, "Excessive axial wrist twist relative to forearm reference"

    import runpy
    checks = runpy.run_path(str(ROOT / "tools/check_ayuda_motion.py"))
    scene.frame_set(39)
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
            "LSC-54/RawVideos/Videos Courtesy/1/Cordialidad/Ayudar/0.avi",
            "LSC-54/RawVideos/Videos Courtesy/3/Cordialidad/Ayudar/2.avi",
            "LSC-54/RawVideos/Videos Courtesy/21/Cordialidad/Ayudar/1.avi",
            "LSC-54/RawVideos/Videos Courtesy/22/Cordialidad/Ayudar/0.avi",
            "LSC-54/RawVideos/Videos Courtesy/26/Cordialidad/Ayudar/1.avi",
            "LSC-54/RawVideos/Videos Courtesy/30/Cordialidad/Ayudar/0.avi",
        ],
        "method": "Reference-guided authored IK key poses; right fist with thumb up lands on the flat open left palm (palm up) at chest height; both extend forward together holding contact; local hinge finger flexion, hand-relative relaxed thumb, spherical cubic interpolation with shared angular tangents",
        "source_frames": [33, 42, 61, 36], "source_fps": 30,
        "output_frames": FRAME_COUNT, "output_fps": FPS,
        "key_frames": KEY_FRAMES,
        "max_anchor_wrist_error_m": max_err,
        "rotation_curves": len(curves),
        "max_finger_axial_twist_deg": checks["max_twist"],
        "max_thumb_rest_relative_rotation_deg": checks["max_thumb"],
        "max_open_finger_bend_deg": checks["max_open_bend"],
        "passing_pose_speed_ratios": checks["ratios"],
        "max_world_step_deg": max_step, "max_wrist_bend_deg": max_bend,
        "max_wrist_twist_proxy_deg": max_twist,
        "dominant_hand": "right (fist on open left palm, both push forward)",
        "linguistically_validated": False,
        "blend": str(BLEND), "vrma": str(OUT),
    }, indent=2), encoding="utf-8")
    print("AYUDAR_RESULT", REPORT.read_text())


if __name__ == "__main__":
    main()
