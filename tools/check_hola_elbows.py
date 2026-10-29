"""Reject axial elbow torsion in Hola without moving it into the wrist."""
import math
import bpy

rig = bpy.data.objects['Armature']
scene = bpy.context.scene
maximum = {f'{side}_{part}': (0.0, 0) for side in ('R', 'L')
           for part in ('UpperArm', 'LowerArm', 'Hand')}
for frame in range(1, scene.frame_end + 1):
    scene.frame_set(frame)
    for key in maximum:
        q = rig.pose.bones[f'J_Bip_{key}'].rotation_quaternion.normalized()
        twist = abs(math.degrees(q.to_swing_twist('Y')[1]))
        if twist > maximum[key][0]:
            maximum[key] = (twist, frame)
print('HOLA_JOINT_AXIAL_TWIST', maximum)
assert all(maximum[f'{side}_UpperArm'][0] < 50 for side in ('R', 'L')), 'Upper-arm axial roll deforms the elbow and sleeve'
assert all(maximum[f'{side}_LowerArm'][0] < 40 for side in ('R', 'L')), 'Axial elbow torsion pinches the arm mesh'
assert all(maximum[f'{side}_Hand'][0] < 45 for side in ('R', 'L')), 'Elbow torsion must not transfer into the wrist'
print('HOLA_ELBOWS_PASS')
