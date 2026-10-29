"""Check Ayuda's real rig for finger twist, thumb kinks and artificial stops."""
import math
import bpy

rig = bpy.data.objects['Armature']
scene = bpy.context.scene
samples = {}
max_twist = max_thumb = max_open_bend = 0.0
for frame in range(1, scene.frame_end + 1):
    scene.frame_set(frame)
    samples[frame] = [rig.pose.bones[f'J_Bip_{s}_{p}'].rotation_quaternion.copy()
                      for s in ('R', 'L') for p in ('UpperArm', 'LowerArm', 'Hand')]
    for side in ('R', 'L'):
        for seg in (1, 2, 3):
            q = rig.pose.bones[f'J_Bip_{side}_Thumb{seg}'].rotation_quaternion
            max_thumb = max(max_thumb, math.degrees(2 * math.acos(min(1, abs(q.w)))))
        for digit in ('Index', 'Middle', 'Ring', 'Little'):
            for seg in (2, 3):
                q = rig.pose.bones[f'J_Bip_{side}_{digit}{seg}'].rotation_quaternion
                twist = abs(math.degrees(2 * math.atan2(q.y, q.w))) % 360
                max_twist = max(max_twist, min(twist, 360 - twist))
                if side == 'L':
                    max_open_bend = max(max_open_bend, math.degrees(2 * math.acos(min(1, abs(q.w)))))

def speed(a, b):
    return sum(2 * math.acos(min(1, abs(x.dot(y))))
               for x, y in zip(samples[a], samples[b])) / (b - a)

ratios = {}
for frame in (15, 21, 34, 66):
    around = (speed(frame - 4, frame - 2) + speed(frame + 2, frame + 4)) / 2
    ratios[frame] = speed(frame - 1, frame + 1) / max(around, 1e-9)
print('AYUDA_FINGER_TWIST_DEG', max_twist)
print('AYUDA_THUMB_BEND_DEG', max_thumb)
print('AYUDA_OPEN_FINGER_BEND_DEG', max_open_bend)
print('AYUDA_PASSING_SPEED_RATIOS', ratios)
assert max_twist < 15, 'Finger phalanges twist around their longitudinal axis'
assert max_thumb < 30, 'Thumb departs too far from its natural rest shape'
assert max_open_bend < 15, 'The supporting hand must stay open'
# Frame 34 is contact with the supporting palm, where deceleration is
# intentional. The rise and descent passing poses must remain continuous.
assert min(ratios[f] for f in (15, 21, 66)) > 0.5, 'Artificial stop at a passing pose'
for start, end in ((1, 9), (42, 50)):
    scene.frame_set(start)
    pose = [b.rotation_quaternion.copy() for b in rig.pose.bones]
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        assert all(abs(a.dot(b.rotation_quaternion)) > 1 - 1e-6
                   for a, b in zip(pose, rig.pose.bones)), 'Static hold drifts'
assert all(abs(a.dot(b)) > 1 - 1e-6 for a, b in zip(samples[1], samples[scene.frame_end])), 'Loop does not return to rest'
print('AYUDA_MOTION_PASS')
