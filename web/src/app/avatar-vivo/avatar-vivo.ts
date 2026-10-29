import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { FotogramaAvatar, PuntoAvatar } from '../avatar-lsc/avatar-lsc';
import { URL_MODELO_AVATAR } from '../avatar-lsc/modelo-avatar';

type ModuloThree = typeof import('three');
type ModuloOrbit = typeof import('three/addons/controls/OrbitControls.js');

type GrupoPuntos = 'pose' | 'izquierda' | 'derecha';

interface DescansoHueso {
  direccion: Vector3;
  local: InstanceType<ModuloThree['Quaternion']>;
}

/**
 * Referencias anatómicas del rig, capturadas antes de animarlo.
 */
const HIJO_PRINCIPAL: Partial<Record<VRMHumanBoneName, VRMHumanBoneName>> = {
  hips: 'spine',
  spine: 'chest',
  chest: 'neck',
  neck: 'head',
  leftShoulder: 'leftUpperArm',
  rightShoulder: 'rightUpperArm',
  leftUpperArm: 'leftLowerArm',
  rightUpperArm: 'rightLowerArm',
  leftLowerArm: 'leftHand',
  rightLowerArm: 'rightHand',
  leftHand: 'leftMiddleProximal',
  rightHand: 'rightMiddleProximal',
  leftUpperLeg: 'leftLowerLeg',
  rightUpperLeg: 'rightLowerLeg',
  leftLowerLeg: 'leftFoot',
  rightLowerLeg: 'rightFoot',
  leftFoot: 'leftToes',
  rightFoot: 'rightToes',
  leftThumbMetacarpal: 'leftThumbProximal',
  leftThumbProximal: 'leftThumbDistal',
  rightThumbMetacarpal: 'rightThumbProximal',
  rightThumbProximal: 'rightThumbDistal',
  leftIndexProximal: 'leftIndexIntermediate',
  leftIndexIntermediate: 'leftIndexDistal',
  rightIndexProximal: 'rightIndexIntermediate',
  rightIndexIntermediate: 'rightIndexDistal',
  leftMiddleProximal: 'leftMiddleIntermediate',
  leftMiddleIntermediate: 'leftMiddleDistal',
  rightMiddleProximal: 'rightMiddleIntermediate',
  rightMiddleIntermediate: 'rightMiddleDistal',
  leftRingProximal: 'leftRingIntermediate',
  leftRingIntermediate: 'leftRingDistal',
  rightRingProximal: 'rightRingIntermediate',
  rightRingIntermediate: 'rightRingDistal',
  leftLittleProximal: 'leftLittleIntermediate',
  leftLittleIntermediate: 'leftLittleDistal',
  rightLittleProximal: 'rightLittleIntermediate',
  rightLittleIntermediate: 'rightLittleDistal',
};

const DEDOS: Array<{
  nombre: string;
  segmentos: [string, string, string];
  articulaciones: [number, number, number, number];
}> = [
  { nombre: 'Thumb', segmentos: ['Metacarpal', 'Proximal', 'Distal'], articulaciones: [1, 2, 3, 4] },
  { nombre: 'Index', segmentos: ['Proximal', 'Intermediate', 'Distal'], articulaciones: [5, 6, 7, 8] },
  { nombre: 'Middle', segmentos: ['Proximal', 'Intermediate', 'Distal'], articulaciones: [9, 10, 11, 12] },
  { nombre: 'Ring', segmentos: ['Proximal', 'Intermediate', 'Distal'], articulaciones: [13, 14, 15, 16] },
  { nombre: 'Little', segmentos: ['Proximal', 'Intermediate', 'Distal'], articulaciones: [17, 18, 19, 20] },
];

/**
 * Avatar de cámara independiente: instancia 3D propia (no comparte VRM ni
 * escena con el avatar del catálogo). Tronco y piernas estables; brazos,
 * manos y cabeza con seguimiento. La cabeza se calibra mirando al frente.
 */
