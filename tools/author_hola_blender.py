"""Author an editable, reference-guided Hola clip, then export VRMA.

Run with Blender --background <working-copy.blend> --python this_file.
Uses the local LSC-54 Signer_1/Cordialidad/Hola/0.avi as visual reference.
This is a manually reconstructed candidate, not a linguistically validated sign.
The dataset and the input blend are not overwritten.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/avatar/hola.vrma"
BLEND = ROOT / "web/public/Animaciones/hola.blend"
REPORT = ROOT / "data/inspection/hola-report.json"
FRAME_COUNT = 79
ANCHORS = [1,7,24,28,34,39,61,67]
PLAYBACK_ANCHORS = [1,7,30,34,40,45,73,79]


def solve_elbow(shoulder, wrist, upper_length, lower_length, pole):
    delta = wrist - shoulder
    distance = delta.length
    if not abs(upper_length-lower_length)+1e-5 < distance < upper_length+lower_length-1e-5:
        raise ValueError(f"Unreachable wrist: {distance}")
    axis = delta.normalized()
    along = (upper_length**2-lower_length**2+distance**2)/(2*distance)
    radius = math.sqrt(max(0, upper_length**2-along**2))
    outward = pole - axis * pole.dot(axis)
    if outward.length < 1e-6:
        raise ValueError("Degenerate elbow pole")
    return shoulder + axis*along + outward.normalized()*radius


def aim(bone, target_direction, reference_direction=None):
    origin = bone.head.copy()
    rest = bone.bone.matrix_local.to_quaternion()
    direction = reference_direction or (bone.bone.tail_local-bone.bone.head_local)
    rotation = direction.normalized().rotation_difference(target_direction.normalized()) @ rest
    bone.matrix = Matrix.Translation(origin) @ rotation.to_matrix().to_4x4()
    bpy.context.view_layer.update()


def align_hand(bones, side, direction, normal):
    hand = bones[f"J_Bip_{side}_Hand"]
    rest_hand = hand.bone.head_local
    rest_fwd = (bones[f"J_Bip_{side}_Middle1"].bone.head_local-rest_hand).normalized()
    # The right palm points down in the source T-pose. Opposite cross for left.
    rest_across = bones[f"J_Bip_{side}_Index1"].bone.head_local-bones[f"J_Bip_{side}_Little1"].bone.head_local
    rest_n = rest_fwd.cross(rest_across).normalized()
    if side == "R":
        rest_n.negate()
    rest_n = (rest_n-rest_fwd*rest_n.dot(rest_fwd)).normalized()
    fwd = direction.normalized()
    n = (normal-fwd*normal.dot(fwd)).normalized()
    a = Matrix((rest_fwd, rest_n, rest_fwd.cross(rest_n))).transposed()
    b = Matrix((fwd, n, fwd.cross(n))).transposed()
    rotation_delta = b @ a.transposed()
    rotation = rotation_delta.to_quaternion() @ hand.bone.matrix_local.to_quaternion()
    hand.matrix = Matrix.Translation(hand.head.copy()) @ rotation.to_matrix().to_4x4()
    bpy.context.view_layer.update()
    return rotation_delta


# Times in seconds. The reference gesture is slowed for deliberate articulation.
# X = anatomical left, -Y = toward the interlocutor, Z = up.
# The active right hand travels beside the right temple and then outward.
# No invented repeated wave, nod, or facial expression is added.
KEYS = [
    (0.00,(-.070,-.160,.920)),
    (0.20,(-.070,-.160,.920)),
    (0.38,(-.192,-.100,1.035)),
    (0.59,(-.157,-.125,1.335)),
    (0.77,(-.130,-.125,1.425)),
    (0.91,(-.135,-.145,1.455)),
    (1.10,(-.195,-.175,1.490)),
    (1.26,(-.205,-.175,1.460)),
    (1.50,(-.210,-.145,1.205)),
    (1.78,(-.180,-.075,.930)),
    (2.00,(-.070,-.160,.920)),
    (2.20,(-.070,-.160,.920)),
]
ELBOW_KEYS = [(time,point) for (time,_),point in zip(KEYS,[
    (-.170,0.000,1.050),(-.170,0.000,1.050),(-.26,-.040,1.115),
    (-.29,-.035,1.205),(-.29,-.025,1.255),(-.29,-.025,1.280),
    (-.30,-.035,1.290),(-.30,-.035,1.275),(-.27,-.035,1.165),
    (-.20,-.025,1.085),(-.170,0.000,1.050),(-.170,0.000,1.050)])]


def target_at(t,keys=KEYS):
    # Shape-preserving cubic Hermite: continuous velocity without stopping at
    # every reference point and without overshooting the reachable workspace.
    def slope(k,axis):
        if k==0 or k==len(keys)-1:
            return 0.0
        a,b,c=keys[k-1:k+2]
        h0,h1=b[0]-a[0],c[0]-b[0]
        d0,d1=(b[1][axis]-a[1][axis])/h0,(c[1][axis]-b[1][axis])/h1
        if d0*d1<=0:
            return 0.0
        w0,w1=2*h1+h0,h1+2*h0
        return (w0+w1)/(w0/d0+w1/d1)
    for k,(a,b) in enumerate(zip(keys,keys[1:])):
        if t<=b[0]:
            h=b[0]-a[0]
            u=max(0,min(1,(t-a[0])/h))
            h00,h10=2*u**3-3*u*u+1,u**3-2*u*u+u
            h01,h11=-2*u**3+3*u*u,u**3-u*u
            return Vector(tuple(h00*a[1][j]+h10*h*slope(k,j)+h01*b[1][j]+h11*h*slope(k+1,j) for j in range(3)))
    return Vector(keys[-1][1])


def smooth(a,b,t):
    u=max(0,min(1,(t-a)/(b-a)))
    return u*u*(3-2*u)


def orient_axes(bone,rest_direction,rest_normal,direction,normal):
    r=rest_direction.normalized()
    rn=(rest_normal-r*rest_normal.dot(r)).normalized()
    d=direction.normalized()
    n=(normal-d*normal.dot(d)).normalized()
    a=Matrix((r,rn,r.cross(rn))).transposed()
    b=Matrix((d,n,d.cross(n))).transposed()
    rotation=(b@a.transposed()).to_quaternion()@bone.bone.matrix_local.to_quaternion()
    bone.matrix=Matrix.Translation(bone.head.copy())@rotation.to_matrix().to_4x4()
    bpy.context.view_layer.update()


def bounded_direction(forearm,salute,weight):
    base=forearm.normalized()
    angle=base.angle(salute)
    # Wrist extension/flexion stays below 25 degrees. The arm carries the
    # gesture; the wrist no longer independently swings through 180 degrees.
    fraction=min(weight,math.radians(25)/max(angle,1e-6))
    return Quaternion().slerp(base.rotation_difference(salute),fraction)@base


def ayuda_rest_pose():
    """Read the accepted Ayuda rest rotations without modifying that file."""
    with bpy.data.libraries.load(str(ROOT / 'web/public/Animaciones/ayuda.blend')) as (source, destination):
        destination.actions = ['Ayudar']
    reference = destination.actions[0]
    components = {}
    for layer in reference.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    if curve.data_path.endswith('rotation_quaternion'):
                        name = curve.data_path.split('"')[1]
                        components.setdefault(name, [0.0] * 4)[curve.array_index] = curve.evaluate(1)
    rotations = {name: Quaternion(values).normalized() for name, values in components.items()}
    bpy.data.actions.remove(reference)
    return rotations


def main():
    bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.vrm")
    rig = bpy.data.objects.get("Armature")
    if not rig or rig.type != "ARMATURE":
        raise ValueError("Expected the already imported Armature")
    bpy.context.view_layer.objects.active=rig
    if rig.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(True)
    rig.animation_data_clear()
    rig.data.animation_data_clear()
    for bone in rig.pose.bones:
        bone.rotation_mode="QUATERNION"
        bone.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    scene=bpy.context.scene
    scene.render.fps=30
    scene.render.fps_base=1
    scene.frame_start=1
    scene.frame_end=FRAME_COUNT
    bones=rig.pose.bones
    measured=[]
    all_quaternions={}
    pose_samples={}
    names=[]
    for side in ("R","L"):
        names.extend(f"J_Bip_{side}_{name}" for name in ("UpperArm","LowerArm","Hand"))
        names.extend(f"J_Bip_{side}_{digit}{seg}" for digit in ("Thumb","Index","Middle","Ring","Little") for seg in (1,2,3))
    rest_pose = ayuda_rest_pose()
    assert all(name in rest_pose for name in names)
    action=bpy.data.actions.new("Hola")
    rig.animation_data_create()
    rig.animation_data.action=action
    for frame in ANCHORS:
        scene.frame_set(frame)
        for bone in bones:
            bone.matrix_basis=Matrix.Identity(4)
        bpy.context.view_layer.update()
        t=(frame-1)/30
        wrist=target_at(t)
        weight=smooth(.30,.73,t)*(1-smooth(1.28,1.85,t))
        for side in ("R","L"):
            upper=bones[f"J_Bip_{side}_UpperArm"]
            lower=bones[f"J_Bip_{side}_LowerArm"]
            hand=bones[f"J_Bip_{side}_Hand"]
            shoulder=upper.head.copy()
            l1=(lower.bone.head_local-upper.bone.head_local).length
            l2=(hand.bone.head_local-lower.bone.head_local).length
            w=wrist if side=="R" else Vector((.135,-.095,.940))
            hint=target_at(t,ELBOW_KEYS) if side=="R" else Vector((.20,-.005,1.050))
            elbow=solve_elbow(shoulder,w,l1,l2,hint-shoulder)
            udir=(elbow-shoulder).normalized()
            ldir=(w-elbow).normalized()
            hinge=udir.cross(ldir).normalized()
            rest_axis=Vector((0,0,1 if side=="R" else -1))
            orient_axes(upper,upper.bone.tail_local-upper.bone.head_local,rest_axis,udir,hinge)
            orient_axes(lower,lower.bone.tail_local-lower.bone.head_local,rest_axis,ldir,hinge)
            measured.append((hand.head-w).length)
            active_weight=weight if side=="R" else 0
            salute = Vector((.70, -.50, -.20)).normalized().lerp(Vector((.22, 0, .975)).normalized(), active_weight).normalized()
            if side == "L":
                salute = Vector((-.15, 0, -.99)).normalized()
            direction=bounded_direction(ldir,salute,1.0)
            relaxed=Vector((0,0,-1))
            # About 33 degrees inward: oblique palm as in the reference,
            # instead of presenting a flat palm directly to the camera.
            normal=relaxed.lerp(Vector((.55,-.835,0)).normalized(),active_weight).normalized()
            if side == "L":
                normal = Vector((0, 1, 0))
            # Forearm pronation/supination carries the palm roll. Align its
            # anatomical palm reference before applying the small wrist bend.
            baseline=-hinge if side=="R" else hinge
            target=(normal-ldir*normal.dot(ldir)).normalized()
            roll=math.atan2(ldir.dot(baseline.cross(target)),baseline.dot(target))
            roll=max(-math.radians(85),min(math.radians(85),roll))
            twist=Quaternion(ldir,roll)
            rotated=twist@lower.matrix.to_quaternion()
            lower.matrix=Matrix.Translation(lower.head.copy())@rotated.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            delta=align_hand(bones,side,direction,normal)
            if side == "L":
                # Relax the passive hand along the skirt during the salute.
                # The forearm carries the roll, keeping the wrist aligned.
                for name in names:
                    if name.startswith('J_Bip_L_'):
                        bone = bones[name]
                        if not name.endswith(('UpperArm', 'LowerArm', 'Hand')):
                            bone.rotation_quaternion = rest_pose[name]
                        bone.rotation_quaternion = rest_pose[name].slerp(bone.rotation_quaternion, weight)
                bpy.context.view_layer.update()
                continue
            # Extend from the accepted relaxed pose using local joint
            # rotations, preserving finger roll and the natural thumb chain.
            rest_forward=(bones[f"J_Bip_{side}_Middle1"].bone.tail_local-bones[f"J_Bip_{side}_Middle1"].bone.head_local).normalized()
            for digit in ("Index","Middle","Ring","Little"):
                for seg in (1,2,3):
                    name = f"J_Bip_{side}_{digit}{seg}"
                    bone = bones[name]
                    rotation = Quaternion()
                    if seg == 1:
                        own=(bone.bone.tail_local-bone.bone.head_local).normalized()
                        desired=own.lerp(rest_forward,.80).normalized()
                        rest_rotation = bone.bone.matrix_local.to_quaternion()
                        rotation = rest_rotation.inverted() @ own.rotation_difference(desired) @ rest_rotation
                    bone.rotation_quaternion = rest_pose[name].slerp(rotation, active_weight)
            thumb=bones[f"J_Bip_{side}_Thumb1"]
            own=(thumb.bone.tail_local-thumb.bone.head_local).normalized()
            desired=(own * .82 + rest_forward * .18).normalized()
            rest_rotation=thumb.bone.matrix_local.to_quaternion()
            rotation=rest_rotation.inverted() @ own.rotation_difference(desired) @ rest_rotation
            thumb.rotation_quaternion=rest_pose[thumb.name].slerp(rotation, active_weight)
            for seg in (2,3):
                name=f"J_Bip_{side}_Thumb{seg}"
                bones[name].rotation_quaternion=rest_pose[name].slerp(Quaternion(),active_weight)
            bpy.context.view_layer.update()
        if t <= .20 or t >= 2.00:
            for name in names:
                bones[name].rotation_quaternion=rest_pose[name]
            bpy.context.view_layer.update()
        for name in names:
            bone=bones[name]
            q=bone.rotation_quaternion.copy().normalized()
            previous=all_quaternions.get(name)
            if previous and previous.dot(q)<0:
                q.negate()
            bone.rotation_quaternion=q
            all_quaternions[name]=q.copy()
            bone.keyframe_insert(data_path="rotation_quaternion",frame=frame,group=name)
        pose_samples[frame]={name:bones[name].rotation_quaternion.copy() for name in names}
    playback_poses = {frame: pose_samples[source] for frame, source in zip(PLAYBACK_ANCHORS, ANCHORS)}
    # Shared angular tangents avoid braking at each passing key. Repeated
    # rest/stack poses get zero tangents, preserving deliberate holds.
    velocities = {}
    for i, frame in enumerate(PLAYBACK_ANCHORS):
        velocities[frame] = {}
        for name in names:
            v = Vector((0, 0, 0))
            if 0 < i < len(PLAYBACK_ANCHORS) - 1:
                a, b = PLAYBACK_ANCHORS[i - 1], PLAYBACK_ANCHORS[i + 1]
                center = playback_poses[frame][name]
                incoming = -(center.inverted() @ playback_poses[a][name]).to_exponential_map() / (frame - a)
                outgoing = (center.inverted() @ playback_poses[b][name]).to_exponential_map() / (b - frame)
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
        i = next(i for i, end in enumerate(PLAYBACK_ANCHORS[1:]) if frame <= end)
        left, right = PLAYBACK_ANCHORS[i:i + 2]
        duration = right - left
        u = (frame - left) / duration
        for name in names:
            a, b = playback_poses[left][name], playback_poses[right][name]
            c1 = a @ Quaternion(velocities[left][name] * (duration / 3))
            c2 = b @ Quaternion(-velocities[right][name] * (duration / 3))
            p, q, r = a.slerp(c1, u), c1.slerp(c2, u), c2.slerp(b, u)
            rotation = p.slerp(q, u).slerp(q.slerp(r, u), u).normalized()
            bones[name].rotation_quaternion = rotation
            bones[name].keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
    scene.frame_set(40)
    bpy.context.view_layer.update()
    curves=[c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation="LINEAR"
    assert max(measured)<1e-4, f"Wrist placement error {max(measured)}"
    assert len(curves)==len(names)*4
    assert all(len(c.keyframe_points)==FRAME_COUNT for c in curves)
    # After settling against the body, the passive hand stays still
    # throughout the raised salute, then returns to the shared rest pose.
    left_curves=[c for c in curves if 'J_Bip_L_' in c.data_path]
    assert all(max(c.evaluate(f) for f in range(30,46))-min(c.evaluate(f) for f in range(30,46))<1e-5 for c in left_curves)
    import runpy
    elbow_tools=runpy.run_path(str(ROOT/'tools/relax_hola_elbows.py'))
    elbow_report=elbow_tools['relax_elbows'](rig, scene)
    elbow_tools['use_runtime_body']()
    runpy.run_path(str(ROOT/'tools/check_hola_elbows.py'))
    checks=runpy.run_path(str(ROOT/'tools/check_hola_anatomy.py'))
    runpy.run_path(str(ROOT/'tools/check_hola_start_and_palm.py'))
    scene.frame_set(40)
    OUT.parent.mkdir(parents=True,exist_ok=True)
    result=bpy.ops.export_scene.vrma(filepath=str(OUT),armature_object_name=rig.name)
    assert result=={"FINISHED"},result
    # Make the edit session useful: visible selected bones and frame range.
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    REPORT.parent.mkdir(parents=True,exist_ok=True)
    REPORT.write_text(json.dumps({
        "reference":"LSC-54/RawVideos/Videos Courtesy/1/Cordialidad/Hola/0.avi",
        "method":"Reference-guided authored IK key poses; shared Ayuda initial/final pose; passive left palm rests toward the body during the salute; inward oblique active palm; local finger rotations; spherical cubic interpolation with shared angular tangents",
        "source_frames":33,"source_fps":30,"output_frames":FRAME_COUNT,"output_fps":30,
        "max_anchor_wrist_error_m":max(measured),"rotation_curves":len(curves),
        "max_world_step_deg":checks['max_step'],"max_wrist_bend_deg":checks['max_bend'],
        "max_wrist_twist_proxy_deg":checks['max_twist'],
        "elbow_roll_correction":elbow_report,
        "shared_rest_source":"ayuda.blend / Ayudar, frame 1","palm_inward_target_deg":33.4,"non_dominant_hand_settles_against_body":True,"linguistically_validated":False,
        "blend":str(BLEND),"vrma":str(OUT)
    },indent=2),encoding="utf-8")
    print("HOLA_RESULT",REPORT.read_text())


if __name__=="__main__":
    main()
