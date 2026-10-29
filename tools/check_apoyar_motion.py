"""Regression checks on the real Apoyar rig; run using Blender --background."""
import math
import bpy

rig = bpy.data.objects['Armature']
scene = bpy.context.scene
for frame in (32, 42):
    scene.frame_set(frame)
    for side in ('R', 'L'):
        bones = rig.pose.bones
        gap = (bones[f'J_Bip_{side}_Thumb2'].head - bones[f'J_Bip_{side}_Index1'].head).length
        print('APOYAR_THUMB_KNUCKLE_GAP', frame, side, gap)
        # A raised thumb naturally extends above the index knuckle; distance
        # alone must not force the palm into a collapsed pose.
        assert gap < 0.080, 'Thumb separates excessively from the closed fist'
        proximal = bones[f'J_Bip_{side}_Thumb2'].rotation_quaternion
        bend = math.degrees(2 * math.acos(min(1, abs(proximal.w))))
        print('APOYAR_THUMB_PROXIMAL_BEND', frame, side, bend)
        assert bend < 30, 'Thumb proximal joint folds sharply against its metacarpal'
max_twist = 0.0
samples = {}
for frame in range(1, scene.frame_end + 1):
    scene.frame_set(frame)
    samples[frame] = [rig.pose.bones[f'J_Bip_{s}_{p}'].rotation_quaternion.copy()
                      for s in ('R', 'L') for p in ('UpperArm', 'LowerArm', 'Hand')]
    for side in ('R', 'L'):
        for segment in (1, 2, 3):
            q = rig.pose.bones[f'J_Bip_{side}_Thumb{segment}'].rotation_quaternion
            assert math.degrees(2 * math.acos(min(1, abs(q.w)))) < 30, 'Thumb joint exceeds the gentle rest-relative pose during transition'
        for digit in ('Index', 'Middle', 'Ring', 'Little'):
            for segment in (2, 3):
                q = rig.pose.bones[f'J_Bip_{side}_{digit}{segment}'].rotation_quaternion
                # Blender bones extend along local Y: flexion must not twist
                # the phalanx around that longitudinal axis.
                twist = abs(math.degrees(2 * math.atan2(q.y, q.w))) % 360
                max_twist = max(max_twist, min(twist, 360 - twist))

def speed(a, b):
    return sum(2 * math.acos(min(1, abs(x.dot(y))))
               for x, y in zip(samples[a], samples[b])) / (b - a)

ratios = {}
for frame in (16, 24, 50, 58):
    surrounding = (speed(frame - 4, frame - 2) + speed(frame + 2, frame + 4)) / 2
    ratios[frame] = speed(frame - 1, frame + 1) / max(surrounding, 1e-9)
print('APOYAR_FINGER_TWIST_DEG', max_twist)
print('APOYAR_PASSING_SPEED_RATIOS', ratios)
assert max_twist < 15, 'Finger phalanges twist around their longitudinal axis'
assert min(ratios.values()) > 0.5, 'Artificial stop at a passing pose'
for start, end in ((1, 8), (32, 42)):
    scene.frame_set(start)
    pose = [b.rotation_quaternion.copy() for b in rig.pose.bones]
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        assert all(abs(a.dot(b.rotation_quaternion)) > 1 - 1e-6
                   for a, b in zip(pose, rig.pose.bones)), 'Static hold drifts'
scene.frame_set(scene.frame_end)
assert all(abs(a.dot(b)) > 1 - 1e-6 for a, b in zip(samples[1], samples[scene.frame_end])), 'Loop does not return to rest'
print('APOYAR_MOTION_PASS')
