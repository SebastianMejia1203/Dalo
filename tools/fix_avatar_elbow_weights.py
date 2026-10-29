"""Smooth elbow weights and patch a separate VRM, preserving the original.

Run with Blender --background bienvenido.blend --python
tools/fix_avatar_elbow_weights.py. Only the reviewed elbow weights change.
"""
from pathlib import Path
import json
import math
import struct
import bpy
from mathutils import Vector

rig = bpy.data.objects['Armature']
body = bpy.data.objects['Body']
transform = rig.matrix_world.inverted() @ body.matrix_world
changed = 0
for side in ('R', 'L'):
    upper = body.vertex_groups[f'J_Bip_{side}_UpperArm']
    lower = body.vertex_groups[f'J_Bip_{side}_LowerArm']
    elbow = rig.data.bones[f'J_Bip_{side}_LowerArm'].head_local
    axis = (rig.data.bones[f'J_Bip_{side}_Hand'].head_local - elbow).normalized()
    for vertex in body.data.vertices:
        weights = {g.group: g.weight for g in vertex.groups}
        total = weights.get(upper.index, 0) + weights.get(lower.index, 0)
        delta = transform @ vertex.co - elbow
        t = delta.dot(axis)
        radius = (delta - axis * t).length
        if total < .95 or abs(t) > .07 or radius > .045:
            continue
        u = min(1, max(0, (t + .04) / .08))
        target = u * u * (3 - 2 * u)
        blend = min(1, max(0, (.07 - abs(t)) / .025))
        low = weights.get(lower.index, 0) * (1 - blend) + total * target * blend
        upper.add([vertex.index], total - low, 'REPLACE')
        lower.add([vertex.index], low, 'REPLACE')
        changed += 1
out = Path(__file__).resolve().parents[1] / 'tools/assets/avatar-pesos.blend'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print('ELBOW_WEIGHT_VERTICES', changed)

# Patch only the original VRM's skinning buffers. Keep its geometry, skeleton,
# materials, metadata, rest pose and VRM version byte-for-byte unchanged.
root = Path(__file__).resolve().parents[1]
original = (root / 'web/public/avatar/avatar-sample-1.vrm').read_bytes()
data = bytearray(original)
json_length = struct.unpack_from('<I', data, 12)[0]
model = json.loads(data[20:20 + json_length])
binary_start = 20 + json_length + 8
node = next(n for n in model['nodes'] if 'mesh' in n and model['meshes'][n['mesh']]['name'] == 'Body.baked')
skin = model['skins'][node['skin']]
joint_indices = {model['nodes'][n]['name']: i for i, n in enumerate(skin['joints'])}
attributes = model['meshes'][node['mesh']]['primitives'][0]['attributes']

def accessor(name):
    a = model['accessors'][attributes[name]]
    view = model['bufferViews'][a['bufferView']]
    fmt = {5126: 'f', 5123: 'H', 5121: 'B'}[a['componentType']]
    width = {'VEC3': 3, 'VEC4': 4}[a['type']]
    offset = binary_start + view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', struct.calcsize('<' + fmt * width))
    return a, '<' + fmt * width, offset, stride

pa, pf, po, ps = accessor('POSITION')
wa, wf, wo, ws = accessor('WEIGHTS_0')
ja, jf, jo, js = accessor('JOINTS_0')
assert wf == '<ffff', 'Expected non-normalized float weights'
weights_by_position = {}
for vertex in body.data.vertices:
    influences = sorted(((g.weight, body.vertex_groups[g.group].name)
                         for g in vertex.groups if g.weight > 1e-7), reverse=True)[:4]
    weights_by_position[tuple(round(c, 5) for c in vertex.co)] = influences
matches = changed_export = 0
permitted_ranges = []
for i in range(pa['count']):
    x, y, z = struct.unpack_from(pf, data, po + i * ps)
    key = tuple(round(c, 5) for c in (x, -z, y))
    influences = weights_by_position.get(key)
    if influences is None:
        nearest = min(body.data.vertices, key=lambda v: math.dist(v.co, (x, -z, y)))
        assert math.dist(nearest.co, (x, -z, y)) < 2e-5, (i, x, y, z)
        influences = weights_by_position[tuple(round(c, 5) for c in nearest.co)]
    matches += 1
    old_weights = struct.unpack_from(wf, data, wo + i * ws)
    old_joints = struct.unpack_from(jf, data, jo + i * js)
    old = {}
    for j, w in zip(old_joints, old_weights):
        if w > 1e-7:
            joint = skin['joints'][j]
            old[joint] = old.get(joint, 0.0) + w
    # Only alter vertices in the reviewed elbow region, not unrelated weights
    # whose ordering/import rounding may differ from Blender's representation.
    p = transform @ Vector((x, -z, y))
    relevant = False
    for side in ('R', 'L'):
        elbow = rig.data.bones[f'J_Bip_{side}_LowerArm'].head_local
        axis = (rig.data.bones[f'J_Bip_{side}_Hand'].head_local - elbow).normalized()
        delta = p - elbow
        t = delta.dot(axis)
        combined = sum(w for j, w in old.items() if model['nodes'][j]['name'] in
                       (f'J_Bip_{side}_UpperArm', f'J_Bip_{side}_LowerArm'))
        if abs(t) <= .07 and (delta - axis * t).length <= .045 and combined >= .95:
            relevant = True
    if not relevant:
        continue
    total = sum(w for w, _ in influences)
    assert .999 < total < 1.001
    weights = [w / total for w, _ in influences]
    joints = [joint_indices[name] for _, name in influences]
    weights += [0.0] * (4 - len(weights))
    joints += [0] * (4 - len(joints))
    struct.pack_into(wf, data, wo + i * ws, *weights)
    struct.pack_into(jf, data, jo + i * js, *joints)
    permitted_ranges.extend(((wo + i * ws, struct.calcsize(wf)), (jo + i * js, struct.calcsize(jf))))
    changed_export += 1
assert matches == pa['count'], (matches, pa['count'])
print('EXPORT_REGION_COUNT', changed_export)
assert changed_export > 100
mask = bytearray(len(data))
for start, size in permitted_ranges:
    mask[start:start + size] = b'\x01' * size
assert all(a == b or mask[i] for i, (a, b) in enumerate(zip(original, data))), 'Unexpected changes outside skinning buffers'
target = root / 'web/public/avatar/avatar-sample-1-codos.vrm'
target.write_bytes(data)
print('PATCHED_VRM', str(target), 'VERTICES', changed_export, 'MATCHED', matches)
