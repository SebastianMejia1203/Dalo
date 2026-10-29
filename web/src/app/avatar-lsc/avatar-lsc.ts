import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type {
  AnimationClip,
  AnimationMixer,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

import { ModeloAvatarService } from './modelo-avatar';
import type { ConservadorCodos } from './volumen-codos';

type ModuloThree = typeof import('three');
type ModuloOrbit = typeof import('three/addons/controls/OrbitControls.js');

/** Punto [x, y, z] normalizado de MediaPipe, o `null` si no fue detectado. */
export type PuntoAvatar = [number, number, number];

export interface FotogramaAvatar {
  /** Relación ancho/alto de la cámara; ausente en secuencias del catálogo. */
  aspecto?: number;
  pose: (PuntoAvatar | null)[];
  manoIzquierda: (PuntoAvatar | null)[] | null;
  manoDerecha: (PuntoAvatar | null)[] | null;
}

export interface SecuenciaAvatar {
  version: number;
  id: string;
  nombre: string;
  fps: number;
  fotogramas: FotogramaAvatar[];
}

/** Valida datos desconocidos (JSON descargado) como secuencia de avatar. */
export function validarSecuencia(valor: unknown): SecuenciaAvatar | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const rec = valor as Record<string, unknown>;
  if (typeof rec['id'] !== 'string' || typeof rec['nombre'] !== 'string') return null;
  if (typeof rec['fps'] !== 'number' || !Number.isFinite(rec['fps']) || rec['fps'] <= 0) return null;
  if (!Array.isArray(rec['fotogramas']) || rec['fotogramas'].length === 0) return null;
  const fotogramas: FotogramaAvatar[] = [];
  for (const bruto of rec['fotogramas']) {
    if (typeof bruto !== 'object' || bruto === null) return null;
    const frame = bruto as Record<string, unknown>;
    const pose = validarPuntos(frame['pose']);
    if (!pose) return null;
    const manoIzquierda = frame['manoIzquierda'] === null ? null : validarPuntos(frame['manoIzquierda']);
    const manoDerecha = frame['manoDerecha'] === null ? null : validarPuntos(frame['manoDerecha']);
    if (manoIzquierda === undefined || manoDerecha === undefined) return null;
    fotogramas.push({ pose, manoIzquierda, manoDerecha });
  }
  return {
    version: typeof rec['version'] === 'number' ? rec['version'] : 1,
    id: rec['id'],
    nombre: rec['nombre'],
    fps: rec['fps'],
    fotogramas,
  };
}

function validarPuntos(valor: unknown): (PuntoAvatar | null)[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  const puntos: (PuntoAvatar | null)[] = [];
  for (const item of valor) {
    if (item === null) {
      puntos.push(null);
      continue;
    }
    if (!Array.isArray(item) || item.length !== 3) return undefined;
    const [x, y, z] = item as unknown[];
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
    puntos.push([x, y, z]);
  }
  return puntos;
}

