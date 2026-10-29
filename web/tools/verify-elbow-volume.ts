import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { crearConservadorCodos } from '../src/app/avatar-lsc/volumen-codos.ts';

const folder = path.resolve('data/inspection/hola-volume');
fs.mkdirSync(folder, { recursive: true });
interface Fixture {
  positions: number[][];
  normals: number[][];
  weights: [number, number][][];
  bones: { name: string; parent: number; rest: number[] }[];
  poses: Record<string, number[][]>;
  dualReference40: number[][];
}
const fixture: Fixture = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/hola-volume.json'), 'utf8'));
const root = new THREE.Group();
const bones = fixture.bones.map((b) => {
  const bone = new THREE.Bone();
  bone.name = b.name;
  bone.matrixAutoUpdate = false;
  return bone;
});
const rest = fixture.bones.map((b) => new THREE.Matrix4().fromArray(b.rest));
for (let i = 0; i < bones.length; i++) {
  const parent = fixture.bones[i].parent;
  bones[i].matrix.copy(parent < 0 ? rest[i] : rest[parent].clone().invert().multiply(rest[i]));
  (parent < 0 ? root : bones[parent]).add(bones[i]);
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(fixture.positions.flat(), 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute(fixture.normals.flat(), 3));
geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(fixture.weights.flatMap((w) => [...w.map(([i]) => i), ...Array(4-w.length).fill(0)]), 4));
geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(fixture.weights.flatMap((w) => [...w.map(([,v]) => v), ...Array(4-w.length).fill(0)]), 4));
const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
root.add(mesh);
root.updateMatrixWorld(true);
mesh.bind(new THREE.Skeleton(bones));
const correction = crearConservadorCodos(THREE, root);
const report: Record<string, unknown> = { verticesCorregidos: correction.verticesCorregidos, totalVertices: fixture.positions.length, poses: {} };
const poseReports: Record<string, unknown> = {};
for (const [frame, matrices] of Object.entries(fixture.poses)) {
  const pose = matrices.map((m) => new THREE.Matrix4().fromArray(m));
  for (let i = 0; i < bones.length; i++) {
    const parent = fixture.bones[i].parent;
    bones[i].matrix.copy(parent < 0 ? pose[i] : pose[parent].clone().invert().multiply(pose[i]));
  }
  root.updateMatrixWorld(true);
  const before = fixture.positions.map((p, i) => mesh.applyBoneTransform(i, new THREE.Vector3(...p as [number,number,number])));
  correction.actualizar();
  const after = fixture.positions.map((_, i) => mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), i)));
  const changed = after.map((v, i) => v.distanceTo(before[i]));
  if (!after.every((v) => [...v].every(Number.isFinite))) throw new Error('Non-finite geometry');
  const outside = fixture.weights.map((w, i) => ({ w, i })).filter(({w}) => w.every(([j]) => !/UpperArm|LowerArm/.test(bones[j].name)));
  const maxOutside = Math.max(...outside.map(({i}) => changed[i]));
  if (maxOutside > 1e-6) throw new Error('Unrelated geometry changed');
  poseReports[frame] = { maxCorrectionM: Math.max(...changed), maxUnrelatedDisplacementM: maxOutside };
  fs.writeFileSync(path.join(folder, `posed-${frame}.json`), JSON.stringify({ frame: Number(frame), positions: after.map((v) => v.toArray()) }));
  if (frame === '40') {
    const sections: Record<string, unknown> = {};
    for (const side of ['L','R']) {
      const upper = fixture.bones.findIndex((b) => b.name === `J_Bip_${side}_UpperArm`);
      const lower = fixture.bones.findIndex((b) => b.name === `J_Bip_${side}_LowerArm`);
      const hand = fixture.bones.findIndex((b) => b.name === `J_Bip_${side}_Hand`);
      const center = new THREE.Vector3().setFromMatrixPosition(rest[lower]);
      const axis = new THREE.Vector3().setFromMatrixPosition(rest[hand]).sub(center).normalize();
      const a = axis.clone().transformDirection(pose[upper].clone().multiply(rest[upper].clone().invert()));
      const b = axis.clone().transformDirection(pose[lower].clone().multiply(rest[lower].clone().invert()));
      const n = new THREE.Vector3().crossVectors(a,b).normalize();
      const p = new THREE.Vector3().crossVectors(n,a.clone().add(b).normalize()).normalize();
      const ids = fixture.positions.map((v,i) => ({ v: new THREE.Vector3(...v as [number,number,number]), i }))
        .filter(({v,i}) => Math.abs(v.sub(center).dot(axis)) < .0145 && fixture.weights[i].reduce((s,[j,w]) => s + (j===upper || j===lower ? w : 0),0) > .95).map(({i}) => i);
      const widths = (points: THREE.Vector3[]) => [n,p].map((direction) => {
        const values=ids.map((i) => points[i].dot(direction));
        return Math.max(...values)-Math.min(...values);
      });
      sections[side] = { samples: ids.length, beforeM: widths(before), afterM: widths(after) };
    }
    report['elbowSection40'] = sections;
    const original = geometry.getAttribute('position');
    const corrected = mesh.geometry.getAttribute('position');
    const coreErrors: number[] = [];
    const referenceDifferences: number[] = [];
    // Core samples that changed should agree with Blender's independent
    // preserve-volume implementation; taper samples intentionally blend LBS.
    for (let i=0; i<after.length; i++) {
      if (changed[i] > .001) {
        const target = new THREE.Vector3(...fixture.dualReference40[i] as [number,number,number]);
        const error = after[i].distanceTo(target);
        referenceDifferences.push(error);
        if (error < 1e-5) coreErrors.push(error);
      }
    }
    report['samplesMatchingIndependentDualSkinning'] = coreErrors.length;
    report['maxMatchingSampleErrorM'] = Math.max(0, ...coreErrors);
    report['maxDifferenceFromIndependentVolumeSkinningM'] = Math.max(0, ...referenceDifferences);
    report['maxRestSpaceCorrectionM'] = Math.max(...fixture.positions.map((_,i) => new THREE.Vector3().fromBufferAttribute(original,i).distanceTo(new THREE.Vector3().fromBufferAttribute(corrected,i))));
    // The central profile correction rounds the elbow toward the adjoining
    // forearm radius; unlike pure DQ it need not equal Blender's result.
    if (Math.max(0, ...referenceDifferences) > .015) throw new Error('Elbow profile deviates too far from independent volume skinning');
  }
}
report['poses'] = poseReports;
fs.writeFileSync(path.join(folder, 'renderer-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
