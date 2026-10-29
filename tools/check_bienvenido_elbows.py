"""Regression: excessive elbow torsion must not migrate to the wrist."""
import math
import bpy

rig = bpy.data.objects['Armature']
maximum = {'UpperArm': 0.0, 'LowerArm': 0.0, 'Hand': 0.0}
for frame in range(1, 72):
    bpy.context.scene.frame_set(frame)
    for side in ('R', 'L'):
        for part in maximum:
            q = rig.pose.bones[f'J_Bip_{side}_{part}'].rotation_quaternion.normalized()
            angle = abs(math.degrees(q.to_swing_twist('Y')[1]))
            maximum[part] = max(maximum[part], angle)
print('JOINT_AXIAL_TWIST_DEG', maximum)
assert maximum['LowerArm'] < 40, 'Elbow torsion still pinches the mesh'
assert maximum['Hand'] < 45, 'Elbow torsion was transferred into the wrist'
assert maximum['UpperArm'] < 90, 'Excessive compensating shoulder torsion'
print('BIENVENIDO_ELBOW_CHECK_PASS')