@Component({
  selector: 'app-avatar-vivo',
  imports: [LucideAngularModule],
  templateUrl: './avatar-vivo.html',
  styleUrl: './avatar-vivo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarVivo implements OnDestroy {
  readonly fotograma = input<FotogramaAvatar | null>(null);
  readonly nombre = input('en vivo');

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly modeloListo = signal(false);
  protected readonly sinWebgl = signal(false);
  protected readonly cabezaCalibrada = signal(false);
  protected readonly etiquetaCanvas = computed(
    () => `Avatar de cámara en vivo ${this.nombre() || ''}`.trim(),
  );

  private readonly lienzoRef = viewChild<ElementRef<HTMLCanvasElement>>('lienzoVivo');
  private three: ModuloThree | null = null;
  private renderer: WebGLRenderer | null = null;
  private escena: Scene | null = null;
  private camara: PerspectiveCamera | null = null;
  private controles: OrbitControls | null = null;
  private vistaInicial: { posicion: Vector3; objetivo: Vector3 } | null = null;
  private vrm: VRM | null = null;
  private lienzoRender: HTMLCanvasElement | null = null;
  private inicioEscena: Promise<void> | null = null;
  private huesos = new Map<VRMHumanBoneName, Object3D>();
  private descansos = new Map<VRMHumanBoneName, DescansoHueso>();
  private uLocalPalma: { left: Vector3; right: Vector3 } | null = null;
  private reposoCapturado = false;
  private referenciaCabeza: InstanceType<ModuloThree['Quaternion']> | null = null;
  private puntosRecientes = new Map<GrupoPuntos, Array<{ punto: PuntoAvatar; t: number } | null>>();

  protected calibrarCabeza(): void {
    this.referenciaCabeza = null;
    this.cabezaCalibrada.set(false);
  }

  constructor() {
    effect(() => {
      const fotograma = this.fotograma();
      const lienzo = this.lienzoRef()?.nativeElement ?? null;
      if (!lienzo) return;
      void this.asegurarEscena(lienzo).then(() => {
        if (!this.vrm) return;
        if (fotograma) this.actualizar(fotograma);
        else this.render();
      });
    });
  }

  ngOnDestroy(): void {
    this.controles?.dispose();
    this.controles = null;
    const renderer = this.renderer;
    this.renderer = null;
    this.lienzoRender = null;
    if (renderer) {
      try {
        renderer.dispose();
      } catch {
        // Liberación oportunista.
      }
      try {
        renderer.forceContextLoss();
      } catch {
        // Liberación oportunista.
      }
    }
    this.escena = null;
    this.vrm = null;
  }

  protected acercar(): void {
    this.dolly(0.8);
  }

  protected alejar(): void {
    this.dolly(1.25);
  }

  protected girarIzquierda(): void {
    this.girar(Math.PI / 12);
  }

  protected girarDerecha(): void {
    this.girar(-Math.PI / 12);
  }

  protected restablecerVista(): void {
    const camara = this.camara;
    const vista = this.vistaInicial;
    if (!camara || !vista) return;
    camara.position.copy(vista.posicion);
    this.controles?.target.copy(vista.objetivo);
    this.controles?.update();
    this.dibujarEscena();
  }

  private dolly(factor: number): void {
    const camara = this.camara;
    const controles = this.controles;
    if (!camara || !controles) return;
    const distancia = camara.position.distanceTo(controles.target) * factor;
    const siguiente = Math.min(Math.max(distancia, controles.minDistance), controles.maxDistance);
    const direccion = camara.position.clone().sub(controles.target).normalize();
    camara.position.copy(controles.target).addScaledVector(direccion, siguiente);
    this.render();
  }

  private girar(angulo: number): void {
    const camara = this.camara;
    const controles = this.controles;
    const three = this.three;
    if (!camara || !controles || !three) return;
    const desplazamiento = camara.position.clone().sub(controles.target);
    desplazamiento.applyAxisAngle(new three.Vector3(0, 1, 0), angulo);
    camara.position.copy(controles.target).add(desplazamiento);
    this.render();
  }

  private render(): void {
    this.controles?.update();
    this.dibujarEscena();
  }

  private dibujarEscena(): void {
    if (!this.escena || !this.renderer || !this.camara) return;
    this.renderer.render(this.escena, this.camara);
  }

  private asegurarEscena(lienzo: HTMLCanvasElement): Promise<void> {
    if (this.vrm && this.lienzoRender === lienzo) return Promise.resolve();
    if (this.inicioEscena) return this.inicioEscena;
    this.inicioEscena = (async () => {
      try {
        const [three, vrmModulo, gltfModulo, orbitModulo] = await Promise.all([
          import('three'),
          import('@pixiv/three-vrm'),
          import('three/addons/loaders/GLTFLoader.js'),
          import('three/addons/controls/OrbitControls.js'),
        ]);
        const cargador = new gltfModulo.GLTFLoader();
        cargador.register((parser) => new vrmModulo.VRMLoaderPlugin(parser));
        const respuesta = await fetch(URL_MODELO_AVATAR);
        if (!respuesta.ok) throw new Error(`Modelo no disponible: ${respuesta.status}`);
        const datos = await respuesta.arrayBuffer();
        const gltf = await cargador.parseAsync(datos, '');
        const vrm = gltf.userData['vrm'] as VRM | undefined;
        if (!vrm) throw new Error('El archivo no contiene un VRM válido.');
        vrmModulo.VRMUtils.rotateVRM0(vrm);
        vrm.scene.updateMatrixWorld(true);
        this.three = three;
        this.vrm = vrm;
        // Escena propia: independiente del avatar del catálogo.
        const escena = new three.Scene();
        escena.background = new three.Color(0xffffff);
        escena.add(new three.HemisphereLight(0xffffff, 0xdfe8f0, 1.5));
        const clave = new three.DirectionalLight(0xffffff, 1.6);
        clave.position.set(2, 3, 4);
        escena.add(clave);
        const relleno = new three.DirectionalLight(0xeaf2ff, 0.6);
        relleno.position.set(-3, 1, 2);
        escena.add(relleno);
        escena.add(vrm.scene);
        this.escena = escena;
        this.construirEscena(three, orbitModulo, lienzo);
        this.modeloListo.set(true);
        this.estado.set('listo');
      } catch {
        this.estado.set('error');
        this.sinWebgl.set(true);
      } finally {
        this.inicioEscena = null;
      }
    })();
    return this.inicioEscena;
  }

  private construirEscena(three: ModuloThree, orbitModulo: ModuloOrbit, lienzo: HTMLCanvasElement): void {
    this.controles?.dispose();
    this.controles = null;
    const anterior = this.renderer;
    this.renderer = null;
    this.lienzoRender = null;
    if (anterior) {
      try {
        anterior.dispose();
      } catch {
        // Liberación oportunista.
      }
      try {
        anterior.forceContextLoss();
      } catch {
        // Liberación oportunista.
      }
    }
    const renderer = new three.WebGLRenderer({ canvas: lienzo, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(lienzo.width, lienzo.height, false);
    this.renderer = renderer;
    this.lienzoRender = lienzo;
    const camara = new three.PerspectiveCamera(32, lienzo.width / lienzo.height, 0.1, 100);
    this.camara = camara;
    const vrm = this.vrm;
    if (!vrm) throw new Error('Modelo 3D no disponible.');
    vrm.scene.updateMatrixWorld(true);
    this.capturarHuesos(vrm);
    this.encuadrarCuerpoCompleto(three, vrm);
    const controles = new orbitModulo.OrbitControls(camara, lienzo);
    const distancia = this.vistaInicial
      ? camara.position.distanceTo(this.vistaInicial.objetivo)
      : 2;
    controles.target.copy(this.vistaInicial?.objetivo ?? new three.Vector3(0, 0, 0));
    controles.enableDamping = true;
    controles.dampingFactor = 0.08;
    controles.minDistance = distancia * 0.4;
    controles.maxDistance = distancia * 3;
    controles.minPolarAngle = 0.2;
    controles.maxPolarAngle = Math.PI * 0.75;
    controles.addEventListener('change', () => {
      this.dibujarEscena();
    });
    this.controles = controles;
  }

  private capturarHuesos(vrm: VRM): void {
    const three = this.three!;
    if (this.reposoCapturado) {
      this.huesos.clear();
      for (const nombre of Object.keys(HIJO_PRINCIPAL) as VRMHumanBoneName[]) {
        const nodo = vrm.humanoid?.getNormalizedBoneNode(nombre);
        if (nodo) this.huesos.set(nombre, nodo);
      }
      return;
    }
    this.huesos.clear();
    this.descansos.clear();
    for (const nombre of Object.keys(HIJO_PRINCIPAL) as VRMHumanBoneName[]) {
      const nodo = vrm.humanoid?.getNormalizedBoneNode(nombre);
      if (nodo) this.huesos.set(nombre, nodo);
    }
    for (const [nombre, hijo] of Object.entries(HIJO_PRINCIPAL) as Array<
      [VRMHumanBoneName, VRMHumanBoneName]
    >) {
      const nodo = this.huesos.get(nombre);
      const nodoHijo = vrm.humanoid?.getNormalizedBoneNode(hijo);
      if (!nodo || !nodoHijo || !nodo.parent) continue;
      const posHueso = new three.Vector3();
      const posHijo = new three.Vector3();
      nodo.getWorldPosition(posHueso);
      nodoHijo.getWorldPosition(posHijo);
      const cuaternionPadre = new three.Quaternion();
      nodo.parent.getWorldQuaternion(cuaternionPadre);
      const direccion = posHijo.sub(posHueso).normalize().applyQuaternion(cuaternionPadre.invert());
      this.descansos.set(nombre, { direccion, local: nodo.quaternion.clone() });
    }
    const sinHijo: Array<[VRMHumanBoneName, VRMHumanBoneName]> = [
      ['head', 'neck'],
      ['leftToes', 'leftFoot'],
      ['rightToes', 'rightFoot'],
      ['leftThumbDistal', 'leftThumbProximal'],
      ['rightThumbDistal', 'rightThumbProximal'],
      ['leftIndexDistal', 'leftIndexIntermediate'],
      ['rightIndexDistal', 'rightIndexIntermediate'],
      ['leftMiddleDistal', 'leftMiddleIntermediate'],
      ['rightMiddleDistal', 'rightMiddleIntermediate'],
      ['leftRingDistal', 'leftRingIntermediate'],
      ['rightRingDistal', 'rightRingIntermediate'],
      ['leftLittleDistal', 'leftLittleIntermediate'],
      ['rightLittleDistal', 'rightLittleIntermediate'],
    ];
    for (const [nombre, padre] of sinHijo) {
      const nodo = vrm.humanoid?.getNormalizedBoneNode(nombre);
      const descansoPadre = this.descansos.get(padre);
      if (!nodo || !descansoPadre) continue;
      this.huesos.set(nombre, nodo);
      this.descansos.set(nombre, {
        direccion: descansoPadre.direccion.clone(),
        local: nodo.quaternion.clone(),
      });
    }
    this.calibrarEjePalma(vrm);
    this.reposoCapturado = true;
  }

  private calibrarEjePalma(vrm: VRM): void {
    const three = this.three!;
    const ejes = {} as { left: Vector3; right: Vector3 };
    for (const lado of ['left', 'right'] as const) {
      const mano = vrm.humanoid?.getNormalizedBoneNode(`${lado}Hand` as VRMHumanBoneName);
      const indice = vrm.humanoid?.getNormalizedBoneNode(`${lado}IndexProximal` as VRMHumanBoneName);
      const menique = vrm.humanoid?.getNormalizedBoneNode(`${lado}LittleProximal` as VRMHumanBoneName);
      if (!mano || !indice || !menique) continue;
      const pMano = new three.Vector3();
      const pIndice = new three.Vector3();
      const pMenique = new three.Vector3();
      mano.getWorldPosition(pMano);
      indice.getWorldPosition(pIndice);
      menique.getWorldPosition(pMenique);
      const normal = new three.Vector3()
        .subVectors(pIndice, pMano)
        .cross(new three.Vector3().subVectors(pMenique, pMano));
      if (normal.length() < 1e-6) continue;
      const qMundo = new three.Quaternion();
      mano.getWorldQuaternion(qMundo);
      ejes[lado] = normal.normalize().applyQuaternion(qMundo.invert());
    }
    if (ejes.left && ejes.right) {
      this.uLocalPalma = { left: ejes.left, right: ejes.right };
    }
  }

  private encuadrarCuerpoCompleto(three: ModuloThree, vrm: VRM): void {
    if (!this.camara) return;
    const caja = new three.Box3().setFromObject(vrm.scene);
    const tamano = new three.Vector3();
    caja.getSize(tamano);
    // Cuerpo completo con margen, sin recorte de cintura.
    const alturaVisible = tamano.y * 1.05;
    const distancia = alturaVisible / 2 / Math.tan(((this.camara.fov / 2) * Math.PI) / 180);
    const centroX = caja.min.x + tamano.x / 2;
    const objetivo = new three.Vector3(
      centroX,
      caja.min.y + tamano.y * 0.5,
      caja.min.z + tamano.z / 2,
    );
    this.camara.position.set(centroX, objetivo.y, caja.max.z + distancia);
    this.camara.lookAt(objetivo);
    this.vistaInicial = { posicion: this.camara.position.clone(), objetivo };
  }

  private aVector(punto: PuntoAvatar): Vector3 {
    const three = this.three!;
    const valor = this.fotograma()?.aspecto ?? 4 / 3;
    const aspecto = Number.isFinite(valor) && valor > 0 ? valor : 4 / 3;
    // Solo importan las direcciones (hacia - desde): la traslación se
    // cancela, así que el origen fijo basta para cuerpo completo.
    return new three.Vector3(
      (punto[0] - 0.5) * aspecto * 2,
      -(punto[1] - 0.5) * 2,
      -punto[2] * aspecto * 2,
    );
  }

  private puntosDe(fotograma: FotogramaAvatar, grupo: GrupoPuntos): (Vector3 | null)[] {
    const crudos =
      grupo === 'pose' ? fotograma.pose : grupo === 'izquierda' ? fotograma.manoIzquierda : fotograma.manoDerecha;
    const anteriores = this.puntosRecientes.get(grupo) ?? [];
    const ahora = performance.now();
    const actuales = Array.from({ length: Math.max(crudos?.length ?? 0, anteriores.length) }, (_, i) => {
      const punto = crudos?.[i];
      if (punto && punto.every(Number.isFinite)) return { punto: [...punto] as PuntoAvatar, t: ahora };
      const anterior = anteriores[i];
      return anterior && ahora - anterior.t < 150 ? anterior : null;
    });
    this.puntosRecientes.set(grupo, actuales);
    // Retención solo visual: nunca modifica el fotograma del reconocedor.
    return actuales.map((dato) => dato ? this.aVector(dato.punto) : null);
  }

  private apuntar(nombre: VRMHumanBoneName, desde: Vector3 | null, hacia: Vector3 | null): void {
    const nodo = this.huesos.get(nombre);
    const descanso = this.descansos.get(nombre);
    if (!nodo || !descanso || !nodo.parent) return;
    // Sin brazo visible: baja suavemente, evitando la pose T del archivo.
    if (!desde || !hacia) {
      if (nombre.endsWith('UpperArm') || nombre.endsWith('LowerArm')) {
        const three = this.three!;
        const padre = new three.Quaternion();
        nodo.parent.getWorldQuaternion(padre);
        const abajo = new three.Vector3(0, -1, .08).normalize().applyQuaternion(padre.invert());
        const objetivo = new three.Quaternion().setFromUnitVectors(descanso.direccion, abajo).multiply(descanso.local);
        nodo.quaternion.slerp(objetivo, .15);
      } else {
        nodo.quaternion.slerp(descanso.local, .2);
      }
      return;
    }
    const three = this.three!;
    const objetivo = new three.Vector3().subVectors(hacia, desde);
    if (objetivo.length() < 0.001) return;
    objetivo.normalize();
    nodo.updateWorldMatrix(true, false);
    const cuaternionPadre = new three.Quaternion();
    nodo.parent.getWorldQuaternion(cuaternionPadre);
    objetivo.applyQuaternion(cuaternionPadre.invert());
    const giro = new three.Quaternion().setFromUnitVectors(descanso.direccion, objetivo);
    nodo.quaternion.copy(giro.multiply(descanso.local));
  }

  private actualizarCabeza(pose: (Vector3 | null)[]): void {
    const three = this.three!;
    const nodo = this.huesos.get('head');
    const descanso = this.descansos.get('head');
    if (!nodo || !nodo.parent || !descanso) return;
    // Ejes de la cara, independientes de la posición/profundidad del torso.
    const [ojoI, ojoD, orejaI, orejaD, bocaI, bocaD] = [2, 5, 7, 8, 9, 10].map((i) => pose[i]);
    if (!ojoI || !ojoD || !orejaI || !orejaD || !bocaI || !bocaD) {
      nodo.quaternion.slerp(descanso.local, .15);
      return;
    }
    const x = new three.Vector3().subVectors(orejaI, orejaD);
    const arriba = new three.Vector3().addVectors(ojoI, ojoD).sub(bocaI).sub(bocaD);
    const z = new three.Vector3().crossVectors(x, arriba);
    if (x.lengthSq() < 1e-6 || z.lengthSq() < 1e-8) return;
    x.normalize(); z.normalize();
    const y = new three.Vector3().crossVectors(z, x).normalize();
    const orientacion = new three.Quaternion().setFromRotationMatrix(new three.Matrix4().makeBasis(x, y, z));
    if (!this.referenciaCabeza) {
      this.referenciaCabeza = orientacion.clone();
      this.cabezaCalibrada.set(true);
    }
    const delta = orientacion.multiply(this.referenciaCabeza.clone().invert());
    // Límites conservadores para no convertir ruido de profundidad en giros extremos.
    const giro = new three.Euler().setFromQuaternion(delta, 'YXZ');
    giro.x = three.MathUtils.clamp(giro.x, -.6, .6);
    giro.y = three.MathUtils.clamp(giro.y, -.85, .85);
    giro.z = three.MathUtils.clamp(giro.z, -.45, .45);
    delta.setFromEuler(giro);
    const padre = new three.Quaternion();
    nodo.parent.getWorldQuaternion(padre);
    const objetivo = padre.clone().invert().multiply(delta).multiply(padre).multiply(descanso.local);
    nodo.quaternion.slerp(objetivo, .3);
  }

  private actualizar(fotograma: FotogramaAvatar): void {
    if (!this.escena || !this.renderer || !this.camara || !this.three || !this.vrm) return;
    const three = this.three;
    const pose = this.puntosDe(fotograma, 'pose');
    const izquierda = this.puntosDe(fotograma, 'izquierda');
    const derecha = this.puntosDe(fotograma, 'derecha');
    const centro = (a: Vector3 | null, b: Vector3 | null): Vector3 | null =>
      a && b ? new three.Vector3().addVectors(a, b).multiplyScalar(0.5) : (a ?? b);
    const hombros = centro(pose[11] ?? null, pose[12] ?? null);
    // La webcam encuadra el torso: no anima caderas/piernas inferidas fuera de campo.
    for (const nombre of ['hips', 'spine', 'chest', 'neck', 'leftUpperLeg', 'rightUpperLeg',
      'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot', 'leftToes', 'rightToes'] as VRMHumanBoneName[]) {
      const descanso = this.descansos.get(nombre);
      if (descanso) this.huesos.get(nombre)?.quaternion.copy(descanso.local);
    }
    this.actualizarCabeza(pose);

    // Brazos y hombros.
    this.apuntar('leftShoulder', hombros, pose[11] ?? null);
    this.apuntar('rightShoulder', hombros, pose[12] ?? null);
    this.apuntar('leftUpperArm', pose[11] ?? null, pose[13] ?? null);
    this.apuntar('rightUpperArm', pose[12] ?? null, pose[14] ?? null);
    this.apuntar('leftLowerArm', pose[13] ?? null, pose[15] ?? null);
    this.apuntar('rightLowerArm', pose[14] ?? null, pose[16] ?? null);

    // Manos y dedos.
    this.apuntarMano('left', izquierda);
    this.apuntarMano('right', derecha);
    this.apuntarDedos('left', izquierda);
    this.apuntarDedos('right', derecha);

    this.vrm.update(0.016);
    this.render();
  }

  private apuntarMano(lado: 'left' | 'right', mano: (Vector3 | null)[]): void {
    const three = this.three!;
    const muneca = mano[0];
    const nudillos = [mano[5], mano[9], mano[13], mano[17]];
    if (!muneca || nudillos.some((p) => !p)) {
      const descanso = this.descansos.get(`${lado}Hand` as VRMHumanBoneName);
      const nodo = this.huesos.get(`${lado}Hand` as VRMHumanBoneName);
      if (descanso && nodo) nodo.quaternion.slerp(descanso.local, .2);
      return;
    }
    const centroNudillos = new three.Vector3();
    for (const punto of nudillos) centroNudillos.add(punto!);
    centroNudillos.multiplyScalar(0.25);
    this.apuntar(`${lado}Hand` as VRMHumanBoneName, muneca, centroNudillos);

    const indice = mano[5]!;
    const menique = mano[17]!;
    const normal = new three.Vector3()
      .subVectors(indice, muneca)
      .cross(new three.Vector3().subVectors(menique, muneca));
    if (normal.length() < 1e-6) return;
    normal.normalize();
    // Misma definición índice × meñique que en la calibración del rig,
    // para ambas manos, sin invertir solo un lado.
    this.corregirRolPalma(lado, muneca, centroNudillos, normal);
  }

  private corregirRolPalma(
    lado: 'left' | 'right',
    muneca: Vector3,
    centroNudillos: Vector3,
    normalObjetivoMundo: Vector3,
  ): void {
    const three = this.three!;
    const nombre = `${lado}Hand` as VRMHumanBoneName;
    const nodo = this.huesos.get(nombre);
    const uLocal = this.uLocalPalma?.[lado];
    if (!nodo || !uLocal || !nodo.parent) return;
    nodo.updateWorldMatrix(true, false);
    const qPadre = new three.Quaternion();
    nodo.parent.getWorldQuaternion(qPadre);
    qPadre.invert();
    const eje = new three.Vector3().subVectors(centroNudillos, muneca).normalize().applyQuaternion(qPadre);
    const objetivo = normalObjetivoMundo.clone().applyQuaternion(qPadre);
    const actual = uLocal.clone().applyQuaternion(nodo.quaternion);
    const a = actual.clone().addScaledVector(eje, -actual.dot(eje)).normalize();
    const b = objetivo.clone().addScaledVector(eje, -objetivo.dot(eje)).normalize();
    if (a.length() < 1e-6 || b.length() < 1e-6) return;
    const angulo = Math.atan2(new three.Vector3().crossVectors(a, b).dot(eje), a.dot(b));
    const giro = new three.Quaternion().setFromAxisAngle(eje, angulo);
    nodo.quaternion.copy(giro.multiply(nodo.quaternion));
  }

  private apuntarDedos(lado: 'left' | 'right', mano: (Vector3 | null)[]): void {
    for (const dedo of DEDOS) {
      const [base, p1, p2, punta] = dedo.articulaciones;
      const prefijo = `${lado}${dedo.nombre}` as const;
      this.apuntar(`${prefijo}${dedo.segmentos[0]}` as VRMHumanBoneName, mano[base] ?? null, mano[p1] ?? null);
      this.apuntar(`${prefijo}${dedo.segmentos[1]}` as VRMHumanBoneName, mano[p1] ?? null, mano[p2] ?? null);
      this.apuntar(`${prefijo}${dedo.segmentos[2]}` as VRMHumanBoneName, mano[p2] ?? null, mano[punta] ?? null);
    }
  }
}
