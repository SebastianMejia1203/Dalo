import type { BufferAttribute, Matrix4, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three';

export interface ConservadorCodos {
  readonly verticesCorregidos: number;
  actualizar(): void;
}

interface VerticeCodo {
  indice: number;
  posicion: Vector3;
  normal: Vector3 | null;
  mezcla: number;
  influencias: { hueso: number; peso: number; canal: number }[];
  pesosOriginales: number[];
  alternativo: boolean;
  abultamiento: Vector3;
  superior: number;
  inferior: number;
  eje: Vector3;
}

interface Region {
  malla: SkinnedMesh;
  posicion: BufferAttribute;
  normal: BufferAttribute | null;
  pesos: BufferAttribute;
  vertices: VerticeCodo[];
  huesos: Map<number, { matriz: Matrix4; real: Quaternion; dual: Quaternion }>;
  ultimaPose: Float64Array;
  poseInicializada: boolean;
}

/**
 * Conserva el volumen SOLO alrededor de los codos mediante skinning de
 * cuaterniones duales. La geometría recibe la corrección inversa del skinning
 * lineal: Three/MToon siguen dibujando con sus shaders, sombras y contornos.
 * Cada actualización parte del reposo original, nunca del resultado anterior.
 */
export function crearConservadorCodos(
  three: typeof import('three'),
  raiz: Object3D,
): ConservadorCodos {
  const regiones: Region[] = [];
  const inversaBind = new three.Matrix4();
  raiz.updateMatrixWorld(true);
  raiz.traverse((objeto) => {
    if (!(objeto as SkinnedMesh).isSkinnedMesh) return;
    const malla = objeto as SkinnedMesh;
    const geometria = malla.geometry;
    const posiciones = geometria.getAttribute('position');
    const indices = geometria.getAttribute('skinIndex');
    const pesos = geometria.getAttribute('skinWeight');
    const normales = geometria.getAttribute('normal');
    if (!posiciones || !indices || !pesos) return;
    inversaBind.copy(malla.bindMatrix).invert();
    const zonas: { superior: number; inferior: number; codo: Vector3; eje: Vector3;
      perfil: { direccion: Vector3; radio: number }[] }[] = [];
    for (const lado of ['L', 'R']) {
      const superior = malla.skeleton.bones.findIndex((b) => b.name === `J_Bip_${lado}_UpperArm`);
      const inferior = malla.skeleton.bones.findIndex((b) => b.name === `J_Bip_${lado}_LowerArm`);
      const mano = malla.skeleton.bones.findIndex((b) => b.name === `J_Bip_${lado}_Hand`);
      if (superior < 0 || inferior < 0 || mano < 0) continue;
      const codo = new three.Vector3().setFromMatrixPosition(malla.skeleton.boneInverses[inferior].clone().invert()).applyMatrix4(inversaBind);
      const eje = new three.Vector3().setFromMatrixPosition(malla.skeleton.boneInverses[mano].clone().invert()).applyMatrix4(inversaBind).sub(codo).normalize();
      const perfil: { direccion: Vector3; radio: number }[] = [];
      for (let i = 0; i < posiciones.count; i++) {
        let total = 0;
        for (let k = 0; k < 4; k++) {
          const j = indices.getComponent(i, k);
          if (j === superior || j === inferior) total += pesos.getComponent(i, k);
        }
        if (total < .95) continue;
        const delta = new three.Vector3().fromBufferAttribute(posiciones, i).sub(codo);
        const t = delta.dot(eje);
        if (t < .025 || t > .065) continue;
        delta.addScaledVector(eje, -t);
        const radio = delta.length();
        if (radio > .005 && radio < .05) perfil.push({ direccion: delta.normalize(), radio });
      }
      zonas.push({ superior, inferior, codo, eje, perfil });
    }
    const vertices: VerticeCodo[] = [];
    const desplazamiento = new three.Vector3();
    const radial = new three.Vector3();
    for (let i = 0; i < posiciones.count; i++) {
      const posicion = new three.Vector3().fromBufferAttribute(posiciones, i);
      const influencias = [];
      for (let k = 0; k < 4; k++) {
        const peso = pesos.getComponent(i, k);
        if (peso > 1e-7) influencias.push({ hueso: indices.getComponent(i, k), peso, canal: k });
      }
      for (const zona of zonas) {
        const total = influencias.reduce((s, v) => s + (v.hueso === zona.superior || v.hueso === zona.inferior ? v.peso : 0), 0);
        if (total < .95) continue;
        desplazamiento.copy(posicion).sub(zona.codo);
        const t = desplazamiento.dot(zona.eje);
        radial.copy(desplazamiento).addScaledVector(zona.eje, -t);
        if (Math.abs(t) >= .075 || radial.length() > .05) continue;
        const u = Math.min(1, Math.max(0, (.075 - Math.abs(t)) / .035));
        const radio = radial.length();
        const direccion = radial.clone().normalize();
        const cercanos = zona.perfil.filter((s) => s.direccion.dot(direccion) > .85)
          .sort((a, b) => b.direccion.dot(direccion) - a.direccion.dot(direccion)).slice(0, 3);
        const referencia = cercanos.length ? cercanos.reduce((s, v) => s + v.radio, 0) / cercanos.length : radio;
        const distanciaCentro = Math.min(1, Math.abs(t) / .035);
        const transicion = 1 - distanciaCentro * distanciaCentro * (3 - 2 * distanciaCentro);
        // A narrow rest profile still needs a rounded joint under flexion.
        // Match the adjacent forearm's directional radius, with a bounded
        // local bulge that fades out before reaching either arm segment.
        const aumento = Math.min(.01, radio * .6, Math.max(0, referencia - radio)) * transicion;
        vertices.push({ indice: i, posicion,
          normal: normales ? new three.Vector3().fromBufferAttribute(normales, i) : null,
          mezcla: u * u * (3 - 2 * u), influencias,
          pesosOriginales: [0,1,2,3].map((k) => pesos.getComponent(i,k)), alternativo: false,
          abultamiento: direccion.multiplyScalar(aumento), superior: zona.superior,
          inferior: zona.inferior, eje: zona.eje });
        break;
      }
    }
    if (!vertices.length) return;
    malla.geometry = geometria.clone();
    const posicion = new three.Float32BufferAttribute(Array.from(posiciones.array), 3).setUsage(three.DynamicDrawUsage);
    malla.geometry.setAttribute('position', posicion);
    const normal = normales ? new three.Float32BufferAttribute(Array.from(normales.array), 3).setUsage(three.DynamicDrawUsage) : null;
    if (normal) malla.geometry.setAttribute('normal', normal);
    const pesosDibujo = new three.Float32BufferAttribute(Array.from(pesos.array), 4).setUsage(three.DynamicDrawUsage);
    malla.geometry.setAttribute('skinWeight', pesosDibujo);
    const huesos = new Map<number, { matriz: Matrix4; real: Quaternion; dual: Quaternion }>();
    for (const v of vertices) for (const influencia of v.influencias) {
      if (!huesos.has(influencia.hueso)) huesos.set(influencia.hueso,
        { matriz: new three.Matrix4(), real: new three.Quaternion(), dual: new three.Quaternion() });
    }
    for (const v of vertices) for (const indice of [v.superior, v.inferior]) {
      if (!huesos.has(indice)) huesos.set(indice,
        { matriz: new three.Matrix4(), real: new three.Quaternion(), dual: new three.Quaternion() });
    }
    regiones.push({ malla, posicion, normal, pesos: pesosDibujo, vertices, huesos,
      ultimaPose: new Float64Array(huesos.size * 16 + 32), poseInicializada: false });
  });
  const real = new three.Quaternion();
  const dual = new three.Quaternion();
  const conjugado = new three.Quaternion();
  const traslacion = new three.Quaternion();
  const lineal = new three.Matrix4();
  const inversa = new three.Matrix4();
  const linealNormal = new three.Matrix3();
  const inversaNormal = new three.Matrix3();
  const objetivo = new three.Vector3();
  const puntoLineal = new three.Vector3();
  const normalObjetivo = new three.Vector3();
  const normalLineal = new three.Vector3();
  const ejeSuperior = new three.Vector3();
  const ejeInferior = new three.Vector3();

  return {
    verticesCorregidos: regiones.reduce((s, r) => s + r.vertices.length, 0),
    actualizar() {
      raiz.updateMatrixWorld(true);
      for (const region of regiones) {
        const { malla } = region;
        malla.skeleton.update();
        const matrices = malla.skeleton.boneMatrices;
        if (!matrices) continue;
        // La cámara no cambia el skinning. Reutilizar la corrección evita
        // recalcular vértices y subir buffers a la GPU al girar o hacer zoom.
        let cambioPose = !region.poseInicializada;
        let offset = 0;
        for (const indice of region.huesos.keys()) for (let k = 0; k < 16; k++) {
          const valor = matrices[indice * 16 + k];
          if (region.ultimaPose[offset] !== valor) cambioPose = true;
          region.ultimaPose[offset++] = valor;
        }
        for (const bind of [malla.bindMatrix.elements, malla.bindMatrixInverse.elements]) {
          for (const valor of bind) {
            if (region.ultimaPose[offset] !== valor) cambioPose = true;
            region.ultimaPose[offset++] = valor;
          }
        }
        if (!cambioPose) continue;
        let pesosCambiados = false;
        for (const [indice, hueso] of region.huesos) {
          hueso.matriz.fromArray(matrices, indice * 16);
          hueso.matriz.premultiply(malla.bindMatrixInverse).multiply(malla.bindMatrix);
          hueso.real.setFromRotationMatrix(hueso.matriz).normalize();
          const e = hueso.matriz.elements;
          hueso.dual.set(e[12], e[13], e[14], 0).multiply(hueso.real);
          hueso.dual.set(hueso.dual.x * .5, hueso.dual.y * .5, hueso.dual.z * .5, hueso.dual.w * .5);
        }
        for (const vertice of region.vertices) {
          if (vertice.alternativo) {
            for (let k=0; k<4; k++) region.pesos.setComponent(vertice.indice, k, vertice.pesosOriginales[k]);
            vertice.alternativo = false;
            pesosCambiados = true;
          }
          real.set(0, 0, 0, 0);
          dual.set(0, 0, 0, 0);
          lineal.elements.fill(0);
          const referencia = region.huesos.get(vertice.influencias[0].hueso)!.real;
          for (const influencia of vertice.influencias) {
            const hueso = region.huesos.get(influencia.hueso)!;
            const peso = influencia.peso;
            const firmado = peso * (referencia.dot(hueso.real) < 0 ? -1 : 1);
            real.set(real.x + firmado * hueso.real.x, real.y + firmado * hueso.real.y,
              real.z + firmado * hueso.real.z, real.w + firmado * hueso.real.w);
            dual.set(dual.x + firmado * hueso.dual.x, dual.y + firmado * hueso.dual.y,
              dual.z + firmado * hueso.dual.z, dual.w + firmado * hueso.dual.w);
            for (let k = 0; k < 16; k++) lineal.elements[k] += peso * hueso.matriz.elements[k];
          }
          const longitud = real.length();
          if (longitud < 1e-8) {
            region.posicion.setXYZ(vertice.indice, vertice.posicion.x, vertice.posicion.y, vertice.posicion.z);
            continue;
          }
          // Near a 180-degree fold the linear matrix is singular. No inverse
          // can recover volume there. Draw this vertex through one rigid
          // influence instead, with inverse compensation toward the SAME DQ
          // target. This keeps coordinates bounded and the transition smooth.
          const singular = Math.abs(lineal.determinant()) < .04;
          const influenciaDibujo = vertice.influencias[0];
          const matrizDibujo = singular ? region.huesos.get(influenciaDibujo.hueso)!.matriz : lineal;
          if (singular) {
            for (let k=0; k<4; k++) region.pesos.setComponent(vertice.indice,k,k===influenciaDibujo.canal ? 1 : 0);
            vertice.alternativo = true;
            pesosCambiados = true;
          }
          real.normalize();
          dual.set(dual.x / longitud, dual.y / longitud, dual.z / longitud, dual.w / longitud);
          const proyeccion = real.dot(dual);
          dual.set(dual.x - real.x * proyeccion, dual.y - real.y * proyeccion,
            dual.z - real.z * proyeccion, dual.w - real.w * proyeccion);
          conjugado.copy(real).conjugate();
          traslacion.copy(dual).multiply(conjugado);
          ejeSuperior.copy(vertice.eje).applyQuaternion(region.huesos.get(vertice.superior)!.real);
          ejeInferior.copy(vertice.eje).applyQuaternion(region.huesos.get(vertice.inferior)!.real);
          const flexion = Math.acos(Math.min(1, Math.max(-1, ejeSuperior.dot(ejeInferior))));
          const doblado = Math.min(1, Math.max(0, (flexion - .35) / .70));
          const volumen = doblado * doblado * (3 - 2 * doblado);
          objetivo.copy(vertice.posicion).addScaledVector(vertice.abultamiento, volumen).applyQuaternion(real);
          objetivo.x += 2 * traslacion.x;
          objetivo.y += 2 * traslacion.y;
          objetivo.z += 2 * traslacion.z;
          puntoLineal.copy(vertice.posicion).applyMatrix4(lineal);
          objetivo.lerpVectors(puntoLineal, objetivo, vertice.mezcla);
          inversa.copy(matrizDibujo).invert();
          objetivo.applyMatrix4(inversa);
          region.posicion.setXYZ(vertice.indice, objetivo.x, objetivo.y, objetivo.z);
          if (vertice.normal && region.normal) {
            linealNormal.setFromMatrix4(lineal);
            normalLineal.copy(vertice.normal).applyMatrix3(linealNormal);
            normalObjetivo.copy(vertice.normal).applyQuaternion(real);
            normalObjetivo.lerpVectors(normalLineal, normalObjetivo, vertice.mezcla);
            inversaNormal.setFromMatrix4(matrizDibujo).invert();
            normalObjetivo.applyMatrix3(inversaNormal).normalize();
            region.normal.setXYZ(vertice.indice, normalObjetivo.x, normalObjetivo.y, normalObjetivo.z);
          }
        }
        region.posicion.needsUpdate = true;
        if (region.normal) region.normal.needsUpdate = true;
        if (pesosCambiados) region.pesos.needsUpdate = true;
        region.poseInicializada = true;
      }
    },
  };
}
