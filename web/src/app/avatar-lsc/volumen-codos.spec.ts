import * as THREE from 'three';
import { crearConservadorCodos } from './volumen-codos';

function brazo(estrecho = false) {
  const superior = new THREE.Bone();
  superior.name = 'J_Bip_L_UpperArm';
  const inferior = new THREE.Bone();
  inferior.name = 'J_Bip_L_LowerArm';
  const mano = new THREE.Bone();
  mano.name = 'J_Bip_L_Hand';
  mano.position.y = 0.2;
  superior.add(inferior);
  inferior.add(mano);
  const posiciones: number[] = [];
  const normales: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    posiciones.push((estrecho ? .02 : .03) * Math.cos(a), 0, (estrecho ? .02 : .03) * Math.sin(a));
    normales.push(Math.cos(a), 0, Math.sin(a));
  }
  posiciones.push(0.03, -0.15, 0); // Fuera de la región del codo.
  normales.push(1, 0, 0);
  if (estrecho) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    posiciones.push(.03 * Math.cos(a), .05, .03 * Math.sin(a));
    normales.push(Math.cos(a), 0, Math.sin(a));
  }
  const cantidad = posiciones.length / 3;
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute('normal', new THREE.Float32BufferAttribute(normales, 3));
  geometria.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from({ length: cantidad }, () => [0, 1, 0, 0]).flat(), 4));
  geometria.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: cantidad }, () => [0.5, 0.5, 0, 0]).flat(), 4));
  const malla = new THREE.SkinnedMesh(geometria, new THREE.MeshBasicMaterial());
  malla.add(superior);
  malla.bind(new THREE.Skeleton([superior, inferior, mano]));
  const conservador = crearConservadorCodos(THREE, malla);
  return { malla, inferior, conservador };
}

function anillo(malla: THREE.SkinnedMesh) {
  return Array.from({ length: 16 }, (_, i) => malla.applyBoneTransform(i,
    new THREE.Vector3().fromBufferAttribute(malla.geometry.getAttribute('position'), i)));
}

describe('volumen de los codos', () => {
  it('no vuelve a subir la geometría cuando la pose de los huesos no cambia', () => {
    const { malla, inferior, conservador } = brazo();
    inferior.rotation.z = Math.PI / 2;
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    const posicion = malla.geometry.getAttribute('position') as THREE.BufferAttribute;
    const version = posicion.version;
    const puntos = anillo(malla).map((punto) => punto.toArray());
    for (let i = 0; i < 8; i++) conservador.actualizar();
    expect(posicion.version).toBe(version);
    expect(anillo(malla).map((punto) => punto.toArray())).toEqual(puntos);
    inferior.rotation.z = Math.PI / 3;
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    expect(posicion.version).toBeGreaterThan(version);
  });
  it('mantiene el volumen y coordenadas acotadas incluso al plegar el codo casi 180 grados', () => {
    const { malla, inferior, conservador } = brazo();
    for (const grados of [150, 157, 170, 179, 179.99, 180, 179, 90, 0]) {
      inferior.rotation.z = grados * Math.PI / 180;
      malla.updateMatrixWorld(true);
      conservador.actualizar();
      const puntos = anillo(malla);
      expect(puntos[0].distanceTo(puntos[8])).toBeCloseTo(.06, 5);
      expect(Math.max(...Array.from(malla.geometry.getAttribute('position').array).map(Math.abs))).toBeLessThan(.2);
    }
  });
  it('conserva el grosor también con el giro de orientación global del avatar VRM', () => {
    const { malla, inferior, conservador } = brazo();
    malla.rotation.y = Math.PI;
    malla.position.set(.3, .1, .2);
    inferior.rotation.z = Math.PI / 2;
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    const puntos = anillo(malla);
    expect(puntos[0].distanceTo(puntos[8])).toBeCloseTo(.06, 5);
  });
  it('evita una cintura en el codo tomando como referencia el grosor del antebrazo', () => {
    const { malla, inferior, conservador } = brazo(true);
    inferior.rotation.z = Math.PI / 2;
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    const puntos = anillo(malla);
    expect(puntos[0].distanceTo(puntos[8])).toBeCloseTo(.06, 5);
  });
  it('conserva un diámetro de 6 cm al doblar 90 grados, en lugar de estrechar la articulación', () => {
    const { malla, inferior, conservador } = brazo();
    inferior.rotation.z = Math.PI / 2;
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    const puntos = anillo(malla);
    for (let i = 0; i < 8; i++) {
      expect(puntos[i].distanceTo(puntos[i + 8])).toBeCloseTo(0.06, 5);
    }
  });

  it('conserva el área de la sección también al combinar flexión y torsión', () => {
    const { malla, inferior, conservador } = brazo();
    inferior.rotation.set(0, 1.2, Math.PI / 2);
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    const puntos = anillo(malla);
    const area = new THREE.Vector3();
    for (let i = 0; i < 16; i++) area.add(new THREE.Vector3().crossVectors(puntos[i], puntos[(i + 1) % 16]));
    expect(area.length() / 2).toBeCloseTo(0.00275532, 7);
  });

  it('no acumula deformación al repetir una pose y recupera el reposo sin cambiar el resto del brazo', () => {
    const { malla, inferior, conservador } = brazo();
    const original = Array.from(malla.geometry.getAttribute('position').array);
    inferior.rotation.z = Math.PI / 2;
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    const primera = Array.from(malla.geometry.getAttribute('position').array);
    for (let i = 0; i < 10; i++) conservador.actualizar();
    expect(Array.from(malla.geometry.getAttribute('position').array)).toEqual(primera);
    expect(primera.slice(48)).toEqual(original.slice(48));
    inferior.rotation.set(0, 0, 0);
    malla.updateMatrixWorld(true);
    conservador.actualizar();
    Array.from(malla.geometry.getAttribute('position').array).forEach((v, i) => expect(v).toBeCloseTo(original[i], 7));
    expect(Array.from(malla.geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
  });
});
