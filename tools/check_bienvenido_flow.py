"""Check that passing poses do not introduce artificial stops (run in Blender)."""
import json
import math
import bpy

rig = bpy.data.objects['Armature']
scene = bpy.context.scene
names = [f'J_Bip_{s}_{part}' for s in ('R', 'L')
         for part in ('UpperArm', 'LowerArm', 'Hand')]
samples = {}
for frame in range(1, scene.frame_end + 1):
    scene.frame_set(frame)
    samples[frame] = [rig.pose.bones[n].rotation_quaternion.copy().normalized()
                      for n in names]

def speed(a, b):
    return sum(2 * math.acos(min(1.0, abs(x.dot(y))))
               for x, y in zip(samples[a], samples[b])) / (b - a)

ratios = {}
for frame in (15, 30, 54, 61):
    passing = speed(frame - 1, frame + 1)
    surrounding = (speed(frame - 4, frame - 2) + speed(frame + 2, frame + 4)) / 2
    ratios[frame] = passing / max(surrounding, 1e-9)
print('PASSING_POSE_SPEED_RATIOS', json.dumps(ratios))
# Curved arm rotations can slow naturally; reject the pronounced stop/start
# signature (original clip: only 18–25% of surrounding angular speed).
assert min(ratios.values()) > 0.5, 'Artificial braking at a passing pose'
print('BIENVENIDO_FLOW_PASS')
