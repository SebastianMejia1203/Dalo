"""Export the actual runtime elbow mesh and Hola bone poses for renderer QA."""
import json
import math
import runpy
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[1]
runpy.run_path(str(root / 'tools/relax_hola_elbows.py'))['use_runtime_body']()
rig, body = bpy.data.objects['Armature'], bpy.data.objects['Body']
bones = list(rig.data.bones)
indices = {bone.name: i for i, bone in enumerate(bones)}
transform = rig.matrix_world.inverted() @ body.matrix_world
positions = [transform @ v.co for v in body.data.vertices]
weights = []
for vertex in body.data.vertices:
    items = sorted([(indices[body.vertex_groups[g.group].name], g.weight)
                    for g in vertex.groups if body.vertex_groups[g.group].name in indices and g.weight > 1e-7],
                   key=lambda item: -item[1])[:4]
    total = sum(w for _, w in items)
    weights.append([(i, w / total) for i, w in items])

def matrix(m):
    return [m[row][col] for col in range(4) for row in range(4)]

poses = {}
for frame in (1, 15, 30, 40, 59, 73, 79):
    bpy.context.scene.frame_set(frame)
    poses[frame] = [matrix(rig.pose.bones[b.name].matrix) for b in bones]
data = dict(positions=[list(v) for v in positions],
            normals=[list((transform.to_3x3().inverted().transposed() @ v.normal).normalized()) for v in body.data.vertices],
            weights=weights,
            bones=[dict(name=b.name, parent=indices[b.parent.name] if b.parent else -1, rest=matrix(b.matrix_local)) for b in bones],
            poses=poses)
bpy.context.scene.frame_set(40)
modifier = next(m for m in body.modifiers if m.type == 'ARMATURE')
old_preserve = modifier.use_deform_preserve_volume
modifier.use_deform_preserve_volume = True
bpy.context.view_layer.update()
evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = evaluated.to_mesh()
assert len(mesh.vertices) == len(positions)
data['dualReference40'] = [list(transform @ v.co) for v in mesh.vertices]
evaluated.to_mesh_clear()
modifier.use_deform_preserve_volume = old_preserve
folder = root / 'tests/fixtures'
folder.mkdir(parents=True, exist_ok=True)
(folder / 'hola-volume.json').write_text(json.dumps(data), encoding='utf-8')
for side in ('L', 'R'):
    elbow = rig.data.bones[f'J_Bip_{side}_LowerArm'].head_local
    axis = (rig.data.bones[f'J_Bip_{side}_Hand'].head_local - elbow).normalized()
    region = []
    for p, influences in zip(positions, weights):
        if sum(w for i, w in influences if bones[i].name in (f'J_Bip_{side}_UpperArm', f'J_Bip_{side}_LowerArm')) < .95:
            continue
        delta = p - elbow
        t = delta.dot(axis)
        region.append((t, (delta-axis*t).length))
    print('REST_RADII', side, [(center, round(math.sqrt(sum(r*r for t, r in region if abs(t-center)<.012)/max(1,sum(1 for t,r in region if abs(t-center)<.012))),4)) for center in (-.07,-.04,0,.04,.07)])
print('VOLUME_FIXTURE', len(positions), len(bones))
