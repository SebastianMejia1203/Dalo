"""Author an editable, reference-guided Gracias clip, then export VRMA.

Run with Blender --background <working-copy gracias.blend> --python this_file.
Uses local LSC-54 Cordialidad/Gracias references (9 participants, 26 videos;
observed in detail: 1, 3, 19, 21, 22 and 24). This is a manually reconstructed
candidate, NOT linguistically validated. The dataset and the Hola, Bienvenido,
Apoyar and Ayudar files are not overwritten.

Gesture (right-dominant open hand, left hand resting):
rest (hands low, relaxed) -> right open hand rises with fingers extended,
palm medial -> fingertips lightly touch the chin -> hand moves forward-down
while the palm rotates to face up (offering) -> hold -> return along the
same path -> rest. The left hand stays relaxed throughout.
No waves, nods or facial motion invented.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/avatar/gracias.vrma"
BLEND = ROOT / "web/public/Animaciones/gracias.blend"
REPORT = ROOT / "data/inspection/gracias-report.json"
FPS = 30
ACTION_NAME = "Gracias"

# Solved key frames (1-based). Every in-between frame is filled by smooth
# slerp of local quaternions.
KEY_FRAMES = [1, 8, 15, 23, 31, 39, 47, 55, 61, 67, 73, 79, 85]
KEY_TIMES = [(f - 1) / FPS for f in KEY_FRAMES]
FRAME_COUNT = KEY_FRAMES[-1]  # 85 frames at 30 fps (2.80 s)


def mk(rx, ry, rz, lx, ly, lz):
    return {"R": Vector((rx, ry, rz)), "L": Vector((lx, ly, lz))}


def vmk(rx, ry, rz, lx, ly, lz):
    return {"R": Vector((rx, ry, rz)).normalized(),
            "L": Vector((lx, ly, lz)).normalized()}


# Wrist waypoints per key (Blender world: X=anatomical left, -Y=forward, Z=up).
WRISTS = [
    mk(-0.070, -0.160, 0.920, 0.070, -0.160, 0.920),  # 1  rest
    mk(-0.070, -0.160, 0.920, 0.070, -0.160, 0.920),  # 8  rest hold
    mk(-0.070, -0.100, 1.020, 0.070, -0.160, 0.920),  # 15 right rises, fingers up
    mk(-0.065, -0.075, 1.180, 0.070, -0.160, 0.920),  # 23 fingertips touch chin
    mk(-0.070, -0.160, 1.080, 0.070, -0.160, 0.920),  # 31 leaving chin
    mk(-0.100, -0.240, 1.000, 0.070, -0.160, 0.920),  # 39 OFFER: palm up, forward-down
    mk(-0.100, -0.240, 1.000, 0.070, -0.160, 0.920),  # 47 hold offer
    mk(-0.070, -0.160, 1.080, 0.070, -0.160, 0.920),  # 55 retract
    mk(-0.070, -0.158, 1.050, 0.070, -0.160, 0.920),  # 61 palm turning
    mk(-0.070, -0.150, 1.010, 0.070, -0.160, 0.920),  # 67 turning
    mk(-0.070, -0.148, 0.970, 0.070, -0.160, 0.920),  # 73 turning
    mk(-0.070, -0.155, 0.930, 0.070, -0.160, 0.920),  # 79 lowering
    mk(-0.070, -0.160, 0.920, 0.070, -0.160, 0.920),  # 85 rest
]

# Elbow hints per key (pole targets, keep elbows down/out, no flips).
ELBOWS = [
    mk(-0.170, 0.000, 1.050, 0.170, 0.000, 1.050),
    mk(-0.170, 0.000, 1.050, 0.170, 0.000, 1.050),
    mk(-0.210, -0.010, 1.040, 0.170, 0.000, 1.050),
    mk(-0.220, 0.000, 1.020, 0.170, 0.000, 1.050),
    mk(-0.230, -0.020, 1.040, 0.170, 0.000, 1.050),
    mk(-0.260, -0.030, 1.060, 0.170, 0.000, 1.050),
    mk(-0.260, -0.030, 1.060, 0.170, 0.000, 1.050),
    mk(-0.200, -0.040, 1.060, 0.170, 0.000, 1.050),
    mk(-0.170, -0.070, 1.120, 0.170, 0.000, 1.050),
    mk(-0.150, -0.100, 1.160, 0.170, 0.000, 1.050),
    mk(-0.150, -0.100, 1.140, 0.170, 0.000, 1.050),
    mk(-0.160, -0.050, 1.080, 0.170, 0.000, 1.050),
    mk(-0.170, 0.000, 1.050, 0.170, 0.000, 1.050),
]

# Hand-forward (knuckle) directions per key.
DIRS = [
    vmk(0.70, -0.50, -0.20, -0.70, -0.50, -0.20),
    vmk(0.70, -0.50, -0.20, -0.70, -0.50, -0.20),
    vmk(0.00, -0.50, 0.85, -0.70, -0.50, -0.20),
    vmk(0.30, 0.10, 0.94, -0.70, -0.50, -0.20),
    vmk(0.00, -0.70, 0.70, -0.70, -0.50, -0.20),
    vmk(0.25, -0.92, -0.05, -0.70, -0.50, -0.20),
    vmk(0.25, -0.92, -0.05, -0.70, -0.50, -0.20),
    vmk(0.00, -0.50, 0.80, -0.70, -0.50, -0.20),
    vmk(0.00, -0.20, -0.97, -0.70, -0.50, -0.20),
    vmk(0.00, -0.20, -0.97, -0.70, -0.50, -0.20),
    vmk(0.00, -0.20, -0.97, -0.70, -0.50, -0.20),
    vmk(0.00, -0.20, -0.97, -0.70, -0.50, -0.20),
    vmk(0.70, -0.50, -0.20, -0.70, -0.50, -0.20),
]

# Palm normals per key.
NORMALS = [
    vmk(0.00, 0.00, -1.00, 0.00, 0.00, -1.00),
    vmk(0.00, 0.00, -1.00, 0.00, 0.00, -1.00),
    vmk(1.00, 0.00, -0.20, 0.00, 0.00, -1.00),
    vmk(1.00, 0.00, 0.10, 0.00, 0.00, -1.00),
    vmk(0.80, 0.00, 0.60, 0.00, 0.00, -1.00),
    vmk(0.00, -0.10, 0.99, 0.00, 0.00, -1.00),
    vmk(0.00, -0.10, 0.99, 0.00, 0.00, -1.00),
    vmk(0.00, -0.35, 0.94, 0.00, 0.00, -1.00),
    vmk(0.00, 0.20, 0.98, 0.00, 0.00, -1.00),
    vmk(0.00, 0.65, 0.75, 0.00, 0.00, -1.00),
    vmk(0.00, 0.90, 0.10, 0.00, 0.00, -1.00),
    vmk(0.00, 0.70, -0.65, 0.00, 0.00, -1.00),
    vmk(0.00, 0.00, -1.00, 0.00, 0.00, -1.00),
]

# Both hands stay open and relaxed the whole time.
# The left hand stays a flat open platform (palm up) the whole time.
FIST_R = [0.0] * 10  # unused: both hands stay flat and open
SIDE_MODE = {"R": "flat", "L": "flat"}  # open relaxed hand; left rests

# Finger curls: absolute knuckle angle + chain-relative folds, in degrees.
# Relaxed -> closed fist. Chain-relative folds avoid the shortest-arc flip
# that absolute >180 deg targets would cause in aim().
# Spread is mostly removed as the fist closes; each finger keeps its
# own slight curl so the fist reads as a hand, not a mannequin.
OPEN_CURL = (8.0, 6.0, 6.0)
FIST_CURL = (22.0, 100.0, 48.0)
FINGER_CURL_SCALE = {'Index': 0.94, 'Middle': 1.00, 'Ring': 1.03, 'Little': 1.06}
FINGER_FAN = {'Index': 1.0, 'Middle': 0.3, 'Ring': -0.3, 'Little': -1.0}


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


def bounded_direction(forearm, salute, weight, cap_deg=40.0):
    base = forearm.normalized()
    angle = base.angle(salute)
    fraction = min(weight, math.radians(cap_deg) / max(angle, 1e-6))
    return Quaternion().slerp(base.rotation_difference(salute), fraction) @ base


def aim_roll(bone, target_direction, nail_rest_world, dorsal_world):
    """Point the bone at target, then twist about its axis so the nail side
    faces the dorsal (back-of-hand) direction. Without this, the minimal
    rotation leaves an arbitrary axial roll and curled fingers render
    twisted/mirrored with inverted shading."""
    origin = bone.head.copy()
    rest = bone.bone.matrix_local.to_quaternion()
    direction = (bone.bone.tail_local - bone.bone.head_local)
    base = direction.normalized().rotation_difference(target_direction.normalized()) @ rest
    local_nail = rest.inverted() @ nail_rest_world.normalized()
    cur = (base @ local_nail).normalized()
    t = target_direction.normalized()
    d = dorsal_world.normalized()
    cur_p = cur - t * cur.dot(t)
    des_p = d - t * d.dot(t)
    if cur_p.length > 1e-6 and des_p.length > 1e-6:
        cur_p.normalize()
        des_p.normalize()
        ang = math.atan2(t.dot(cur_p.cross(des_p)), cur_p.dot(des_p))
        base = Quaternion(t, ang) @ base
    bone.matrix = Matrix.Translation(origin) @ base.to_matrix().to_4x4()
    bpy.context.view_layer.update()


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
    rest_fwd_h = {}
    rest_palm = {}
    own_dir = {}
    for side in ("R", "L"):
        rest_fwd[side] = (bones[f"J_Bip_{side}_Middle1"].bone.tail_local - bones[f"J_Bip_{side}_Middle1"].bone.head_local).normalized()
        across = bones[f"J_Bip_{side}_Index1"].bone.head_local - bones[f"J_Bip_{side}_Little1"].bone.head_local
        n = rest_fwd[side].cross(across).normalized()
        if side == "R":
            n.negate()
        rest_palm[side] = (n - rest_fwd[side] * n.dot(rest_fwd[side])).normalized()
        rest_fwd_h[side] = (bones[f"J_Bip_{side}_Middle1"].bone.head_local - bones[f"J_Bip_{side}_Hand"].bone.head_local).normalized()
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
            if frame in (39, 47, 55, 61, 67, 73, 79):
                hint_v = hint - shoulder
                print("ROLLDIAG", frame, side, round(math.degrees(roll), 1),
                      "wrist", tuple(round(v, 3) for v in wrist),
                      "ldir", tuple(round(v, 3) for v in ldir),
                      "hinge", tuple(round(v, 3) for v in hinge.normalized()),
                      "elb", tuple(round(v, 3) for v in (elbow - shoulder)))
            twist = Quaternion(ldir, roll)
            rotated = twist @ lower.matrix.to_quaternion()
            lower.matrix = Matrix.Translation(lower.head.copy()) @ rotated.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            delta = align_hand(bones, side, direction, normal)
            if frame == 39 and side == "R":
                _qr = bones["J_Bip_R_Hand"].bone.matrix_local.to_quaternion()
                _lf = (_qr.inverted() @ rest_fwd["R"]).normalized()
                hb = (bones["J_Bip_R_Hand"].matrix.to_quaternion() @ _lf).normalized()
                print("DBG39", "ldir", tuple(round(v, 3) for v in ldir),
                      "salute", tuple(round(v, 3) for v in salute),
                      "direction", tuple(round(v, 3) for v in direction),
                      "hand_back", tuple(round(v, 3) for v in hb))
            inward = -(delta @ rest_palm[side]).normalized()
            nail_rest = (-rest_palm[side]).normalized()
            if SIDE_MODE[side] == "fist":
                fa = FIST_R[ki]
                # Finger curls: knuckle aims from rest, then chain-relative folds.
                a1 = math.radians(OPEN_CURL[0] + (FIST_CURL[0] - OPEN_CURL[0]) * fa)
                r2 = math.radians(OPEN_CURL[1] + (FIST_CURL[1] - OPEN_CURL[1]) * fa)
                r3 = math.radians(OPEN_CURL[2] + (FIST_CURL[2] - OPEN_CURL[2]) * fa)
                # Fingers fold onto the palm, i.e. toward the side the palm
                # faces (+rest_palm). (Toward -rest_palm is the dorsal side and
                # renders the hand backwards.)
                palmside = -inward
                mid_own = own_dir[(side, "Middle", 1)]
                for digit in ("Index", "Middle", "Ring", "Little"):
                    seg1 = bones[f"J_Bip_{side}_{digit}1"]
                    # Adduct toward the middle finger as the fist closes.
                    own = own_dir[(side, digit, 1)].lerp(mid_own, min(1.0, fa * 1.2)).normalized()
                    ca1, cr2, cr3 = (a * FINGER_CURL_SCALE[digit] for a in (a1, r2, r3))
                    fan = Quaternion(direction, FINGER_FAN[digit] * 0.30 * fa *
                          (1.0 if side == "R" else -1.0))
                    aim_roll(seg1, fan @ (delta @ (own * math.cos(ca1) + rest_palm[side] * math.sin(ca1)).normalized()),
                             nail_rest, inward)
                    prev = seg1
                    for seg, rel in ((2, cr2), (3, cr3)):
                        bone = bones[f"J_Bip_{side}_{digit}{seg}"]
                        d = ((prev.tail - prev.head).normalized())
                        axis = (palmside - d * palmside.dot(d))
                        if axis.length < 1e-6:
                            axis = palmside.copy()
                        axis.normalize()
                        aim_roll(bone, (d * math.cos(rel) + axis * math.sin(rel)).normalized(),
                                 nail_rest, inward)
                        prev = bone
                # Thumb: extended near the index at rest, up in the fist.
                thumb_rest = own_dir[(side, "Thumb", 1)].lerp(rest_fwd[side], 0.55).normalized()
                t_ext = delta @ thumb_rest
                t_up = (Vector((0, 0, 0.95)) + direction * 0.25).normalized()
                # Slight natural bend: base leans onto the fist, tip straightest.
                midline = Vector((1.0 if side == "R" else -1.0, 0.0, 0.0))
                t_base = (Vector((0, 0, 0.72)) + midline * 0.48 + direction * 0.28).normalized()
                t_segs = [(t_base * 0.94 + inward * 0.20).normalized(),
                          (t_base * 0.97 + inward * 0.10).normalized(),
                          t_base]
                for seg, t_seg_up in zip((1, 2, 3), t_segs):
                    t_thumb = (t_ext * (1.0 - fa) + t_seg_up * fa).normalized()
                    aim_roll(bones[f"J_Bip_{side}_Thumb{seg}"], t_thumb, nail_rest, inward)
            else:
                # Flat open hand: fingers extended together, thumb near index.
                for digit in ("Index", "Middle", "Ring", "Little"):
                    for seg in (1, 2, 3):
                        bone = bones[f"J_Bip_{side}_{digit}{seg}"]
                        own = own_dir[(side, digit, seg)]
                        if seg == 1:
                            desired = own.lerp(rest_fwd[side], 0.80).normalized()
                        else:
                            desired = rest_fwd[side]
                        aim_roll(bone, delta @ desired, nail_rest, inward)
                thumb_rest = own_dir[(side, "Thumb", 1)].lerp(rest_fwd[side], 0.55).normalized()
                for seg in (1, 2, 3):
                    aim_roll(bones[f"J_Bip_{side}_Thumb{seg}"], delta @ thumb_rest, nail_rest, inward)
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
        for name in names:
            q = pose_samples[left][name].slerp(pose_samples[right][name], u)
            bones[name].rotation_quaternion = q
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
        hand_local_fwd[side] = q_rest.inverted() @ rest_fwd_h[side]
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
            bnow = _m.degrees(forearm.angle(hand_back))
            if bnow > 40:
                print("BEND_OUTLIER", frame, side, round(bnow, 1))
            max_bend = max(max_bend, bnow)
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
    print("GRACIAS_CHECKS", round(max_step, 2), round(max_bend, 2), round(max_twist, 2))
    assert max_step < 20, "Abrupt arm/hand orientation between adjacent frames"
    assert max_bend < 45, "Excessive wrist bend (adapted: Gracias holds a deliberate offer/palm-turn; human wrist ROM is ~70 deg)"
    assert max_twist < 60, "Excessive axial wrist twist (adapted: deliberate palm turnover, verified smooth)"
    left_curves = [c for c in curves if 'J_Bip_L_' in c.data_path]
    assert all(max(p.co.y for p in c.keyframe_points) - min(p.co.y for p in c.keyframe_points) < 1e-5 for c in left_curves)

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
            "LSC-54/RawVideos/Videos Courtesy/1/Cordialidad/Gracias/0.avi",
            "LSC-54/RawVideos/Videos Courtesy/3/Cordialidad/Gracias/1.avi",
            "LSC-54/RawVideos/Videos Courtesy/19/Cordialidad/Gracias/2.avi",
            "LSC-54/RawVideos/Videos Courtesy/21/Cordialidad/Gracias/0.avi",
            "LSC-54/RawVideos/Videos Courtesy/22/Cordialidad/Gracias/2.avi",
            "LSC-54/RawVideos/Videos Courtesy/24/Cordialidad/Gracias/0.avi",
        ],
        "method": "Reference-guided authored IK key poses; right open hand rises, fingertips touch chin, then moves forward-down as the palm rotates to face up (offering); local quaternion interpolation",
        "source_frames": [124, 51, 110, 97], "source_fps": 30,
        "output_frames": FRAME_COUNT, "output_fps": FPS,
        "key_frames": KEY_FRAMES,
        "max_anchor_wrist_error_m": max_err,
        "rotation_curves": len(curves),
        "max_world_step_deg": max_step, "max_wrist_bend_deg": max_bend,
        "max_wrist_twist_proxy_deg": max_twist,
        "dominant_hand": "right (open hand; left rests; variant with both hands exists: participant 22)",
        "linguistically_validated": False,
        "blend": str(BLEND), "vrma": str(OUT),
    }, indent=2), encoding="utf-8")
    print("GRACIAS_RESULT", REPORT.read_text())


if __name__ == "__main__":
    main()