function interpolarPunto(a: PuntoAvatar | null, b: PuntoAvatar | null, t: number): PuntoAvatar | null {
  if (!a) return b;
  if (!b) return a;
  // Suavizado cúbico (smootherstep en el tramo): mantiene los extremos y el
  // punto medio exactos, pero frena al llegar a cada fotograma clave. Así el
  // movimiento no "pica" en cada muestra de 30 fps y se ve más natural.
  const s = t * t * (3 - 2 * t);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

function interpolarGrupo(
  a: (PuntoAvatar | null)[] | null,
  b: (PuntoAvatar | null)[] | null,
  t: number,
): (PuntoAvatar | null)[] | null {
  if (!a) return b;
  if (!b) return a;
  return a.map((punto, i) => interpolarPunto(punto, b[i] ?? null, t));
}

/** Fotograma interpolado en una posición fraccionaria de la secuencia. */
export function fotogramaEn(secuencia: SecuenciaAvatar, posicion: number): FotogramaAvatar {
  const total = secuencia.fotogramas.length;
  const clamped = Math.min(Math.max(posicion, 0), total - 1);
  const base = Math.floor(clamped);
  const siguiente = Math.min(base + 1, total - 1);
  const t = clamped - base;
  const a = secuencia.fotogramas[base];
  if (t === 0 || base === siguiente) return a;
  const b = secuencia.fotogramas[siguiente];
  return {
    pose: interpolarGrupo(a.pose, b.pose, t) ?? a.pose,
    manoIzquierda: interpolarGrupo(a.manoIzquierda, b.manoIzquierda, t),
    manoDerecha: interpolarGrupo(a.manoDerecha, b.manoDerecha, t),
  };
}

/**
 * Los landmarks vienen normalizados por ancho (x, z) y por alto (y) sobre
 * videos de 640x360: hay que ponderar x/z por el aspecto para no estirar
 * la figura verticalmente.
 */
export const ASPECTO_FUENTE = 640 / 360;

export interface Encuadre3D {
  /** Centro entre hombros promedio, en coordenadas de landmark. */
  origen: PuntoAvatar;
  /** Factor para que el ancho de hombros mida ~0,85 unidades de mundo. */
  escala: number;
  /** Centro cabeza–cadera en mundo y altura de ese tramo. */
  centro: [number, number, number];
  altura: number;
}

function promedio(puntos: PuntoAvatar[]): PuntoAvatar {
  const suma = puntos.reduce<[number, number, number]>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  const n = Math.max(puntos.length, 1);
  return [suma[0] / n, suma[1] / n, suma[2] / n];
}

function centroDe(a: PuntoAvatar, b: PuntoAvatar): PuntoAvatar {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/** Encuadre: origen en los hombros y escala por su ancho promedio. */
export function calcularEncuadre(secuencia: SecuenciaAvatar): Encuadre3D {
  const hombros: PuntoAvatar[] = [];
  const caderas: PuntoAvatar[] = [];
  const narices: PuntoAvatar[] = [];
  let anchoHombros = 0;
  let conteoAncho = 0;
  for (const fotograma of secuencia.fotogramas) {
    const [hombroI, hombroD, caderaI, caderaD, nariz] = [
      fotograma.pose[11],
      fotograma.pose[12],
      fotograma.pose[23],
      fotograma.pose[24],
      fotograma.pose[0],
    ];
    if (hombroI && hombroD) {
      hombros.push(centroDe(hombroI, hombroD));
      anchoHombros += Math.hypot(
        (hombroI[0] - hombroD[0]) * ASPECTO_FUENTE,
        hombroI[1] - hombroD[1],
      );
      conteoAncho += 1;
    }
    if (caderaI && caderaD) caderas.push(centroDe(caderaI, caderaD));
    if (nariz) narices.push(nariz);
  }
  const origen = hombros.length > 0 ? promedio(hombros) : ([0.5, 0.4, 0] as PuntoAvatar);
  const ancho = conteoAncho > 0 ? anchoHombros / conteoAncho : 0.3;
  const escala = 0.85 / Math.max(ancho, 0.05);
  const aMundo = (p: PuntoAvatar): [number, number, number] => [
    (p[0] - origen[0]) * ASPECTO_FUENTE * escala,
    -(p[1] - origen[1]) * escala,
    -(p[2] - origen[2]) * ASPECTO_FUENTE * escala,
  ];
  const cabeza = narices.length > 0 ? aMundo(promedio(narices)) : ([0, 0.55, 0] as [number, number, number]);
  const cadera = caderas.length > 0 ? aMundo(promedio(caderas)) : ([0, -0.75, 0] as [number, number, number]);
  const centro: [number, number, number] = [
    (cabeza[0] + cadera[0]) / 2,
    (cabeza[1] + cadera[1]) / 2,
    (cabeza[2] + cadera[2]) / 2,
  ];
  return { origen, escala, centro, altura: Math.max(Math.abs(cabeza[1] - cadera[1]), 0.4) };
}

/** Contador para dar a cada instancia un id único de slider (evita duplicados). */
let siguienteIdAvatar = 0;

type EstadoAvatar = 'sin-datos' | 'cargando' | 'listo' | 'error';
type GrupoPuntos = 'pose' | 'izquierda' | 'derecha';

interface PuntosMundo {
  pose: (Vector3 | null)[];
  izquierda: (Vector3 | null)[];
  derecha: (Vector3 | null)[];
}

interface DescansoHueso {
  /** Dirección al hueso hijo en el espacio del padre, en reposo. */
  direccion: Vector3;
  /** Cuaternión local en reposo. */
  local: InstanceType<ModuloThree['Quaternion']>;
}

/** Hueso hijo principal de cada hueso que se anima (brazos, manos y dedos). */
const HIJO_PRINCIPAL: Partial<Record<VRMHumanBoneName, VRMHumanBoneName>> = {
  leftShoulder: 'leftUpperArm',
  rightShoulder: 'rightUpperArm',
  leftUpperArm: 'leftLowerArm',
  rightUpperArm: 'rightLowerArm',
  leftLowerArm: 'leftHand',
  rightLowerArm: 'rightHand',
  leftHand: 'leftMiddleProximal',
  rightHand: 'rightMiddleProximal',
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
 * Avatar 3D con el modelo VRM AvatarSample_1 (VRoid, CC0) sobre fondo
 * blanco. Solo se animan los brazos, manos y dedos: cada hueso se orienta
 * hacia la dirección del landmark correspondiente de la secuencia de
 * LSC-54. El torso, la cabeza y la parte inferior del cuerpo permanecen en
 * reposo. Sin validación lingüística; no reproduce expresión facial.
 */
@Component({
  selector: 'app-avatar-lsc',
  imports: [LucideAngularModule],
  templateUrl: './avatar-lsc.html',
  styleUrl: './avatar-lsc.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarLsc implements OnDestroy {
  readonly secuenciaUrl = input<string | null>(null);
  /**
   * Animación VRM (.vrma), independiente del archivo del avatar y del JSON
   * de landmarks. Cuando está presente tiene prioridad sobre secuenciaUrl.
   */
  readonly animacionUrl = input<string | null>(null);
  readonly nombre = input('');
  /**
   * Vista previa para listas (p. ej. Expresiones): sin autoplay ni
   * controles; la animación solo se reproduce mientras el cursor está
   * encima o el elemento tiene el foco.
   */
  readonly vistaPrevia = input(false);
  /** Permite que la galería controle un único reproductor reutilizable. */
  readonly previsualizacionActiva = input<boolean | null>(null);
  readonly vistaPreviaLista = output<boolean>();
  /**
   * Modo espejo en vivo: el avatar refleja los puntos del cuerpo que llegan
   * por `fotogramaEnVivo` (vista Señas → Español). No usa secuencia ni
   * animación y oculta los controles de reproducción.
   */
  readonly enVivo = input(false);
  readonly fotogramaEnVivo = input<FotogramaAvatar | null>(null);

  /** Fotogramas por segundo de referencia para mostrar el progreso .vrma. */
  readonly FPS_ANIMACION = 30;

  protected readonly estado = signal<EstadoAvatar>('sin-datos');
  protected readonly reproduciendo = signal(false);
  protected readonly posicion = signal(0);
  /** Velocidad de reproducción (0,25–2×). Señal + (change): mismo patrón que el video en Comunicador. */
  protected readonly velocidad = signal(1);
  protected readonly secuencia = signal<SecuenciaAvatar | null>(null);
  protected readonly sinWebgl = signal(false);
  protected readonly modeloListo = signal(false);
  protected readonly duracionAnimacion = signal(0);

  protected readonly modoAnimacion = computed(() => this.duracionAnimacion() > 0);
  /** Hay algo que mostrar: el lienzo se mantiene aunque `estado` cambie. */
  protected readonly tieneContenido = computed(
    () => this.secuencia() !== null || this.modoAnimacion() || this.enVivo(),
  );
  protected readonly totalFotogramas = computed(() =>
    this.modoAnimacion()
      ? Math.max(1, Math.round(this.duracionAnimacion() * this.FPS_ANIMACION))
      : (this.secuencia()?.fotogramas.length ?? 0),
  );
  protected readonly fotogramaActual = computed(() =>
    Math.min(Math.floor(this.posicion()) + 1, Math.max(this.totalFotogramas(), 1)),
  );
  /** Id único del slider de fotogramas (hay varias instancias en Expresiones). */
  protected readonly idSlider = `slider-avatar-${(siguienteIdAvatar += 1)}`;
  protected readonly idVelocidad = `velocidad-avatar-${siguienteIdAvatar}`;
  protected readonly hayFotogramas = computed(() => this.totalFotogramas() > 0);
  protected readonly alFinal = computed(
    () => this.hayFotogramas() && this.posicion() >= this.totalFotogramas() - 1,
  );
  protected readonly textoPosicion = computed(
    () => `Fotograma ${this.fotogramaActual()} de ${this.totalFotogramas()}`,
  );
  protected readonly etiquetaCanvas = computed(
    () => `Avatar 3D haciendo la seña ${this.nombre() || this.secuencia()?.nombre || ''}`.trim(),
  );

  private readonly lienzoRef = viewChild<ElementRef<HTMLCanvasElement>>('lienzoAvatar');
  private readonly modelos = inject(ModeloAvatarService);
  private rafId = 0;
  private rafRender = 0;
  private actualizandoControles = false;
  private destruido = false;
  private ultimoInstante = 0;
  private cargaId = 0;

  private three: ModuloThree | null = null;
  private lienzoRender: HTMLCanvasElement | null = null;
  private renderer: WebGLRenderer | null = null;
  private escena: Scene | null = null;
  private camara: PerspectiveCamera | null = null;
  private controles: OrbitControls | null = null;
  private vistaInicial: { posicion: Vector3; objetivo: Vector3 } | null = null;
  private vrm: VRM | null = null;
  private conservadorCodos: ConservadorCodos | null = null;
  private inicioEscena: Promise<void> | null = null;
  private encuadre: Encuadre3D | null = null;
  private huesos = new Map<VRMHumanBoneName, Object3D>();
  private descansos = new Map<VRMHumanBoneName, DescansoHueso>();
  /** Punto medio pecho/cara en reposo: hacia ahí se dirige el zoom. */
  private focoPechoCara: Vector3 | null = null;
  /** Distancia cámara–objetivo del encuadre inicial (avance 0 del zoom). */
  private distanciaEncuadre = 0;
  /** Última distancia vista: solo un cambio revela zoom (no giro ni paneo). */
  private distanciaZoom = 0;
  /** Eje "normal de la palma" en espacio local de cada hueso mano. */
  private uLocalPalma: { left: Vector3; right: Vector3 } | null = null;
  private reposoCapturado = false;
  /** Suavizado temporal: últimos puntos en mundo ya filtrados (EMA + tope). */
  private puntosFiltrados: PuntosMundo | null = null;
  /** Último ángulo de giro (roll) de cada muñeca: continuidad sin saltos. */
  private rollPrevio: { left: number; right: number } = { left: 0, right: 0 };
  /** Cuaternión previo por hueso: evita giros de 180° entre fotogramas. */
  private cuaternionPrevio = new Map<VRMHumanBoneName, InstanceType<ModuloThree['Quaternion']>>();
  private ultimoDelta = 0;
  private clip: AnimationClip | null = null;
  private mixer: AnimationMixer | null = null;
  /** La vista previa solo reproduce mientras el cursor está encima o tiene el foco. */
  private hoverActivo = false;

  constructor() {
    effect(() => this.vistaPreviaLista.emit(this.estado() === 'listo' && this.modeloListo()));
    effect(() => {
      const activa = this.previsualizacionActiva();
      if (!this.vistaPrevia() || activa === null) return;
      untracked(() => activa ? this.alEntrarCursor() : this.alSalirCursor());
    });
    effect(() => {
      const url = this.secuenciaUrl();
      const animacion = this.animacionUrl();
      if (this.enVivo()) return;
      void this.cargar(url, animacion);
    });
    effect(() => {
      const secuencia = this.secuencia();
      const posicion = this.posicion();
      const lienzo = this.lienzoRef()?.nativeElement ?? null;
      const animacionLista = this.modoAnimacion();
      if (!lienzo) return;
      if (animacionLista) {
        void this.asegurarEscena(lienzo).then(() => {
          if (this.vrm && this.mixer) {
            this.aplicarTiempoVrma();
          }
        });
      } else if (secuencia) {
        void this.asegurarEscena(lienzo).then(() => {
          if (this.vrm) this.actualizar(fotogramaEn(secuencia, posicion));
        });
      }
    });
    effect(() => {
      if (!this.enVivo()) return;
      const fotograma = this.fotogramaEnVivo();
      const lienzo = this.lienzoRef()?.nativeElement ?? null;
      if (!lienzo) return;
      void this.asegurarEscena(lienzo).then(() => {
        if (!this.vrm || !this.enVivo()) return;
        if (fotograma) this.actualizar(fotograma);
        else this.render();
      });
    });
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.detener();
    this.cargaId += 1;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.clip = null;
    this.liberarRender();
  }

  /**
   * Libera el renderer y su contexto WebGL. `dispose()` solo no alcanza:
   * sin `forceContextLoss()` el navegador mantiene el contexto activo y,
   * al navegar entre vistas, se agotan ("Too many active WebGL contexts").
   */
  private liberarRender(): void {
    if (this.rafRender) cancelAnimationFrame(this.rafRender);
    this.rafRender = 0;
    this.controles?.dispose();
    this.controles = null;
    const renderer = this.renderer;
    this.renderer = null;
    this.lienzoRender = null;
    if (renderer) {
      try {
        renderer.dispose();
      } catch {
        // La liberación es oportunista.
      }
      try {
        renderer.forceContextLoss();
      } catch {
        // La liberación es oportunista.
      }
    }
  }

  protected alternarReproduccion(): void {
    if (!this.hayFotogramas()) return;
    if (this.reproduciendo()) {
      this.detener();
      return;
    }
    if (this.posicion() >= this.totalFotogramas() - 1) this.posicion.set(0);
    this.iniciar();
  }

  protected repetir(): void {
    if (!this.hayFotogramas()) return;
    this.posicion.set(0);
    if (this.modoAnimacion()) {
      this.aplicarTiempoVrma();
    }
    this.iniciar();
  }

  /** Lee el <select> nativo (siempre cadena) y lo valida como número finito > 0. */
  protected cambiarVelocidad(evento: Event): void {
    const selector = evento.target as HTMLSelectElement | null;
    if (!selector) return;
    const valor = Number(selector.value);
    if (!Number.isFinite(valor) || valor <= 0) return;
    this.velocidad.set(valor);
  }

  /** Fija un fotograma (pausando) y lo dibuja de inmediato. */
  private fijarPosicion(nuevo: number): void {
    const total = this.totalFotogramas();
    if (total <= 0) return;
    this.detener();
    const recortado = Math.min(Math.max(Math.round(nuevo), 0), total - 1);
    this.posicion.set(recortado);
    if (this.modoAnimacion()) {
      this.aplicarTiempoVrma();
      return;
    }
    const secuencia = this.secuencia();
    // Al saltar, el filtro temporal parte del fotograma destino: la vista
    // paso a paso muestra la pose exacta, sin inercia del fotograma anterior.
    this.reiniciarSuavizado();
    if (secuencia && this.vrm) this.actualizar(fotogramaEn(secuencia, recortado));
  }

  protected pasoAnterior(): void {
    this.fijarPosicion(this.posicion() - 1);
  }

  protected pasoSiguiente(): void {
    this.fijarPosicion(this.posicion() + 1);
  }

  protected irAlInicio(): void {
    this.fijarPosicion(0);
  }

  protected irAlFinal(): void {
    this.fijarPosicion(this.totalFotogramas() - 1);
  }

  protected moverSlider(evento: Event): void {
    const entrada = evento.target as HTMLInputElement | null;
    if (!entrada) return;
    const valor = Number(entrada.value);
    if (!Number.isFinite(valor)) return;
    this.fijarPosicion(valor);
  }

  /** Vista previa: reproduce solo mientras el cursor está encima o tiene el foco. */
  protected alEntrarCursor(): void {
    if (!this.vistaPrevia()) return;
    this.hoverActivo = true;
    if (this.estado() !== 'listo') return;
    if (this.posicion() >= this.totalFotogramas() - 1) {
      this.posicion.set(0);
      if (this.modoAnimacion()) this.aplicarTiempoVrma();
    }
    this.iniciar();
  }

  /** Vista previa: al salir el cursor se pausa y vuelve al primer fotograma. */
  protected alSalirCursor(): void {
    if (!this.vistaPrevia()) return;
    this.hoverActivo = false;
    this.detener();
    this.posicion.set(0);
    if (this.modoAnimacion()) this.aplicarTiempoVrma();
  }

  /**
   * Fija el tiempo del clip .vrma y dibuja el fotograma resultante.
   * `setTime` pasa por `update` y three.js le vuelve a aplicar `timeScale`
   * (AnimationMixer.js: `update` multiplica por `timeScale`); sin neutralizar
   * la escala, a 2× el tiempo se duplicaría en cada fijado (termina al
   * instante) y a 0,5× se iría a cero (no se mueve). Por eso se fija con
   * escala 1 y se restaura después.
   */
  private aplicarTiempoVrma(): void {
    if (!this.mixer || !this.vrm || !this.modoAnimacion()) return;
    const escala = this.mixer.timeScale;
    this.mixer.timeScale = 1;
    this.mixer.setTime(this.posicion() / this.FPS_ANIMACION);
    this.mixer.timeScale = escala;
    this.mixer.update(0);
    this.vrm.update(this.ultimoDelta);
    this.render();
  }

  /** Acercan o alejan la cámara manteniendo el encuadre. */
  protected acercar(): void {
    this.dolly(0.8);
  }

  protected alejar(): void {
    this.dolly(1.25);
  }

  /** Giran la vista alrededor del avatar (15° por pulsación). */
  protected girarIzquierda(): void {
    this.girar(Math.PI / 12);
  }

  protected girarDerecha(): void {
    this.girar(-Math.PI / 12);
  }

  /** Desplaza la cámara en vertical sin rotar (mueve cámara y objetivo). */
  protected subirVista(): void {
    this.desplazarVista(0.1);
  }

  protected bajarVista(): void {
    this.desplazarVista(-0.1);
  }

  /** Vuelve al encuadre inicial de cintura para arriba. */
  protected restablecerVista(): void {
    const camara = this.camara;
    const vista = this.vistaInicial;
    if (!camara || !vista) return;
    camara.position.copy(vista.posicion);
    this.controles?.target.copy(vista.objetivo);
    this.render();
  }

  private dolly(factor: number): void {
    const camara = this.camara;
    const controles = this.controles;
    if (!camara || !controles) return;
    // Solo mueve la cámara: el objetivo lo ajusta `alinearFocoConZoom` ante
    // cada cambio de distancia, con la misma regla para la rueda, el
    // pellizco y los botones (hacia pecho/cara al acercar, al encuadre
    // inicial al alejar).
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

  private desplazarVista(dy: number): void {
    const camara = this.camara;
    const controles = this.controles;
    if (!camara || !controles) return;
    const referencia = this.vistaInicial?.objetivo.y ?? controles.target.y;
    const nuevoY = Math.min(Math.max(controles.target.y + dy, referencia - 1), referencia + 1);
    const delta = nuevoY - controles.target.y;
    controles.target.y = nuevoY;
    camara.position.y += delta;
    this.render();
  }

  private render(): void {
    if (this.destruido || this.rafRender) return;
    // Mouse, botones y animación comparten un dibujo por fotograma. La
    // inercia de OrbitControls continúa también con la animación pausada.
    this.rafRender = requestAnimationFrame(() => {
      this.rafRender = 0;
      this.actualizandoControles = true;
      let cambio = false;
      try {
        cambio = this.controles?.update() ?? false;
      } finally {
        this.actualizandoControles = false;
      }
      this.dibujarEscena();
      if (cambio && this.controles?.enableDamping) this.render();
    });
  }

  private dibujarEscena(): void {
    if (!this.escena || !this.renderer || !this.camara) return;
    this.conservadorCodos?.actualizar();
    this.renderer.render(this.escena, this.camara);
  }

  private async cargar(url: string | null, animacionUrl: string | null): Promise<void> {
    const id = ++this.cargaId;
    this.detener();
    this.mixer?.stopAllAction();
    if (!url && !animacionUrl) {
      this.posicion.set(0);
      this.secuencia.set(null);
      this.duracionAnimacion.set(0);
      this.clip = null;
      this.encuadre = null;
      this.estado.set('sin-datos');
      return;
    }
    // El lienzo anterior sigue visible mientras carga lo nuevo: el contenido
    // solo se sustituye al completar la carga (sin parpadeo al cambiar de
    // palabra). La plantilla muestra el lienzo mientras haya contenido.
    this.estado.set('cargando');
    try {
      // La animación .vrma tiene prioridad: reproduce el clip sobre el avatar.
      if (animacionUrl) {
        const animacion = await this.modelos.obtenerAnimacion(animacionUrl);
        if (id !== this.cargaId) return;
        const { vrm } = await this.modelos.obtenerModelo();
        if (id !== this.cargaId) return;
        this.posicion.set(0);
        this.secuencia.set(null);
        this.encuadre = null;
        this.reiniciarSuavizado();
        await this.prepararClip(animacion, vrm);
        if (id !== this.cargaId) return;
        this.estado.set('listo');
      } else if (url) {
        const datos: unknown = await this.modelos.obtenerSecuencia(url);
        if (id !== this.cargaId) return;
        const secuencia = validarSecuencia(datos);
        if (!secuencia) {
          if (id === this.cargaId) this.estado.set('error');
          return;
        }
        this.duracionAnimacion.set(0);
        this.clip = null;
        this.secuencia.set(secuencia);
        this.encuadre = calcularEncuadre(secuencia);
        this.posicion.set(0);
        this.reiniciarSuavizado();
        this.estado.set('listo');
      }
      const reducirMovimiento =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // La vista previa nunca reproduce sola: solo al pasar el cursor o enfocar.
      if (this.vistaPrevia()) {
        if (this.hoverActivo) this.iniciar();
        return;
      }
      if (!reducirMovimiento) this.iniciar();
    } catch {
      if (id === this.cargaId) this.estado.set('error');
    }
  }

  private async prepararClip(animacion: VRMAnimation, vrm: VRM): Promise<void> {
    const { createVRMAnimationClip } = await import('@pixiv/three-vrm-animation');
    const { three } = await this.modelos.obtenerModelo();
    if (!this.mixer) {
      this.mixer = new three.AnimationMixer(vrm.scene);
    }
    this.mixer.stopAllAction();
    // Parte de la pose de reposo para que la seña anterior no contamine la nueva.
    if (this.clip) this.mixer.uncacheClip(this.clip);
    vrm.humanoid.resetNormalizedPose();
    vrm.lookAt?.reset();
    this.clip = createVRMAnimationClip(animacion, vrm);
    this.mixer.clipAction(this.clip, vrm.scene).play();
    this.duracionAnimacion.set(this.clip.duration);
    this.aplicarTiempoVrma();
  }

  private iniciar(): void {
    if ((!this.secuencia() && !this.modoAnimacion()) || this.reproduciendo()) return;
    this.reproduciendo.set(true);
    this.ultimoInstante = performance.now();
    const paso = (ahora: number): void => {
      if (!this.reproduciendo()) return;
      const delta = (ahora - this.ultimoInstante) / 1000;
      this.ultimoInstante = ahora;
      this.ultimoDelta = Math.min(delta, 0.05);
      if (this.modoAnimacion() && this.mixer && this.vrm) {
        if (this.mixer.timeScale !== this.velocidad()) {
          this.mixer.timeScale = this.velocidad();
        }
        this.mixer.update(Math.min(delta, 0.05));
        this.posicion.set(this.mixer.time * this.FPS_ANIMACION);
        if (this.posicion() >= this.totalFotogramas() - 1) {
          this.posicion.set(this.totalFotogramas() - 1);
          this.detener();
          return;
        }
        this.rafId = requestAnimationFrame(paso);
        return;
      }
      const secuencia = this.secuencia();
      if (!secuencia) return;
      const siguiente = this.posicion() + delta * secuencia.fps * this.velocidad();
      if (siguiente >= secuencia.fotogramas.length - 1) {
        this.posicion.set(secuencia.fotogramas.length - 1);
        this.detener();
        return;
      }
      this.posicion.set(siguiente);
      this.rafId = requestAnimationFrame(paso);
    };
    this.rafId = requestAnimationFrame(paso);
  }

  private detener(): void {
    this.reproduciendo.set(false);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  // ---- Escena 3D con el modelo VRM ----

  private asegurarEscena(lienzo: HTMLCanvasElement): Promise<void> {
    if (this.vrm && this.lienzoRender === lienzo) return Promise.resolve();
    if (this.inicioEscena) return this.inicioEscena;
    this.inicioEscena = (async () => {
      try {
        // El modelo y los módulos vienen del servicio, que los precarga en
        // segundo plano al entrar a la página. El VRM y la escena son
        // compartidos: cada lienzo aporta su renderer y su cámara.
        const { three, orbitModulo, vrm, escena, conservadorCodos } = await this.modelos.obtenerModelo();
        if (this.destruido) return;
        // El VRM puede quedar posado por el clip anterior: se vuelve a la
        // pose de reposo antes de capturar huesos y encuadrar.
        vrm.humanoid.resetNormalizedPose();
        vrm.lookAt?.reset();
        this.three = three;
        this.vrm = vrm;
        this.escena = escena;
        this.conservadorCodos = conservadorCodos;
        this.construirEscena(three, orbitModulo, lienzo);
        this.modeloListo.set(true);
      } catch {
        this.sinWebgl.set(true);
      } finally {
        this.inicioEscena = null;
      }
    })();
    return this.inicioEscena;
  }

  private construirEscena(three: ModuloThree, orbitModulo: ModuloOrbit, lienzo: HTMLCanvasElement): void {
    // El <canvas> se recrea al cambiar de seña (la plantilla pasa por el
    // estado de carga): hay que re-enlazar el renderer al canvas nuevo.
    // La escena (luces y VRM) es la compartida del servicio: no se toca.
    // Se libera el renderer anterior con su contexto para no acumularlos.
    this.liberarRender();
    const renderer = new three.WebGLRenderer({ canvas: lienzo, antialias: true });
    renderer.setPixelRatio(this.vistaPrevia() ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(lienzo.width, lienzo.height, false);
    this.renderer = renderer;
    this.lienzoRender = lienzo;

    const camara = new three.PerspectiveCamera(32, lienzo.width / lienzo.height, 0.1, 100);
    this.camara = camara;

    const vrm = this.vrm;
    if (!vrm) throw new Error('Modelo 3D no disponible.');
    vrm.scene.updateMatrixWorld(true);

    this.capturarHuesos(vrm);
    this.encuadrarCamara(three, vrm);
    this.configurarControles(orbitModulo, lienzo);
  }

  /** Gira con arrastre, acerca con rueda o pellizca; los botones cubren el teclado. */
  private configurarControles(orbitModulo: ModuloOrbit, lienzo: HTMLCanvasElement): void {
    const camara = this.camara;
    if (!camara) return;
    const controles = new orbitModulo.OrbitControls(camara, lienzo);
    const distancia = this.vistaInicial
      ? camara.position.distanceTo(this.vistaInicial.objetivo)
      : 2;
    controles.target.copy(this.vistaInicial?.objetivo ?? new this.three!.Vector3(0, 0, 0));
    controles.enableDamping = true;
    controles.dampingFactor = 0.08;
    controles.minDistance = distancia * 0.4;
    controles.maxDistance = distancia * 3;
    controles.minPolarAngle = 0.2;
    controles.maxPolarAngle = Math.PI * 0.75;
    this.distanciaEncuadre = distancia;
    this.distanciaZoom = distancia;
    controles.addEventListener('change', () => {
      this.alinearFocoConZoom();
      if (!this.actualizandoControles) this.render();
    });
    this.controles = controles;
  }

  /**
   * Mantiene el mismo encuadre para la rueda, el pellizco y los botones: al
   * acercar, el objetivo viaja del encuadre inicial al pecho/cara; al
   * alejar, vuelve. Solo actúa si cambió la distancia, así girar o
   * desplazar la vista (que la conservan) no tocan el objetivo y se
   * preserva el paneo manual.
   */
  private alinearFocoConZoom(): void {
    const camara = this.camara;
    const controles = this.controles;
    const foco = this.focoPechoCara;
    const base = this.vistaInicial?.objetivo;
    if (!camara || !controles || !foco || !base) return;
    const distancia = camara.position.distanceTo(controles.target);
    if (Math.abs(distancia - this.distanciaZoom) <= Math.max(1e-4, this.distanciaZoom * 1e-3)) return;
    this.distanciaZoom = distancia;
    const recorrido = this.distanciaEncuadre - controles.minDistance;
    if (!(recorrido > 0)) return;
    const avance = Math.min(Math.max((this.distanciaEncuadre - distancia) / recorrido, 0), 1);
    const suavizado = avance * avance * (3 - 2 * avance);
    controles.target.copy(base).lerp(foco, suavizado);
  }

  private capturarHuesos(vrm: VRM): void {
    const three = this.three!;
    // La pose de reposo se captura una sola vez: el vrm se reutiliza entre
    // señas y recapturarla a mitad de una animación contaminaría la
    // referencia (direcciones, cuaterniones, foco y eje de la palma).
    if (this.reposoCapturado) {
      this.huesos.clear();
      const nombres = Object.keys(HIJO_PRINCIPAL) as VRMHumanBoneName[];
      for (const nombre of nombres) {
        const nodo = vrm.humanoid?.getNormalizedBoneNode(nombre);
        if (nodo) this.huesos.set(nombre, nodo);
      }
      return;
    }
    this.huesos.clear();
    this.descansos.clear();
    const nombres = Object.keys(HIJO_PRINCIPAL) as VRMHumanBoneName[];
    for (const nombre of nombres) {
      const nodo = vrm.humanoid?.getNormalizedBoneNode(nombre);
      if (nodo) this.huesos.set(nombre, nodo);
    }
    // Direcciones de reposo hacia el hueso hijo, en el espacio del padre.
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
      const direccion = posHijo
        .sub(posHueso)
        .normalize()
        .applyQuaternion(cuaternionPadre.invert());
      this.descansos.set(nombre, { direccion, local: nodo.quaternion.clone() });
    }
    // Falanges distales (sin hijo propio): continúan la dirección del padre.
    const sinHijo: Array<[VRMHumanBoneName, VRMHumanBoneName]> = [
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
    // Foco del zoom (pecho/cara) en la pose de reposo del modelo.
    const cuello = vrm.humanoid?.getNormalizedBoneNode('neck');
    const cabeza = vrm.humanoid?.getNormalizedBoneNode('head');
    if (cuello && cabeza) {
      const pCuello = new three.Vector3();
      const pCabeza = new three.Vector3();
      cuello.getWorldPosition(pCuello);
      cabeza.getWorldPosition(pCabeza);
      this.focoPechoCara = pCuello.lerp(pCabeza, 0.5);
    } else {
      this.focoPechoCara = null;
    }
    this.calibrarEjePalma(vrm);
    this.reposoCapturado = true;
  }

  /**
   * Calibra el eje "normal de la palma" en el espacio local de cada hueso
   * mano, a partir de la pose de reposo: cruz de la dirección de los dedos
   * (hacia el metacarpo medio) con la del pulgar. Verificado visualmente
   * con Ayuda y Hola: pulgares en el lado externo con las palmas al frente.
   */
  private calibrarEjePalma(vrm: VRM): void {
    const three = this.three!;
    const ejes = {} as { left: Vector3; right: Vector3 };
    for (const lado of ['left', 'right'] as const) {
      const mano = vrm.humanoid?.getNormalizedBoneNode(`${lado}Hand` as VRMHumanBoneName);
      const medio = vrm.humanoid?.getNormalizedBoneNode(`${lado}MiddleProximal` as VRMHumanBoneName);
      const pulgar = vrm.humanoid?.getNormalizedBoneNode(`${lado}ThumbProximal` as VRMHumanBoneName);
      if (!mano) continue;
      const pMano = new three.Vector3();
      const pMedio = new three.Vector3();
      const pPulgar = new three.Vector3();
      mano.getWorldPosition(pMano);
      medio?.getWorldPosition(pMedio);
      pulgar?.getWorldPosition(pPulgar);
      const normal = new three.Vector3()
        .subVectors(pMedio, pMano)
        .cross(new three.Vector3().subVectors(pPulgar, pMano));
      if (normal.length() < 1e-6) continue;
      const qMundo = new three.Quaternion();
      mano.getWorldQuaternion(qMundo);
      ejes[lado] = normal.normalize().applyQuaternion(qMundo.invert());
    }
    // Signo del modelo (dorso o palma): se ajusta tras verificación visual.
    const signoModelo = -1;
    if (ejes.left && ejes.right) {
      this.uLocalPalma = { left: ejes.left.multiplyScalar(signoModelo), right: ejes.right.multiplyScalar(signoModelo) };
    }
  }

  private encuadrarCamara(three: ModuloThree, vrm: VRM): void {
    if (!this.camara) return;
    const caja = new three.Box3().setFromObject(vrm.scene);
    const tamano = new three.Vector3();
    caja.getSize(tamano);
    // Encuadre de cintura para arriba: cabeza y manos con margen.
      const alturaVisible = tamano.y * (this.vistaPrevia() ? 0.72 : 0.6);
    const distancia = alturaVisible / 2 / Math.tan(((this.camara.fov / 2) * Math.PI) / 180);
    const centroX = caja.min.x + tamano.x / 2;
      const objetivo = new three.Vector3(centroX, caja.min.y + tamano.y * (this.vistaPrevia() ? 0.73 : 0.68), caja.min.z + tamano.z / 2);
    this.camara.position.set(centroX, objetivo.y, caja.max.z + distancia);
    this.camara.lookAt(objetivo);
    this.vistaInicial = { posicion: this.camara.position.clone(), objetivo };
  }

  // ---- Retargeting de landmarks a huesos ----

  private aVector(punto: PuntoAvatar): Vector3 {
    const three = this.three!;
    const encuadre = this.encuadre ?? { origen: [0.5, 0.4, 0] as PuntoAvatar, escala: 2 };
    return new three.Vector3(
      (punto[0] - encuadre.origen[0]) * ASPECTO_FUENTE * encuadre.escala,
      -(punto[1] - encuadre.origen[1]) * encuadre.escala,
      -(punto[2] - encuadre.origen[2]) * ASPECTO_FUENTE * encuadre.escala,
    );
  }

  private puntosDe(fotograma: FotogramaAvatar, grupo: GrupoPuntos): (Vector3 | null)[] {
    const crudos =
      grupo === 'pose' ? fotograma.pose : grupo === 'izquierda' ? fotograma.manoIzquierda : fotograma.manoDerecha;
    if (!crudos) return [];
    return crudos.map((punto) => (punto ? this.aVector(punto) : null));
  }

  /**
   * Filtro temporal de puntos en mundo: media móvil exponencial con tope de
   * salto. La pose (brazos) se suaviza más (alpha bajo = más inercia) y las
   * manos menos, para no "comerse" el giro rápido de la muñeca (más o menos).
   * Los saltos imposibles (>25 cm entre fotogramas vecinos, p. ej. el cambio
   * de signo de la normal en detecciones fallidas) se recortan en vez de
   * copiarse: así desaparecen los tirones sin aplanar la seña.
   */
  private filtrarGrupo(
    actual: (Vector3 | null)[],
    previo: (Vector3 | null)[] | undefined,
    alpha: number,
    topeSalto = 0.25,
  ): (Vector3 | null)[] {
    const three = this.three!;
    return actual.map((punto, i) => {
      const anterior = previo?.[i] ?? null;
      if (!punto) return anterior;
      if (!anterior) return punto.clone();
      const salto = new three.Vector3().subVectors(punto, anterior);
      const distancia = salto.length();
      const limitado =
        distancia > topeSalto ? anterior.clone().addScaledVector(salto.normalize(), topeSalto) : punto;
      return anterior.clone().lerp(limitado, alpha);
    });
  }

  /** Limpia la memoria del suavizado al cambiar de seña o saltar de fotograma. */
  private reiniciarSuavizado(): void {
    this.puntosFiltrados = null;
    this.rollPrevio = { left: 0, right: 0 };
    this.cuaternionPrevio.clear();
  }

  private apuntar(nombre: VRMHumanBoneName, desde: Vector3 | null, hacia: Vector3 | null): void {
    const three = this.three!;
    const nodo = this.huesos.get(nombre);
    const descanso = this.descansos.get(nombre);
    if (!nodo || !descanso || !nodo.parent) return;
    // Sin objetivo (mano perdida o segmento colapsado sin dirección): volver
    // con suavidad al reposo en vez de congelar la última pose.
    if (!desde || !hacia) {
      nodo.quaternion.slerp(descanso.local, 0.25);
      this.cuaternionPrevio.set(nombre, nodo.quaternion.clone());
      return;
    }
    const objetivo = new three.Vector3().subVectors(hacia, desde);
    // Los dedos colapsados en el JSON (puntos intermedios duplicados) dan
    // segmentos de longitud cero: no se apunta al vacío, se vuelve con
    // suavidad al reposo para no dejar el dedo torcido del fotograma anterior.
    if (objetivo.length() < 0.004) {
      nodo.quaternion.slerp(descanso.local, 0.25);
      return;
    }
    objetivo.normalize();
    nodo.updateWorldMatrix(true, false);
    const cuaternionPadre = new three.Quaternion();
    nodo.parent.getWorldQuaternion(cuaternionPadre);
    objetivo.applyQuaternion(cuaternionPadre.invert());
    const giro = new three.Quaternion().setFromUnitVectors(descanso.direccion, objetivo);
    const destino = giro.multiply(descanso.local.clone());
    // Continuidad: el cuaternión doble cubre la misma rotación con signo
    // opuesto; elegir el hemisferio cercano evita giros bruscos de 180°.
    const previo = this.cuaternionPrevio.get(nombre);
    if (previo && previo.dot(destino) < 0) {
      destino.set(-destino.x, -destino.y, -destino.z, -destino.w);
    }
    // Límite de velocidad angular por fotograma: los dedos pueden moverse
    // rápido al flexionarse, los brazos no. Así la flexión se ve decidida
    // pero sin tirones, y el brazo fluye.
    const esDedo = /Proximal|Intermediate|Distal|Metacarpal/.test(nombre);
    const pasoMaximo = esDedo ? 0.35 : 0.18;
    if (previo) {
      const angulo = previo.angleTo(destino);
      if (angulo > pasoMaximo && angulo > 1e-6) {
        nodo.quaternion.copy(previo).slerp(destino, pasoMaximo / angulo);
      } else {
        nodo.quaternion.copy(destino);
      }
    } else {
      nodo.quaternion.copy(destino);
    }
    this.cuaternionPrevio.set(nombre, nodo.quaternion.clone());
  }

  private actualizar(fotograma: FotogramaAvatar): void {
    if (!this.escena || !this.renderer || !this.camara || !this.three || !this.vrm) return;
    const three = this.three;
    const crudos: PuntosMundo = {
      pose: this.puntosDe(fotograma, 'pose'),
      izquierda: this.puntosDe(fotograma, 'izquierda'),
      derecha: this.puntosDe(fotograma, 'derecha'),
    };
    // Suavizado temporal antes del retargeting: brazos con más inercia,
    // manos más reactivas para conservar el giro de muñeca.
    const anterior = this.puntosFiltrados;
    const pose = this.filtrarGrupo(crudos.pose, anterior?.pose, 0.45);
    const izquierda = this.filtrarGrupo(crudos.izquierda, anterior?.izquierda, 0.65);
    const derecha = this.filtrarGrupo(crudos.derecha, anterior?.derecha, 0.65);
    this.puntosFiltrados = { pose, izquierda, derecha };
    const centro = (a: Vector3 | null, b: Vector3 | null): Vector3 | null =>
      a && b ? new three.Vector3().addVectors(a, b).multiplyScalar(0.5) : (a ?? b);
    // Torso, cabeza y parte inferior quedan en reposo: solo los hombros
    // sirven como referencia para apuntar los brazos.
    const hombros = centro(pose[11] ?? null, pose[12] ?? null);

    this.apuntar('leftShoulder', hombros, pose[11] ?? null);
    this.apuntar('rightShoulder', hombros, pose[12] ?? null);
    this.apuntar('leftUpperArm', pose[11] ?? null, pose[13] ?? null);
    this.apuntar('rightUpperArm', pose[12] ?? null, pose[14] ?? null);
    this.apuntar('leftLowerArm', pose[13] ?? null, pose[15] ?? null);
    this.apuntar('rightLowerArm', pose[14] ?? null, pose[16] ?? null);
    this.apuntarMano('left', izquierda);
    this.apuntarMano('right', derecha);
    this.apuntarDedos('left', izquierda);
    this.apuntarDedos('right', derecha);

    this.vrm.update(Math.max(this.ultimoDelta, 0.016));
    this.render();
  }

  /**
   * Orienta la mano en dos pasos: primero apunta el hueso desde la muñeca
   * hacia el centro de los nudillos (estable ante la flexión de los dedos)
   * y después corrige el giro (roll) alineando la normal de la palma del
   * modelo con la normal medida en los landmarks.
   */
  private apuntarMano(lado: 'left' | 'right', mano: (Vector3 | null)[]): void {
    const three = this.three!;
    const muneca = mano[0];
    const nudillos = [mano[5], mano[9], mano[13], mano[17]];
    if (!muneca || nudillos.some((p) => !p)) return;
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
    // Manos en espejo: con la palma al frente, el producto cruzado apunta
    // a la palma en la izquierda y al dorso en la derecha.
    if (lado === 'right') normal.negate();
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
    // Eje del hueso y normal objetivo, en espacio del padre.
    const eje = new three.Vector3().subVectors(centroNudillos, muneca).normalize().applyQuaternion(qPadre);
    const objetivo = normalObjetivoMundo.clone().applyQuaternion(qPadre);
    // Normal actual de la palma, en espacio del padre.
    const actual = uLocal.clone().applyQuaternion(nodo.quaternion);
    // Ángulo con signo alrededor del eje entre ambas proyecciones.
    const a = actual.clone().addScaledVector(eje, -actual.dot(eje));
    const b = objetivo.clone().addScaledVector(eje, -objetivo.dot(eje));
    if (a.length() < 1e-6 || b.length() < 1e-6) return;
    a.normalize();
    b.normalize();
    let angulo = Math.atan2(new three.Vector3().crossVectors(a, b).dot(eje), a.dot(b));
    // Continuidad del giro: desenvolver a [-pi, pi] respecto al fotograma
    // anterior y filtrar con respuesta rápida. Sin esto, el ruido de la
    // detección hace que la muñeca "tiemble" o se quede clavada; con un
    // filtrado lento, la oscilación de más-o-menos desaparecería. El alpha
    // alto (0.7) conserva los giros repetidos y recorta los picos atípicos.
    const previo = this.rollPrevio[lado];
    while (angulo - previo > Math.PI) angulo -= 2 * Math.PI;
    while (angulo - previo < -Math.PI) angulo += 2 * Math.PI;
    const filtrado = previo + (angulo - previo) * 0.7;
    // Tope anatómico de la muñeca ya verificado visualmente.
    const recortado = Math.min(Math.max(filtrado, -Math.PI * 0.47), Math.PI * 0.47);
    this.rollPrevio[lado] = recortado;
    const giro = new three.Quaternion().setFromAxisAngle(eje, recortado);
    const base = this.cuaternionPrevio.get(nombre) ?? nodo.quaternion.clone();
    nodo.quaternion.copy(giro.multiply(base));
    this.cuaternionPrevio.set(nombre, nodo.quaternion.clone());
  }

  private apuntarDedos(lado: 'left' | 'right', mano: (Vector3 | null)[]): void {
    // Sin mano detectada: llevar los dedos al reposo con suavidad en vez de
    // congelarlos en la última pose (evita manos "pegadas" al perder tracking).
    if (!mano || mano.length === 0) {
      for (const dedo of DEDOS) {
        const prefijo = `${lado}${dedo.nombre}` as const;
        for (const segmento of dedo.segmentos) {
          this.apuntar(`${prefijo}${segmento}` as VRMHumanBoneName, null, null);
        }
      }
      return;
    }
    for (const dedo of DEDOS) {
      const [base, p1, p2, punta] = dedo.articulaciones;
      const prefijo = `${lado}${dedo.nombre}` as const;
      this.apuntar(`${prefijo}${dedo.segmentos[0]}` as VRMHumanBoneName, mano[base] ?? null, mano[p1] ?? null);
      this.apuntar(`${prefijo}${dedo.segmentos[1]}` as VRMHumanBoneName, mano[p1] ?? null, mano[p2] ?? null);
      this.apuntar(`${prefijo}${dedo.segmentos[2]}` as VRMHumanBoneName, mano[p2] ?? null, mano[punta] ?? null);
    }
  }
}
