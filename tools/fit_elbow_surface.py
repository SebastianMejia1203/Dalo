"""Fit a portable rest-mesh correction to elbow surfaces in several poses.

Run in Blender with tools/assets/avatar-pesos.blend. No animation changes.
The fit smooths the posed surface, then solves small rest-position corrections
across multiple poses. Changes are localized and original files are preserved.
"""
import json
import math
import struct
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parents[1]
rig, body = bpy.data.objects['Armature'], bpy.data.objects['Body']
mesh = body.data
original = [v.co.copy() for v in mesh.vertices]
coords = [p.copy() for p in original]
to_rig = rig.matrix_world.inverted() @ body.matrix_world
groups = {g.index: g.name for g in body.vertex_groups}
weights = [{groups[g.group]: g.weight for g in v.groups if g.weight > 1e-7}
           for v in mesh.vertices]
position_groups = {}
for i, p in enumerate(original):
    position_groups.setdefault(tuple(round(c, 5) for c in p), []).append(i)
weld = {i: indices[0] for indices in position_groups.values() for i in indices}
neighbors = {i: set() for i in range(len(coords))}
for edge in mesh.edges:
    a, b = (weld[i] for i in edge.vertices)
    if a != b:
        neighbors[a].add(b)
        neighbors[b].add(a)
active = {}
for i, p in enumerate(original):
    for side in ('R', 'L'):
        elbow = rig.data.bones[f'J_Bip_{side}_LowerArm'].head_local
        axis = (rig.data.bones[f'J_Bip_{side}_Hand'].head_local - elbow).normalized()
        delta = to_rig @ p - elbow
        t = delta.dot(axis)
        combined = sum(weights[i].get(f'J_Bip_{side}_{part}', 0) for part in ('UpperArm', 'LowerArm'))
        if combined > .95 and abs(t) < .07 and (delta - axis * t).length < .045:
            active[weld[i]] = min(1.0, (.07 - abs(t)) / .025)

needed = set(active)
for i in active:
    needed.update(neighbors[i])
frames = (1, 15, 22, 30, 38, 54, 61, 71)
poses = []
for frame in frames:
    bpy.context.scene.frame_set(frame)
    transforms = {name: body.matrix_world.inverted() @ rig.matrix_world @ bone.matrix
                  @ bone.bone.matrix_local.inverted() @ to_rig
                  for name, bone in rig.pose.bones.items()}
    skin = {}
    for i in needed:
        m = Matrix(((0., 0., 0., 0.),) * 4)
        total = sum(w for name, w in weights[i].items() if name in transforms)
        for name, weight in weights[i].items():
            if name in transforms:
                m += transforms[name] * (weight / total)
        skin[i] = m
    poses.append(skin)

for iteration in range(8):
    systems = {i: (Matrix.Identity(3) * 3.0, -(coords[i] - original[i]) * 3.0) for i in active}
    for skin in poses:
        posed = {i: skin[i] @ coords[i] for i in needed}
        for i, taper in active.items():
            average = sum((posed[j] for j in neighbors[i]), Vector()) / len(neighbors[i])
            delta = (average - posed[i]) * .6 * taper
            if delta.length > .003:
                delta *= .003 / delta.length
            a = skin[i].to_3x3()
            normal, rhs = systems[i]
            systems[i] = (normal + a.transposed() @ a, rhs + a.transposed() @ delta)
    new = [p.copy() for p in coords]
    for i, (normal, rhs) in systems.items():
        p = coords[i] + normal.inverted() @ rhs
        shift = p - original[i]
        if shift.length > .008:
            p = original[i] + shift.normalized() * .008
        for j in position_groups[tuple(round(c, 5) for c in original[i])]:
            new[j] = p.copy()
    coords = new
for v, p in zip(mesh.vertices, coords):
    v.co = p
mesh.update()
max_shift = max((a - b).length for a, b in zip(original, coords))
assert max_shift <= .00801
assert all(all(math.isfinite(c) for c in p) for p in coords)

# Patch POSITION/NORMAL only in a copy of the VRM already carrying elbow weights.
source = (root / 'web/public/avatar/avatar-sample-1-codos.vrm').read_bytes()
data = bytearray(source)
length = struct.unpack_from('<I', data, 12)[0]
model = json.loads(data[20:20 + length])
binary = 20 + length + 8
node = next(n for n in model['nodes'] if 'mesh' in n and model['meshes'][n['mesh']]['name'] == 'Body.baked')
attrs = model['meshes'][node['mesh']]['primitives'][0]['attributes']
def accessor(name):
    a = model['accessors'][attrs[name]]
    view = model['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126 and a['type'] == 'VEC3'
    return a['count'], binary + view.get('byteOffset', 0) + a.get('byteOffset', 0), view.get('byteStride', 12)
count, offset, stride = accessor('POSITION')
_, noffset, nstride = accessor('NORMAL')
mask = bytearray(len(data))
changed = 0
for i in range(count):
    x, y, z = struct.unpack_from('<fff', source, offset + stride * i)
    key = tuple(round(c, 5) for c in (x, -z, y))
    if key not in position_groups:
        j = min(range(len(original)), key=lambda j: math.dist(original[j], (x, -z, y)))
        assert math.dist(original[j], (x, -z, y)) < 2e-5
    else:
        j = position_groups[key][0]
    moved = (coords[j] - original[j]).length >= 1e-8
    if not moved and weld[j] not in needed:
        continue
    p, n = coords[j], mesh.vertices[j].normal
    if moved:
        struct.pack_into('<fff', data, offset + stride * i, p.x, p.z, -p.y)
        mask[offset + stride * i:offset + stride * i + 12] = b'\x01' * 12
        changed += 1
    struct.pack_into('<fff', data, noffset + nstride * i, n.x, n.z, -n.y)
    mask[noffset + nstride * i:noffset + nstride * i + 12] = b'\x01' * 12
assert changed > 100
assert all(a == b or mask[i] for i, (a, b) in enumerate(zip(source, data)))
target = root / 'web/public/avatar/avatar-sample-1-superficie-codos.vrm'
target.write_bytes(data)
bpy.context.scene.frame_set(1)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.overlay.show_overlays = False
out = root / 'tools/assets/avatar-superficie.blend'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(out))
report = dict(frames=list(frames), changed_vertices=changed, max_rest_shift_m=max_shift,
              model=str(target), blend=str(out), method='Multi-pose local surface fit; fixed bones, animation and topology')
(root / 'data/inspection').mkdir(parents=True, exist_ok=True)
(root / 'data/inspection/elbow-surface-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('ELBOW_SURFACE_RESULT', json.dumps(report))
