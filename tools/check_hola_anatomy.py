"""Geometric regression checks; run inside Blender with a candidate .blend."""
import math
import bpy
from mathutils import Vector

rig=bpy.data.objects['Armature']
scene=bpy.context.scene
peak=round((scene.frame_start+scene.frame_end)/2)
scene.frame_set(peak)
bpy.context.view_layer.update()
bones=rig.pose.bones
wrist=bones['J_Bip_R_Hand'].head
middle=bones['J_Bip_R_Middle1'].head
index=bones['J_Bip_R_Index1'].head
little=bones['J_Bip_R_Little1'].head
forward=(middle-wrist).normalized()
# For a right hand the anatomical palm is the opposite of this cross.
palm=-forward.cross(index-little).normalized()
print('PEAK_PALM',tuple(palm), 'FACING_INTERLOCUTOR',palm.dot(Vector((0,-1,0))))
assert palm.dot(Vector((0,-1,0)))>.65, 'Right palm is facing backward'
previous={}
max_step=0
max_bend=0
max_twist=0
rest_forward=(rig.data.bones['J_Bip_R_Middle1'].head_local-rig.data.bones['J_Bip_R_Hand'].head_local).normalized()
rest_across=rig.data.bones['J_Bip_R_Index1'].head_local-rig.data.bones['J_Bip_R_Little1'].head_local
rest_palm=-rest_forward.cross(rest_across).normalized()
for frame in range(scene.frame_start,scene.frame_end+1):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    for name in ('J_Bip_R_UpperArm','J_Bip_R_LowerArm','J_Bip_R_Hand'):
        q=bones[name].matrix.to_quaternion()
        if name in previous:
            angle=2*math.acos(min(1,abs(q.dot(previous[name]))))
            if math.degrees(angle)>20:
                print('STEP_OUTLIER',frame,name,math.degrees(angle))
            max_step=max(max_step,math.degrees(angle))
        previous[name]=q.copy()
    forearm=(bones['J_Bip_R_Hand'].head-bones['J_Bip_R_LowerArm'].head).normalized()
    fingers=(bones['J_Bip_R_Middle1'].head-bones['J_Bip_R_Hand'].head).normalized()
    max_bend=max(max_bend,math.degrees(forearm.angle(fingers)))
    lower=bones['J_Bip_R_LowerArm']
    transported=(lower.matrix.to_quaternion()@lower.bone.matrix_local.to_quaternion().inverted())@rest_palm
    actual=-fingers.cross(bones['J_Bip_R_Index1'].head-bones['J_Bip_R_Little1'].head).normalized()
    ref=(transported-forearm*transported.dot(forearm)).normalized()
    obs=(actual-forearm*actual.dot(forearm)).normalized()
    twist=math.degrees(math.atan2(forearm.dot(ref.cross(obs)),ref.dot(obs)))
    if abs(twist)>45:
        print('WRIST_TWIST_OUTLIER',frame,twist)
    max_twist=max(max_twist,abs(twist))
print('MAX_WORLD_STEP_DEG',max_step,'MAX_WRIST_BEND_DEG',max_bend,'MAX_WRIST_TWIST_PROXY_DEG',max_twist)
assert max_step<20, 'Abrupt arm/hand orientation between adjacent frames'
assert max_bend<32, 'Excessive wrist bend'
assert max_twist<45, 'Excessive axial wrist twist relative to forearm reference'
print('HOLA_ANATOMY_CHECKS_PASS')
